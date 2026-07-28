tsx
import { useMemo, useState } from 'react';
import { useAppDispatch } from '@/app/store';
import { addColor, removeColor } from '@/app/store/projectSlice';
import type { BeadColor, Project } from '@/shared/types';
import { v4 as uuidv4 } from 'uuid';

interface MaterialsPanelProps {
  project: Project;
}

const HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export default function MaterialsPanel({ project }: MaterialsPanelProps) {
  const dispatch = useAppDispatch();
  const [newColorName, setNewColorName] = useState('');
  const [newColorHex, setNewColorHex] = useState('#aabbcc');
  const [error, setError] = useState<string | null>(null);

  // colorMap w useMemo — tworzony ponownie tylko przy zmianie palety,
  // a nie przy każdym renderze komponentu.
  const colorMap = useMemo(
    () => new Map(project.palette.colors.map((color) => [color.id, color])),
    [project.palette.colors]
  );

  const usageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const colorId of Object.values(project.patternMap)) {
      counts.set(colorId, (counts.get(colorId) ?? 0) + 1);
    }
    return counts;
  }, [project.patternMap]);

  const handleAddColor = () => {
    const name = newColorName.trim();
    if (!name) {
      setError('Nazwa koloru jest wymagana.');
      return;
    }
    if (!HEX_PATTERN.test(newColorHex)) {
      setError('Nieprawidłowy format HEX (np. #abc lub #aabbcc).');
      return;
    }

    const color: BeadColor = { id: uuidv4(), name, hex: newColorHex };
    dispatch(addColor({ projectId: project.projectId, color }));
    setNewColorName('');
    setError(null);
  };

  const handleRemoveColor = (colorId: string) => {
    const used = usageCounts.get(colorId) ?? 0;
    if (used > 0) {
      setError(
        `Kolor „${colorMap.get(colorId)?.name ?? colorId}” jest używany przez ${used} koralików.`
      );
      return;
    }
    dispatch(removeColor({ projectId: project.projectId, colorId }));
    setError(null);
  };

  return (
    <section aria-label="Panel materiałów" className="materials-panel">
      <h2>Materiały</h2>

      <ul className="materials-panel__list">
        {project.palette.colors.map((color) => (
          <li key={color.id}>
            <span
              className="materials-panel__swatch"
              style={{ backgroundColor: color.hex }}
              aria-hidden="true"
            />
            <span>{color.name}</span>
            <code>{color.hex}</code>
            <span>{usageCounts.get(color.id) ?? 0} szt.</span>
            <button
              type="button"
              aria-label={`Usuń kolor ${color.name}`}
              onClick={() => handleRemoveColor(color.id)}
            >
              Usuń
            </button>
          </li>
        ))}
      </ul>

      <div className="materials-panel__add">
        <label htmlFor="material-name">Nazwa</label>
        <input
          id="material-name"
          value={newColorName}
          onChange={(event) => setNewColorName(event.target.value)}
          maxLength={80}
        />

        <label htmlFor="material-hex">Kolor HEX</label>
        <input
          id="material-hex"
          value={newColorHex}
          onChange={(event) => setNewColorHex(event.target.value)}
          maxLength={9}
        />

        <button type="button" onClick={handleAddColor}>
          Dodaj kolor
        </button>
      </div>

      {error ? (
        <p role="alert" className="materials-panel__error">
          {error}
        </p>
      ) : null}
    </section>
  );
}