tsx
import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/store';
import { setActiveProject } from '@/app/store/projectSlice';
import { ProjectionEngine } from '@/domain/projection/ProjectionEngine';

interface EditorLayoutProps {
  projectId: string;
}

export default function EditorLayout({ projectId }: EditorLayoutProps) {
  const dispatch = useAppDispatch();
  const project = useAppSelector((state) =>
    state.projects.projects.find((entry) => entry.projectId === projectId)
  );

  useEffect(() => {
    if (!project) {
      dispatch(setActiveProject(null));
    }
  }, [dispatch, project]);

  if (!project) {
    return null;
  }

  const handleBackToDashboard = () => {
    dispatch(setActiveProject(null));
  };

  const handleExportTexture = () => {
    const engine = new ProjectionEngine(project);
    const result = engine.project2D();
    const link = document.createElement('a');
    link.href = result.textureCanvas.toDataURL('image/png');
    link.download = `${project.name}-texture.png`;
    link.click();
  };

  return (
    <main className="editor-layout">
      <header className="editor-layout__header">
        <button type="button" onClick={handleBackToDashboard}>
          ← Powrót do projektów
        </button>
        <h1>{project.name}</h1>
        <button type="button" onClick={handleExportTexture}>
          Eksportuj teksturę PNG
        </button>
      </header>

      <section aria-label="Parametry ornamentu">
        <dl>
          <div>
            <dt>Średnica</dt>
            <dd>{project.ornamentSpec.diameterMm} mm</dd>
          </div>
          <div>
            <dt>Segmenty</dt>
            <dd>{project.ornamentSpec.segmentCount}</dd>
          </div>
          <div>
            <dt>Rzędy</dt>
            <dd>{project.ornamentSpec.segmentRows}</dd>
          </div>
          <div>
            <dt>Kolory</dt>
            <dd>{project.palette.colors.length}</dd>
          </div>
        </dl>
      </section>

      <section aria-label="Edytor wzoru">
        <p>
          Widok edycji segmentów i podgląd 3D są podłączone do projektu{' '}
          {project.projectId}.
        </p>
      </section>
    </main>
  );
}