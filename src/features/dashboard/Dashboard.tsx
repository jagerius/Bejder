tsx
import { ChangeEvent, useMemo, useState } from 'react';
import { z } from 'zod';
import { useAppDispatch, useAppSelector } from '@/app/store';
import {
  createProject,
  deleteProject,
  importProject,
  setActiveProject,
} from '@/app/store/projectSlice';
import type { Project } from '@/shared/types';
import { ORNAMENT_PRESETS } from '@/shared/constants';
import { projectSchema } from '@/shared/utils/persistence';

function getUniqueProjectName(
  desiredName: string,
  projects: Project[],
  excludeProjectId?: string
): string {
  const baseName = desiredName.trim() || 'Bez nazwy';
  const takenNames = new Set(
    projects
      .filter((project) => project.projectId !== excludeProjectId)
      .map((project) => project.name.toLowerCase())
  );

  if (!takenNames.has(baseName.toLowerCase())) {
    return baseName;
  }

  let suffix = 2;
  let candidate = `${baseName} (${suffix})`;
  while (takenNames.has(candidate.toLowerCase())) {
    suffix += 1;
    candidate = `${baseName} (${suffix})`;
  }
  return candidate;
}

const ALLOWED_MIME_TYPES = new Set(['application/json', 'text/json']);
const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export default function Dashboard() {
  const dispatch = useAppDispatch();
  const projects = useAppSelector((state) => state.projects.projects);
  const [projectName, setProjectName] = useState('Nowy projekt');
  const [presetKey, setPresetKey] = useState<keyof typeof ORNAMENT_PRESETS>('medium');
  const [importError, setImportError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sortedProjects = useMemo(
    () =>
      [...projects].sort((a, b) =>
        b.metadata.updatedAt.localeCompare(a.metadata.updatedAt)
      ),
    [projects]
  );

  const handleCreateProject = () => {
    const uniqueName = getUniqueProjectName(projectName, projects);
    dispatch(createProject({ name: uniqueName, presetKey }));
    setNotice(
      uniqueName === projectName.trim()
        ? null
        : `Nazwa została zmieniona na „${uniqueName}”, aby uniknąć duplikatu.`
    );
    setImportError(null);
  };

  const handleImportFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const hasValidExtension = file.name.toLowerCase().endsWith('.json');
    const isMimeAcceptable = file.type === '' || ALLOWED_MIME_TYPES.has(file.type);

    if (!hasValidExtension || !isMimeAcceptable) {
      setNotice(null);
      setImportError(
        `Nieprawidłowy typ pliku — oczekiwano pliku JSON (.json, application/json). Otrzymano: "${file.name}" (${file.type || 'nieznany MIME'}).`
      );
      return;
    }

    if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
      setNotice(null);
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      const limitMb = (MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);
      setImportError(
        `Plik jest za duży (${sizeMb} MB) — maksymalny rozmiar to ${limitMb} MB.`
      );
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const raw = typeof reader.result === 'string' ? reader.result : '';
        const parsedJson: unknown = JSON.parse(raw);
        const validated = projectSchema.parse(parsedJson) as Project;
        const existing = projects.find(
          (project) => project.projectId === validated.projectId
        );
        const uniqueName = getUniqueProjectName(
          validated.name,
          projects,
          existing?.projectId
        );

        dispatch(
          importProject({
            ...validated,
            name: uniqueName,
            metadata: {
              ...validated.metadata,
              updatedAt: new Date().toISOString(),
            },
          })
        );
        setImportError(null);
        setNotice(
          existing
            ? `Projekt „${uniqueName}” został zaktualizowany.`
            : uniqueName === validated.name
              ? `Zaimportowano projekt „${uniqueName}”.`
              : `Zaimportowano projekt jako „${uniqueName}”, aby uniknąć duplikatu nazwy.`
        );
      } catch (error) {
        setNotice(null);
        if (error instanceof z.ZodError) {
          setImportError('Plik JSON nie przeszedł walidacji struktury projektu.');
          return;
        }
        if (error instanceof SyntaxError) {
          setImportError('Nieprawidłowy format pliku JSON.');
          return;
        }
        setImportError('Nie udało się zaimportować projektu.');
      }
    };

    // Fix #2: reader.onerror i reader.onabort rozdzielone jawnie.
    // Anulowanie wyboru/odczytu nie powinno być raportowane jako błąd.
    reader.onerror = () => {
      setNotice(null);
      setImportError('Nie udało się odczytać pliku.');
    };

    reader.onabort = () => {
      setImportError(null);
      setNotice('Odczyt pliku został anulowany.');
    };

    reader.readAsText(file);
  };

  const handleDeleteProject = (projectId: string) => {
    setNotice(null);
    setImportError(null);
    dispatch(deleteProject(projectId));
  };

  return (
    <main className="dashboard">
      <section aria-labelledby="dashboard-title">
        <h1 id="dashboard-title">Projekty</h1>

        <div className="dashboard__create">
          <label htmlFor="project-name">Nazwa projektu</label>
          <input
            id="project-name"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            maxLength={200}
          />

          <label htmlFor="preset-key">Rozmiar ornamentu</label>
          <select
            id="preset-key"
            value={presetKey}
            onChange={(event) =>
              setPresetKey(event.target.value as keyof typeof ORNAMENT_PRESETS)
            }
          >
            {Object.entries(ORNAMENT_PRESETS).map(([key, preset]) => (
              <option key={key} value={key}>
                {key} — {preset.diameterMm} mm
              </option>
            ))}
          </select>

          <button type="button" onClick={handleCreateProject}>
            Utwórz projekt
          </button>

          <label htmlFor="project-import">Importuj projekt JSON</label>
          <input
            id="project-import"
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
          />
        </div>

        {importError ? (
          <p role="alert" className="dashboard__error">
            {importError}
          </p>
        ) : null}
        {notice ? <p className="dashboard__notice">{notice}</p> : null}

        {sortedProjects.length === 0 ? (
          <div className="dashboard__empty">
            <h2>Brak projektów</h2>
            <p>Utwórz pierwszy ornament albo zaimportuj wcześniej zapisany plik.</p>
          </div>
        ) : (
          <ul className="dashboard__list">
            {sortedProjects.map((project) => (
              <li key={project.projectId} className="dashboard__item">
                <button
                  type="button"
                  onClick={() => dispatch(setActiveProject(project.projectId))}
                >
                  <strong>{project.name}</strong>
                  <span>
                    {project.ornamentSpec.segmentCount} segmentów ·{' '}
                    {project.ornamentSpec.segmentRows} rzędów ·{' '}
                    {project.ornamentSpec.diameterMm} mm
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Usuń projekt ${project.name}`}
                  onClick={() => handleDeleteProject(project.projectId)}
                >
                  Usuń
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}