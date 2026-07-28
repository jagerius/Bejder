tsx
import React, { useMemo } from 'react';
import { useAppSelector } from '@/app/store';
import { countBeadsByColor } from '@/shared/utils/geometry';
import { validateProject } from '@/shared/utils/validation';

interface MaterialsPanelProps {
  projectId: string;
}

export default function MaterialsPanel({ projectId }: MaterialsPanelProps) {
  const project = useAppSelector((state) =>
    state.projects.projects.find((p) => p.projectId === projectId)
  );

  const beadCounts = useMemo(() => {
    if (!project) return {};
    return countBeadsByColor(project.segments, project.patternMap);
  }, [project?.patternMap, project?.segments]);

  const warnings = useMemo(() => {
    if (!project) return [];
    return validateProject(project);
  }, [project]);

  const totalBeads = useMemo(
    () => Object.values(beadCounts).reduce((a, b) => a + b, 0),
    [beadCounts]
  );

  if (!project) return null;

  const colorMap = new Map(project.palette.colors.map((c) => [c.id, c]));

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold mb-6">📋 Lista Materiałów (BOM)</h2>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="mb-6 space-y-2">
          {warnings.map((w, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                w.severity === 'error'
                  ? 'bg-red-900/40 text-red-300'
                  : w.severity === 'warning'
                  ? 'bg-yellow-900/40 text-yellow-300'
                  : 'bg-blue-900/40 text-blue-300'
              }`}
            >
              <span>
                {w.severity === 'error' ? '❌' : w.severity === 'warning' ? '⚠️' : 'ℹ️'}
              </span>
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-[#16213e] rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-[#e94560]">{totalBeads}</div>
          <div className="text-xs text-gray-400 mt-1">Koraliki łącznie</div>
        </div>
        <div className="bg-[#16213e] rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-[#e94560]">
            {project.palette.colors.length}
          </div>
          <div className="text-xs text-gray-400 mt-1">Kolory</div>
        </div>
        <div className="bg-[#16213e] rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-[#e94560]">
            {project.ornamentSpec.segmentCount}
          </div>
          <div className="text-xs text-gray-400 mt-1">Segmenty</div>
        </div>
      </div>

      {/* Per color table */}
      <div className="bg-[#16213e] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#0f3460] text-gray-300">
              <th className="text-left px-4 py-3">Kolor</th>
              <th className="text-left px-4 py-3">Kod</th>
              <th className="text-right px-4 py-3">Ilość</th>
              <th className="text-right px-4 py-3">%</th>
            </tr>
          </thead>
          <tbody>
            {project.palette.colors.map((color) => {
              const count = beadCounts[color.id] ?? 0;
              const pct = totalBeads > 0 ? ((count / totalBeads) * 100).toFixed(1) : '0.0';
              return (
                <tr key={color.id} className="border-t border-[#0f3460] hover:bg-[#1c2a50]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-5 h-5 rounded-full border border-white/20 shrink-0"
                        style={{ backgroundColor: color.hex }}
                      />
                      <span>{color.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                    {color.materialCode ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{count}</td>
                  <td className="px-4 py-3 text-right text-gray-400">{pct}%</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[#0f3460]/50 border-t border-[#0f3460]">
              <td className="px-4 py-3 font-semibold" colSpan={2}>
                RAZEM
              </td>
              <td className="px-4 py-3 text-right font-bold text-[#e94560]">
                {totalBeads}
              </td>
              <td className="px-4 py-3 text-right text-gray-400">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Row-by-row breakdown */}
      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-3">Instrukcja rzędami</h3>
        <div className="space-y-1">
          {project.segments[0] && Array.from(
            { length: project.segments[0].rows },
            (_, row) => {
              const beadsInRow = row + 1;
              return (
                <div
                  key={row}
                  className="flex items-center gap-3 bg-[#16213e] px-3 py-2 rounded text-sm"
                >
                  <span className="text-gray-500 w-16 shrink-0 font-mono text-xs">
                    Rząd {row + 1}:
                  </span>
                  <span className="text-gray-300">
                    {beadsInRow} koralik{beadsInRow === 1 ? '' : beadsInRow < 5 ? 'i' : 'ów'}
                  </span>
                  <div className="flex gap-0.5 ml-auto">
                    {project.segments[0].cells
                      .filter((c) => c.row === row)
                      .map((cell) => {
                        const colorId = project.patternMap[cell.id] ?? null;
                        const hex = colorId
                          ? (colorMap.get(colorId)?.hex ?? '#444')
                          : '#2a2a3e';
                        return (
                          <div
                            key={cell.id}
                            className="w-4 h-4 rounded-full border border-black/30"
                            style={{ backgroundColor: hex }}
                          />
                        );
                      })}
                  </div>
                </div>
              );
            }
          )}
        </div>
      </div>
    </div>
  );
}