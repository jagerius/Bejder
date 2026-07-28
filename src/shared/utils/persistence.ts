typescript
import { z } from 'zod';
import type { Project } from '@/shared/types';
import { FORMAT_VERSION, SCHEMA_VERSION } from '@/shared/constants';

const IDB_DB_NAME = 'bejder-projects';
const IDB_STORE_NAME = 'projects';
const IDB_VERSION = 1;

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

const beadColorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  hex: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/),
});

export const projectSchema = z.object({
  version: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  projectId: z.string().min(1),
  name: z.string().min(1).max(200),
  ornamentSpec: z.object({
    diameterMm: z.number().positive(),
    segmentCount: z.number().int().positive(),
    segmentRows: z.number().int().positive(),
    constructionType: z.string().min(1),
  }),
  palette: z.object({
    colors: z.array(beadColorSchema),
  }),
  segments: z.array(segmentSchema),
  patternMap: z.record(z.string(), z.string()),
  symmetry: z.object({
    mode: z.string().min(1),
    sourceSegmentId: z.string().nullable(),
  }),
  projectionConfig: z.object({
    type: z.string().min(1),
    resolution: z.number().int().positive(),
  }),
  metadata: z.object({
    author: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_DB_NAME, IDB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME, { keyPath: 'projectId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Nie udało się otworzyć IndexedDB'));
  });
}

function runTransaction<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  executor: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(IDB_STORE_NAME, mode);
    const store = transaction.objectStore(IDB_STORE_NAME);
    executor(store, resolve, reject);
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Błąd transakcji IndexedDB'));
  });
}

export async function saveProjectToIDB(project: Project): Promise<void> {
  const db = await openDatabase();
  try {
    await runTransaction<void>(db, 'readwrite', (store, resolve, reject) => {
      const request = store.put(project);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteProjectFromIDB(projectId: string): Promise<void> {
  const db = await openDatabase();
  try {
    await runTransaction<void>(db, 'readwrite', (store, resolve, reject) => {
      const request = store.delete(projectId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

// Fix #2: uszkodzone rekordy nie są już cicho pomijane — każdy jest raportowany
// przez console.warn (wraz z projectId, jeśli można go odczytać), co ułatwia
// diagnozowanie korupcji danych w IndexedDB
export async function loadProjectsFromIDB(): Promise<Project[]> {
  const db = await openDatabase();
  try {
    const records = await runTransaction<unknown[]>(db, 'readonly', (store, resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as unknown[]);
      request.onerror = () => reject(request.error);
    });

    const projects: Project[] = [];
    for (const record of records) {
      const result = projectSchema.safeParse(record);
      if (result.success) {
        projects.push(result.data as Project);
      } else {
        const projectId =
          typeof record === 'object' && record !== null && 'projectId' in record
            ? String((record as { projectId: unknown }).projectId)
            : '<unknown>';
        console.warn(
          `[persistence] Pominięto uszkodzony rekord projektu "${projectId}" z IndexedDB:`,
          result.error.issues
        );
      }
    }
    return projects;
  } finally {
    db.close();
  }
}

export function exportProjectToJSON(project: Project): string {
  return JSON.stringify(project, null, 2);
}

/**
 * Importuje projekt z ciągu JSON.
 *
 * Parsuje i waliduje strukturę projektu przy użyciu {@link projectSchema}.
 * Przy starszych wersjach formatu wykonuje migrację pól `version` i
 * `schemaVersion` do bieżących stałych {@link FORMAT_VERSION} / {@link SCHEMA_VERSION}.
 *
 * @param json - Surowy ciąg JSON zawierający zserializowany projekt.
 * @returns Zwalidowany i zmigrowany obiekt {@link Project}.
 * @throws {SyntaxError} Gdy `json` nie jest poprawnym dokumentem JSON.
 * @throws {z.ZodError} Gdy sparsowany obiekt nie przechodzi walidacji schematu projektu.
 */
export function importProjectFromJSON(json: string): Project {
  const parsed: unknown = JSON.parse(json);
  const validated = projectSchema.parse(parsed) as Project;

  if (
    validated.version !== FORMAT_VERSION ||
    validated.schemaVersion !== SCHEMA_VERSION
  ) {
    return {
      ...validated,
      version: FORMAT_VERSION,
      schemaVersion: SCHEMA_VERSION,
    };
  }

  return validated;
}

export function downloadProjectJSON(project: Project): void {
  const json = exportProjectToJSON(project);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  document.body.appendChild(link);
  try {
    link.href = url;
    link.download = `${project.name}.json`;
    link.click();
  } finally {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}