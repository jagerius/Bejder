typescript
import { z } from 'zod';
import type { Project } from '@/shared/types';

const DB_NAME = 'bejder';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
const MAX_OPEN_RETRIES = 1;

export const projectSchema = z.object({
  projectId: z.string(),
  name: z.string(),
  ornamentSpec: z.object({
    diameterMm: z.number(),
    segmentCount: z.number(),
    segmentRows: z.number(),
  }),
  palette: z.object({
    colors: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        hex: z.string(),
      })
    ),
  }),
  patternMap: z.record(z.string()),
  metadata: z.object({
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
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
        if (dbPromise) {
          dbPromise = null;
        }
      };

      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };

      resolve(db);
    };

    request.onerror = () => {
      reject(request.error ?? new Error('Nie udało się otworzyć IndexedDB.'));
    };

    request.onblocked = () => {
      reject(new Error('Otwarcie IndexedDB zostało zablokowane.'));
    };
  });
}

async function getDatabase(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDatabase();
  }

  try {
    return await dbPromise;
  } catch (error) {
    dbPromise = null;
    throw error;
  }
}

async function withDatabaseRetry<T>(
  operation: (db: IDBDatabase) => Promise<T>,
  retriesLeft = MAX_OPEN_RETRIES
): Promise<T> {
  const db = await getDatabase();

  try {
    return await operation(db);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'InvalidStateError' && retriesLeft > 0) {
      try {
        db.close();
      } catch {
        // noop
      }
      dbPromise = null;
      return withDatabaseRetry(operation, retriesLeft - 1);
    }
    throw error;
  }
}

function createTransaction(
  db: IDBDatabase,
  mode: IDBTransactionMode
): { transaction: IDBTransaction; store: IDBObjectStore } {
  const transaction = db.transaction(STORE_NAME, mode);
  const store = transaction.objectStore(STORE_NAME);
  return { transaction, store };
}

function runTransaction(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => IDBRequest<unknown>
): Promise<void> {
  const { transaction, store } = createTransaction(db, mode);

  return new Promise((resolve, reject) => {
    let settled = false;

    const finishResolve = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const finishReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const request = handler(store);

    request.onerror = () => {
      finishReject(request.error ?? new Error('Operacja na store nie powiodła się.'));
    };

    transaction.oncomplete = () => {
      finishResolve();
    };

    transaction.onerror = () => {
      finishReject(transaction.error ?? new Error('Transakcja IndexedDB nie powiodła się.'));
    };

    transaction.onabort = () => {
      finishReject(transaction.error ?? new Error('Transakcja IndexedDB została przerwana.'));
    };
  });
}

function runTransactionWithResult<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const { transaction, store } = createTransaction(db, mode);

  return new Promise((resolve, reject) => {
    let settled = false;
    let result: T | undefined;
    let hasResult = false;

    const finishResolve = () => {
      if (settled) return;
      settled = true;
      resolve(result as T);
    };

    const finishReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const request = handler(store);

    request.onsuccess = () => {
      result = request.result;
      hasResult = true;
    };

    request.onerror = () => {
      finishReject(request.error ?? new Error('Operacja na store nie powiodła się.'));
    };

    transaction.oncomplete = () => {
      if (!hasResult) {
        finishReject(new Error('Operacja zakończyła się bez wyniku.'));
        return;
      }
      finishResolve();
    };

    transaction.onerror = () => {
      finishReject(transaction.error ?? new Error('Transakcja IndexedDB nie powiodła się.'));
    };

    transaction.onabort = () => {
      finishReject(transaction.error ?? new Error('Transakcja IndexedDB została przerwana.'));
    };
  });
}

export async function loadProjects(): Promise<Project[]> {
  return withDatabaseRetry(async (db) => {
    const result = await runTransactionWithResult<unknown[]>(db, 'readonly', (store) =>
      store.getAll()
    );

    const projects: Project[] = [];
    for (const entry of result) {
      const parsed = projectSchema.safeParse(entry);
      if (parsed.success) {
        projects.push(parsed.data as Project);
      }
    }

    return projects.sort((a, b) =>
      b.metadata.updatedAt.localeCompare(a.metadata.updatedAt)
    );
  });
}

// Fix #5: przywrócono loadProjectsFromIDB() jako alias do loadProjects()
// dla kompatybilności wstecznej z istniejącymi call-site.
export async function loadProjectsFromIDB(): Promise<Project[]> {
  return loadProjects();
}

export async function saveProject(project: Project): Promise<void> {
  await withDatabaseRetry(async (db) => {
    await runTransaction(db, 'readwrite', (store) => store.put(project));
  });
}

export async function deleteProjectFromPersistence(projectId: string): Promise<void> {
  await withDatabaseRetry(async (db) => {
    await runTransaction(db, 'readwrite', (store) => store.delete(projectId));
  });
}

export function downloadProjectJSON(project: Project): void {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `${project.name || 'projekt'}.json`;
  document.body.appendChild(link);

  try {
    link.click();
  } finally {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

// Fix #1: przywrócono API kompatybilne wstecznie — eksport inicjujący pobranie pliku.
export function exportProjectToJSON(project: Project): void {
  downloadProjectJSON(project);
}

// Fix #4: importProjectJSON opakowuje JSON.parse w try/catch —
// nieprawidłowy JSON nie powoduje już nieopanowanego SyntaxError
export async function importProjectJSON(file: File): Promise<Project> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Nie udało się wczytać pliku: nieprawidłowy format JSON. ${error instanceof Error ? error.message : ''}`
    );
  }
  return projectSchema.parse(parsed) as Project;
}

export async function clearPersistence(): Promise<void> {
  await withDatabaseRetry(async (db) => {
    await runTransaction(db, 'readwrite', (store) => store.clear());
  });
}

export async function getProjectById(projectId: string): Promise<Project | null> {
  return withDatabaseRetry(async (db) => {
    const result = await runTransactionWithResult<unknown>(db, 'readonly', (store) =>
      store.get(projectId)
    );
    if (result == null) return null;
    return projectSchema.parse(result) as Project;
  });
}

export async function getDatabaseHandle(): Promise<IDBDatabase> {
  return getDatabase();
}

export async function runWithDatabaseRetry<T>(
  operation: (db: IDBDatabase) => Promise<T>
): Promise<T> {
  return withDatabaseRetry(operation);
}

export async function runRequestWithRetry<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return withDatabaseRetry(async (db) => runTransactionWithResult(db, mode, handler));
}