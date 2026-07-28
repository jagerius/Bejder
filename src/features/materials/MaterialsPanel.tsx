tsx
import { useMemo } from 'react';
import type { Project } from '@/shared/types';

interface MaterialsPanelProps {
  project: Project;
}

interface MaterialEntry {
  colorId: string;
  name: string;
  hex: string;
  count: number;
}

interface RowGroup {
  row: number;
  totalCells: number;
  coloredCells: number;
  colors: { colorId: string; name: string; hex: string; count: number }[];
}

export default function MaterialsPanel({ project }: MaterialsPanelProps) {
  const colorMap = useMemo(
    () => new Map(project.palette.colors.map((color) => [color.id, color])),
    [project.palette.colors]
  );

  // Fix #3: statystyki — łączna liczba koralików, pokolorowane, użyte kolory
  const stats = useMemo(() => {
    let totalBeads = 0;
    for (const segment of project.segments) {
      totalBeads += segment.cells.length;
    }
    const usedColorIds = new Set(Object.values(project.patternMap));
    return {
      totalBeads,
      coloredBeads: Object.keys(project.patternMap).length,
      usedColors: usedColorIds.size,
      totalColors: project.palette.colors.length,
    };
  }, [project.segments, project.patternMap, project.palette.colors]);

  // Fix #4: zastąpiono non-null assertion rowMap.get(cell.row)! bezpiecznym wzorcem
  const rowGroups = useMemo<RowGroup[]>(() => {
    const rowMap = new Map<number, { total: number; colorCounts: Map<string, number> }>();
    for (const segment of project.segments) {
      for (const cell of segment.cells) {
        let entry = rowMap.get(cell.row);
        if (!entry) {
          entry = { total: 0, colorCounts: new Map() };
          rowMap.set(cell.row, entry);
        }
        entry.total += 1;
        const colorId = project.patternMap[cell.id];
        if (colorId) {
          entry.colorCounts.set(colorId, (entry.colorCounts.get(colorId) ?? 0) + 1);
        }
      }
    }
    return Array.from(rowMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([row, { total, colorCounts }]) => {
        const coloredCells = Array.from(colorCounts.values()).reduce((s, c) => s + c, 0);
        const colors = Array.from(colorCounts.entries())
          .map(([colorId, count]) => {
            const color = colorMap.get(colorId);
            return color
              ? { colorId, name: color.name, hex: color.hex, count }
              : { colorId, name: colorId, hex: '#888', count };
          })
          .sort((a, b) => b.count - a.count);
        return { row, totalCells: total, coloredCells, colors };
      });
  }, [project.segments, project.patternMap, colorMap]);

  const bomEntries = useMemo<MaterialEntry[]>(() => {
    const counts = new Map<string, number>();
    for (const colorId of Object.values(project.patternMap)) {
      counts.set(colorId, (counts.get(colorId) ?? 0) + 1);
    }
    return project.palette.colors
      .map((color) => ({ colorId: color.id, name: color.name, hex: color.hex, count: counts.get(color.id) ?? 0 }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [project.palette.colors, project.patternMap]);

  return (
    <section aria-label="Panel materiałów" className="materials-panel">
      <h2>Materiały</h2>

      {/* Fix #3: podsumowanie statystyk */}
      <dl className="materials-panel__stats" aria-label="Statystyki projektu">
        <div>
          <dt>Koraliki ogółem</dt>
          <dd>{stats.totalBeads}</dd>
        </div>
        <div>
          <dt>Koraliki pokolorowane</dt>
          <dd>{stats.coloredBeads}</dd>
        </div>
        <div>
          <dt>Użytych kolorów</dt>
          <dd>{stats.usedColors} / {stats.totalColors}</dd>
        </div>
      </dl>

      <h3>Lista materiałów</h3>
      {bomEntries.length === 0 ? (
        <p>Brak pokolorowanych koralików.</p>
      ) : (
        <ul className="materials-panel__bom">
          {bomEntries.map((entry) => (
            <li key={entry.colorId} className="materials-panel__bom-item">
              <span
                className="materials-panel__swatch"
                style={{ backgroundColor: entry.hex }}
                aria-hidden="true"
              />
              <span>{entry.name}</span>
              <code>{entry.hex}</code>
              <span>{entry.count} szt.</span>
            </li>
          ))}
        </ul>
      )}

      {/* Fix #3: instrukcje rzędami */}
      <h3>Instrukcje rzędami</h3>
      <ol className="materials-panel__rows">
        {rowGroups.map((group) => (
          <li key={group.row} className="materials-panel__row">
            <header>
              <strong>Rząd {group.row + 1}</strong>
              <span>{group.coloredCells} / {group.totalCells} pokolorowanych</span>
            </header>
            {group.colors.length > 0 && (
              <ul className="materials-panel__row-colors">
                {group.colors.map((color) => (
                  <li key={color.colorId}>
                    <span
                      className="materials-panel__swatch"
                      style={{ backgroundColor: color.hex }}
                      aria-hidden="true"
                    />
                    {color.name} — {color.count} szt.
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}