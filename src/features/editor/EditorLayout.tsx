tsx
import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/store';
import { setActiveProject } from '@/app/store/projectSlice';
import { ProjectionEngine } from '@/domain/projection/ProjectionEngine';
import PatternEditor2D from '@/features/editor/PatternEditor2D';
import Viewer3D from '@/features/viewer3d/Viewer3D';
import MaterialsPanel from '@/features/materials/MaterialsPanel';
import ExportPanel from '@/features/export/ExportPanel';

// Fix #4: przywrócona pełna nawigacja zakładkowa
type TabId = 'pattern' | 'viewer3d' | 'materials' | 'export';

interface Tab {
  id: TabId;
  label: string;
}

const TABS: Tab[] = [
  { id: 'pattern', label: 'Wzór 2D' },
  { id: 'viewer3d', label: 'Podgląd 3D' },
  { id: 'materials', label: 'Materiały' },
  { id: 'export', label: 'Eksport' },
];

interface EditorLayoutProps {
  projectId: string;
}

export default function EditorLayout({ projectId }: EditorLayoutProps) {
  const dispatch = useAppDispatch();
  const project = useAppSelector((state) =>
    state.projects.projects.find((entry) => entry.projectId === projectId)
  );
  const [activeTab, setActiveTab] = useState<TabId>('pattern');

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

  // Fix #5: <a> podłączony do document.body przed .click() — wymagane w Firefox
  const handleExportTexture = () => {
    const engine = new ProjectionEngine(project);
    const result = engine.project2D();
    const link = document.createElement('a');
    link.href = result.textureCanvas.toDataURL('image/png');
    link.download = `${project.name}-texture.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

      {/* Fix #4: nawigacja zakładkowa z wszystkimi panelami */}
      <nav className="editor-layout__tabs" aria-label="Sekcje edytora">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`editor-layout__tab${activeTab === tab.id ? ' editor-layout__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="editor-layout__panel" role="tabpanel">
        {activeTab === 'pattern' && <PatternEditor2D project={project} />}
        {activeTab === 'viewer3d' && <Viewer3D project={project} />}
        {activeTab === 'materials' && <MaterialsPanel project={project} />}
        {activeTab === 'export' && <ExportPanel project={project} />}
      </div>
    </main>
  );
}