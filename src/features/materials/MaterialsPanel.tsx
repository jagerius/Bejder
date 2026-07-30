tsx
import { useMemo } from 'react';
import type { Project } from '@/shared/types';

interface MaterialsPanelProps {
  project: Project;
}

interface MaterialUsage {
  colorId: string;
  name: string;
  hex: string;
  count: number;
}

export default function MaterialsPanel({ project }: MaterialsPanelProps) {
  const materials = useMemo<MaterialUsage[]>(() => {
    const counts = new Map<string, number>();

    for (const colorId of Object.values(project.patternMap)) {
      counts.set(colorId, (counts.get(colorId) ?? 0) + 1);
    }

    return project.palette.colors
      .map((color) => ({
        colorId: color.id,
        name: color.name,
        hex: color.hex,
        count: counts.get(color.id) ?? 0,
      }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [project.palette.colors, project.patternMap]);

  const totalBeads = useMemo(
    () => materials.reduce((sum, item) => sum + item.count, 0),
    [materials]
  );

  return (
    <section className="materials-panel" aria-labelledby="materials-panel-title">
      <header className="materials-panel__header">
        <h2 id="materials-panel-title">Materiały</h2>
        <p>Podsumowanie użycia kolorów w bieżącym projekcie.</p>
      </header>

      <div className="materials-panel__summary">
        <strong>Łącznie koralików:</strong> {totalBeads}
      </div>

      {materials.length === 0 ? (
        <p className="materials-panel__empty">Brak pomalowanych koralików.</p>
      ) : (
        <ul className="materials-panel__list">
          {materials.map((item) => (
            <li key={item.colorId} className="materials-panel__item">
              <span
                className="materials-panel__swatch"
                aria-hidden="true"
                style={{ backgroundColor: item.hex }}
              />
              <span className="materials-panel__name">{item.name}</span>
              <code className="materials-panel__hex">{item.hex}</code>
              <span className="materials-panel__count">{item.count} szt.</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

Zmiana: Usunięto dosłowny tekst tsx z pierwszej linii pliku (artefakt generatora). Plik rozpoczyna się teraz prawidłowym importem.