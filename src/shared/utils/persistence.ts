typescript
import { z } from 'zod';
import type { Project } from '@/shared/types';
import { FORMAT_VERSION, SCHEMA_VERSION } from '@/shared/constants';

const DB_NAME = 'bejder-projects';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

const beadColorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  hex: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/),
});

const ornamentSpecSchema = z.object({
  diameterMm: z.number().positive(),
  segmentCount: z.number().int().positive(),
  segmentRows: z.number().int().positive(),
  constructionType: z.literal('triangular-modular'),
});

const beadCellSchema = z.object({
  id: z.string().min(1),
  row: z.number().int().nonnegative(),
  col: z.number().int().nonnegative(),
});

const segmentSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().nonnegative(),
  cells: z.array(beadCellSchema),
});

export const projectSchema = z.object({
  version: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  projectId: z.string().min(1),
  name: z.string().min(1).max(200),
  ornamentSpec: ornamentSpecSchema,
  palette: z.object({ colors: z.array(beadColorSchema) }),
  segments: z.array(segmentSchema),
  patternMap: z.record(z.string()),
  symmetry: z.object({
    mode: z.enum(['radial', 'mirror', 'free']),
    sourceSegmentId: z.string().nullable(),
  }),
  projectionConfig: z.object({
    type: z.literal('mercator'),
    resolution: z.number().int().positive(),
  }),
  metadata: z.object({
    author: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});

/**
 * Fix #3: serializacja projektu do JSON string.
 * Call-site, które potrzebują side-effect (pobranie pliku), powinny
 * używać downloadProjectJSON zamiast wywoływać exportProjectToJSON bez konsumpcji wyniku.
 */
export function exportProjectToJSON(project: Project): string {
  const validated = projectSchema.parse(project);
  return JSON.stringify(validated, null, 2);
}

/**
 * Pomocnik dla call-site oczekujących side-effect:
 * serializuje projekt i inicjuje pobranie pliku JSON w przeglądarce.
 */
export function downloadProjectJSON(project: Project): void {
  const json = exportProjectToJSON(project);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${project.name}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parsowanie i walidacja JSON — rzuca ZodError przy niezgodności struktury
 * oraz Error przy nieobsługiwanej wersji formatu lub schematu.
 */
export function importProjectFromJSON(raw: string): Project {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Nieprawidłowy format pliku JSON.');
  }

  const project = projectSchema.parse(parsed) as Project;

  if (project.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `Nieobsługiwana wersja schematu: ${project.schemaVersion} (obsługiwana: ${SCHEMA_VERSION}).`
    );
  }
  if (project.version !== FORMAT_VERSION) {
    throw new Error(`Nieobsługiwana wersja formatu: ${project.version}.`);
  }

  return project;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'projectId' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onclose = () => {
        dbPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error('Nie udało się otworzyć IndexedDB.'));
    };
    request.onblocked = () => {
      dbPromise = null;
      reject(new Error('Otwarcie IndexedDB zostało zablokowane.'));
    };
  });

  return dbPromise;
}

export async function saveProjectToIDB(project: Project): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(project);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error('Zapis projektu do IndexedDB nie powiódł się.'));
  });
}

export async function loadProjectFromIDB(projectId: string): Promise<Project | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(projectId);
    request.onsuccess = () => {
      const result: unknown = request.result;
      if (!result) {
        resolve(null);
        return;
      }
      const parsed = projectSchema.safeParse(result);
      resolve(parsed.success ? (parsed.data as Project) : null);
    };
    request.onerror = () =>
      reject(request.error ?? new Error('Odczyt projektu z IndexedDB nie powiódł się.'));
  });
}

/**
 * Fix #2: przywrócony eksport loadProjectsFromIDB —
 * ładuje wszystkie projekty z IndexedDB z walidacją Zod per rekord.
 * Rekordy nieprzechodzące walidacji są pomijane (nie powodują błędu całości).
 */
export async function loadProjectsFromIDB(): Promise<Project[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const results: unknown[] = request.result;
      const projects: Project[] = [];
      for (const result of results) {
        const parsed = projectSchema.safeParse(result);
        if (parsed.success) {
          projects.push(parsed.data as Project);
        }
      }
      resolve(projects);
    };
    request.onerror = () =>
      reject(request.error ?? new Error('Odczyt projektów z IndexedDB nie powiódł się.'));
  });
}

export async function deleteProjectFromIDB(projectId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(projectId);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error('Usunięcie projektu z IndexedDB nie powiodło się.'));
  });
}