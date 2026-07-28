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

// Fix #5: singleton — jedna instancja połączenia IDB współdzielona przez
// wszystkie operacje. Cache Promise eliminuje race condition przy równoległych
// wywołaniach (wszystkie czekają na to samo Promise zamiast otwierać
// równoległe połączenia). onblocked i onversionchange obsługują scenariusz
// aktualizacji wersji bazy w innej karcie przeglądarki.
let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(IDB_DB_NAME, IDB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME, { keyPath: 'projectId' });
      }
    };

    // Inna karta/okno trzyma starą wersję bazy — ostrzegamy w konsoli,
    // że upgrade jest zablokowany. Bez tego handleru request czekałby
    // w nieskończoność bez żadnej informacji zwrotnej.
    request.onblocked = () => {
      console.warn(
        '[persistence] IndexedDB upgrade zablokowany przez inne połączenie. Zamknij pozostałe karty aplikacji.'
      );
    };

    request.onsuccess = () => {
      const db = request.result;

      // Gdy inna karta inicjuje upgrade, zamykamy to połączenie,
      // aby nie blokować migracji — singleton jest resetowany,
      // kolejne wywołanie openDatabase() otworzy nowe połączenie.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
        console.warn(
          '[persistence] IndexedDB: wykryto zmianę wersji w innej karcie — połączenie zamknięte.'
        );
      };

      resolve(db);
    };

    request.onerror = () => {
      // Reset singletonu przy błędzie — pozwala na retry przy kolejnym wywołaniu
      dbPromise = null;
      reject(request.error ?? new Error('Nie udało się otworzyć IndexedDB'));
    };
  });

  return dbPromise;
}

// Fix #1: resolve() w transaction.oncomplete zamiast request.onsuccess —
// oncomplete gwarantuje, że wszystkie operacje w transakcji są zatwierdzone
// (flush do dysku). request.onsuccess dla readwrite oznacza jedynie, że
// request zakończył się bez błędu, ale transakcja może jeszcze być w toku.
// result przechwytywany jest w request.onsuccess dla operacji readonly.
function runTransaction<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  executor: (
    store: IDBObjectStore,
    setResult: (value: T) => void,
    reject: (reason?: unknown) => void
  ) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(IDB_STORE_NAME, mode);
    const store = transaction.objectStore(IDB_STORE_NAME);

    let result: T;

    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Błąd transakcji IndexedDB'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Transakcja IndexedDB została przerwana'));

    executor(store, (value) => { result = value; }, reject);
  });
}

export async function saveProjectToIDB(project: Project): Promise<void> {
  const db = await openDatabase();
  await runTransaction<void>(db, 'readwrite', (store, setResult, reject) => {
    const request = store.put(project);
    request.onsuccess = () => setResult(undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteProjectFromIDB(projectId: string): Promise<void> {
  const db = await openDatabase();
  await runTransaction<void>(db, 'readwrite', (store, setResult, reject) => {
    const request = store.delete(projectId);
    request.onsuccess = () => setResult(undefined);
    request.onerror = () => reject(request.error);
  });
}

// Fix #2: uszkodzone rekordy nie są już cicho pomijane — każdy jest raportowany
// przez console.warn (wraz z projectId, jeśli można go odczytać), co ułatwia
// diagnozowanie korupcji danych w IndexedDB
export async function loadProjectsFromIDB(): Promise<Project[]> {
  const db = await openDatabase();
  const records = await runTransaction<unknown[]>(db, 'readonly', (store, setResult, reject) => {
    const request = store.getAll();
    request.onsuccess = () => setResult(request.result as unknown[]);
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
}

// Fix #4: walidacja projectSchema przed serializacją — nieprawidłowy projekt
// rzuca ZodError zamiast eksportować uszkodzone dane bez ostrzeżenia
export function exportProjectToJSON(project: Project): string {
  const validated = projectSchema.parse(project);
  return JSON.stringify(validated, null, 2);
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
 * @throws {z.ZodError} Gdy `json` nie jest poprawnym dokumentem JSON
 *   lub gdy sparsowany obiekt nie przechodzi walidacji schematu projektu.
 */
// Fix #2: SyntaxError z JSON.parse opakowany w ZodError — spójne z JSDoc,
// który dokumentuje wyłącznie ZodError jako typ rzucanego błędu.
// Wywołujący może polegać na instanceof z.ZodError niezależnie od rodzaju błędu.
export function importProjectFromJSON(json: string): Project {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new z.ZodError([
      {
        code: 'custom',
        path: [],
        message: `Nieprawidłowy format JSON: ${error instanceof SyntaxError ? error.message : String(error)}`,
      },
    ]);
  }

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