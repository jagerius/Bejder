tsx
import React, { useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/store';
import {
  createProject,
  setActiveProject,
  deleteProject,
  importProject,
} from '@/app/store/projectSlice';
import { ORNAMENT_PRESETS } from '@/shared/constants';
import { importProjectFromJSON } from '@/shared/utils/persistence';
import type { OrnamentSize } from '@/shared/types';

export default function Dashboard() {
  const dispatch = useAppDispatch();
  const projects = useAppSelector((state) => state.projects.projects);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('Bombka 01');
  const [selectedSize, setSelectedSize] = useState<OrnamentSize>('medium');
  const fileRef = useRef<HTMLInputElement>(null);

  function handleCreate() {
    if (!newName.trim()) return;
    dispatch(
      createProject({ name: newName.trim(), presetKey: selectedSize })
    );
    setShowNew(false);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const project = await importProjectFromJSON(file);
      dispatch(importProject(project));
    } catch (err) {
      alert('Błąd importu pliku');
    }
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">
              🎄 Bead Ornament Designer
            </h1>
            <p className="text-gray-400 mt-1">
              Projektuj bombki z koralików
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              className="px-4 py-2 bg-[#0f3460] hover:bg-[#1a4f8a] rounded-lg text-sm transition"
            >
              📂 Importuj JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
            <button
              onClick={() => setShowNew(true)}
              className="px-4 py-2 bg-[#e94560] hover:bg-[#c73652] rounded-lg text-sm font-semibold transition"
            >
              + Nowy projekt
            </button>
          </div>
        </div>

        {showNew && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-[#16213e] rounded-xl p-6 w-96 shadow-2xl">
              <h2 className="text-xl font-bold mb-4">Nowa bombka</h2>
              <label className="block text-sm text-gray-400 mb-1">Nazwa projektu</label>
              <input
                className="w-full bg-[#0f3460] text-white rounded px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-[#e94560]"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <label className="block text-sm text-gray-400 mb-2">Rozmiar bombki</label>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {(['small', 'medium', 'large'] as OrnamentSize[]).map((size) => {
                  const preset = ORNAMENT_PRESETS[size];
                  const label = { small: 'Mała', medium: 'Średnia', large: 'Duża' }[size];
                  return (
                    <button
                      key={size}
                      onClick={() => setSelectedSize(size)}
                      className={`p-3 rounded-lg border text-sm transition ${
                        selectedSize === size
                          ? 'border-[#e94560] bg-[#e94560]/20 text-white'
                          : 'border-[#0f3460] text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      <div className="font-semibold">{label}</div>
                      <div className="text-xs mt-1 text-gray-400">
                        {preset.diameterMm}mm
                      </div>
                      <div className="text-xs text-gray-500">
                        {preset.segmentCount} seg. × {preset.segmentRows} rzędów
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowNew(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
                >
                  Anuluj
                </button>
                <button
                  onClick={handleCreate}
                  className="px-4 py-2 bg-[#e94560] hover:bg-[#c73652] rounded-lg text-sm font-semibold"
                >
                  Utwórz
                </button>
              </div>
            </div>
          </div>
        )}

        {projects.length === 0 ? (
          <div className="text-center py-24 text-gray-500">
            <div className="text-6xl mb-4">🎁</div>
            <p className="text-xl">Brak projektów. Utwórz nową bombkę!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.projectId}
                className="bg-[#16213e] rounded-xl p-5 cursor-pointer hover:bg-[#1c2a50] transition group border border-transparent hover:border-[#0f3460]"
                onClick={() => dispatch(setActiveProject(project.projectId))}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-white text-lg">
                      {project.name}
                    </h3>
                    <p className="text-gray-400 text-sm mt-1">
                      {project.ornamentSpec.diameterMm}mm ·{' '}
                      {project.ornamentSpec.segmentCount} segmentów ·{' '}
                      {project.ornamentSpec.segmentRows} rzędów
                    </p>
                    <p className="text-gray-600 text-xs mt-2">
                      {new Date(project.metadata.updatedAt).toLocaleDateString('pl')}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {project.palette.colors.slice(0, 5).map((c) => (
                      <div
                        key={c.id}
                        className="w-4 h-4 rounded-full border border-white/20"
                        style={{ backgroundColor: c.hex }}
                        title={c.name}
                      />
                    ))}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Usunąć projekt?'))
                      dispatch(deleteProject(project.projectId));
                  }}
                  className="mt-3 text-xs text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                >
                  🗑 Usuń
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}