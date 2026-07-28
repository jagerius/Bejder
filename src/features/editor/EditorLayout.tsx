tsx
import React, { useState } from 'react';
import { useAppSelector, useAppDispatch } from '@/app/store';
import { setActiveProject } from '@/app/store/projectSlice';
import LeftPanel from './LeftPanel';
import PatternEditor2D from './PatternEditor2D';
import Viewer3D from '../viewer3d/Viewer3D';
import MaterialsPanel from '../materials/MaterialsPanel';
import ExportPanel from '../export/ExportPanel';

type Tab = 'editor' | '3d' | 'materials' | 'export';

interface EditorLayoutProps {
  projectId: string;
}

export default function EditorLayout({ projectId }: EditorLayoutProps) {
  const dispatch = useAppDispatch();
  const project = useAppSelector((state) =>
    state.projects.projects.find((p) => p.projectId === projectId)
  );
  const [activeTab, setActiveTab] = useState<Tab>('editor');

  if (!project) return null;

  return (
    <div className="flex flex-col h-screen bg-[#1a1a2e] text-white overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#16213e] border-b border-[#0f3460] shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => dispatch(setActiveProject(''))}
            className="text-gray-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-[#0f3460] transition"
          >
            ← Dashboard
          </button>
          <span className="text-white font-semibold">{project.name}</span>
          <span className="text-gray-500 text-xs">
            {project.ornamentSpec.diameterMm}mm ·{' '}
            {project.ornamentSpec.segmentCount} seg
          </span>
        </div>
        <div className="flex gap-1">
          {(['editor', '3d', 'materials', 'export'] as Tab[]).map((tab) => {
            const labels: Record<Tab, string> = {
              editor: '✏️ Wzór',
              '3d': '🔮 3D',
              materials: '📋 Materiały',
              export: '📤 Eksport',
            };
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded text-sm transition ${
                  activeTab === tab
                    ? 'bg-[#e94560] text-white'
                    : 'text-gray-400 hover:text-white hover:bg-[#0f3460]'
                }`}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        <LeftPanel projectId={projectId} />

        <div className="flex flex-1 overflow-hidden">
          {activeTab === 'editor' && (
            <>
              <div className="flex-1 overflow-hidden">
                <PatternEditor2D projectId={projectId} />
              </div>
              <div className="w-80 shrink-0 border-l border-[#0f3460]">
                <Viewer3D projectId={projectId} />
              </div>
            </>
          )}
          {activeTab === '3d' && (
            <div className="flex-1">
              <Viewer3D projectId={projectId} fullscreen />
            </div>
          )}
          {activeTab === 'materials' && (
            <div className="flex-1 overflow-auto">
              <MaterialsPanel projectId={projectId} />
            </div>
          )}
          {activeTab === 'export' && (
            <div className="flex-1 overflow-auto">
              <ExportPanel projectId={projectId} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}