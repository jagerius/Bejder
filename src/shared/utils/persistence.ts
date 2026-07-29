typescript
import { z } from 'zod';
import type { Project } from '@/shared/types';

export const projectSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
  ornamentSpec: z.object({
    diameterMm: z.number().positive(),
    segmentCount: z.number().int().positive(),
    segmentRows: z.number().int().positive(),
  }),
  segments: z.array(z.object({
    id: z.string().min(1),
    cells: z.array(z.object({
      id: z.string().min(1),
      row: z.number().int().nonnegative(),
      col: z.number().int().nonnegative(),
    })),
  })),
  patternMap: z.record(z.string(), z.string()),
  palette: z.object({
    colors: z.array(z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      hex: z.string().min(1),
    })),
  }),
  metadata: z.object({
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});

const DB_NAME = 'bejder-db';
const DB_VERSION = 1;
const PROJECTS_STORE = 'projects';
// Fix #1: opóźnienie przed retry po InvalidStateError — połączenie może
// wymagać krótkiej chwili na ponowne otwarcie po zamknięciu przez GC
const RETRY_DELAY_MS = 150;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        db.createObjectStore(PROJECTS_STORE, { keyPath: 'projectId' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // Fix #5: db.onerror — safety net dla błędów nieobsłużonych per-request
      // lub per-transaction (np. błąd dysku, przekroczenie quoty poza aktywnym
      // request, błąd wewnętrzny silnika IDB). NIE jest to główny handler błędów —
      // IndexedDB propaguje błędy per-request (request.onerror) i per-transaction
      // (transaction.onerror), które są obsługiwane w poszczególnych operacjach.
      // Ten handler łapie wyłącznie błędy, które nie trafiły do żadnego request.
      db.onerror = (event) => {
        console.error('[persistence] Nieobsłużony błąd IndexedDB:', event);
      };
      resolve(db);
    };

    request.onerror = () => {
      reject(request.error ?? new Error('Nie udało się otworzyć IndexedDB'));
    };

    request.onblocked = () => {
      reject(new Error('IndexedDB zablokowane — zamknij inne karty z aplikacją'));
    };
  });
}

// Fix #1: withRetry — automatyczny retry po InvalidStateError.
// InvalidStateError występuje gdy połączenie IDB zostało zamknięte przez
// Garbage Collector lub przez onupgradeneeded w innej karcie, a operacja
// próbowała użyć martwego połączenia. Jedna próba ponowna po RETRY_DELAY_MS
// wystarcza w praktyce; jeśli błąd się powtórzy, jest propagowany do caller.
//
// Fix #2: let result!: T — definite assignment assertion wymagana przy
// strictNullChecks / --strict w tsconfig; TS nie widzi, że ścieżka bez
// przypisania kończy się throw, więc deklarujemy to jawnie.
async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  // Fix #2: definite assignment assertion (!) — result jest zawsze przypisane
  // przed return, bo ścieżka bez przypisania kończy się throw; bez ! TS
  // zgłasza błąd "used before being assigned" przy rygorystycznym tsconfig
  let result!: T;
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      result = await operation();
      return result;
    } catch (error) {
      lastError = error;
      const isInvalidState =
        error instanceof DOMException && error.name === 'InvalidStateError';
      // Retry tylko po InvalidStateError i tylko przy pierwszej próbie
      if (!isInvalidState || attempt === 1) {
        throw error;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  // Nieosiągalne przy poprawnej logice pętli, ale TS wymaga ścieżki końcowej
  throw lastError ?? new Error('withRetry: nieoczekiwany błąd');
}

// Fix #1: saveProjectToDB owinięte przez withRetry — InvalidStateError
// (martwe połączenie) powoduje automatyczną próbę ponowną zamiast natychmiastowego
// błędu z komunikatem "spróbuj ponownie" bez mechanizmu ponowienia
export async function saveProjectToDB(project: Project): Promise<void> {
  return withRetry(async () => {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PROJECTS_STORE, 'readwrite');
      const store = tx.objectStore(PROJECTS_STORE);
      const request = store.put(project);

      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(request.error ?? new Error('Nie udało się zapisać projektu'));
      tx.onerror = () =>
        reject(tx.error ?? new Error('Błąd transakcji zapisu'));
    });
  });
}

// Fix #1: loadProjectsFromDB owinięte przez withRetry — automatyczny retry
// po InvalidStateError zamiast natychmiastowego błędu bez mechanizmu ponowienia
export async function loadProjectsFromDB(): Promise<Project[]> {
  return withRetry(async () => {
    const db = await openDB();
    return new Promise<Project[]>((resolve, reject) => {
      const tx = db.transaction(PROJECTS_STORE, 'readonly');
      const store = tx.objectStore(PROJECTS_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const raw = request.result as unknown[];
        const projects: Project[] = [];
        for (const item of raw) {
          const parseResult = projectSchema.safeParse(item);
          if (parseResult.success) {
            projects.push(parseResult.data as Project);
          }
        }
        resolve(projects);
      };
      request.onerror = () =>
        reject(request.error ?? new Error('Nie udało się wczytać projektów'));
      tx.onerror = () =>
        reject(tx.error ?? new Error('Błąd transakcji odczytu'));
    });
  });
}

// Fix #1: deleteProjectFromDB owinięte przez withRetry — automatyczny retry
// po InvalidStateError zamiast natychmiastowego błędu bez mechanizmu ponowienia
export async function deleteProjectFromDB(projectId: string): Promise<void> {
  return withRetry(async () => {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PROJECTS_STORE, 'readwrite');
      const store = tx.objectStore(PROJECTS_STORE);
      const request = store.delete(projectId);

      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(request.error ?? new Error('Nie udało się usunąć projektu'));
      tx.onerror = () =>
        reject(tx.error ?? new Error('Błąd transakcji usuwania'));
    });
  });
}

export function downloadProjectJSON(project: Project): void {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${project.name}.json`;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}