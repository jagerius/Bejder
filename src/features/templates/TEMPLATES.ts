typescript
import type { BeadColor, PatternMap, Project, Segment } from '@/shared/types';
import { cellKey } from '@/shared/utils/geometry';

/**
 * Szablony używają aliasów kolorów ('primary', 'accent' itd.) zamiast
 * hardkodowanych ID ('c1', 'c2'...). Aliasy są rozwiązywane na rzeczywiste
 * ID z palety projektu w momencie aplikacji szablonu — dzięki temu szablon
 * działa z każdą paletą użytkownika.
 */
export type TemplateColorAlias = 'primary' | 'secondary' | 'accent' | 'background';

export interface TemplateCell {
  row: number;
  col: number;
  color: TemplateColorAlias;
}

export interface PatternTemplate {
  id: string;
  name: string;
  description: string;
  cells: TemplateCell[];
}

export const TEMPLATES: PatternTemplate[] = [
  {
    id: 'diagonal-stripe',
    name: 'Ukośny pas',
    description: 'Jednolity pas biegnący po przekątnej segmentu.',
    cells: [
      { row: 0, col: 0, color: 'primary' },
      { row: 1, col: 1, color: 'primary' },
      { row: 2, col: 1, color: 'accent' },
      { row: 2, col: 2, color: 'primary' },
      { row: 3, col: 2, color: 'accent' },
      { row: 3, col: 3, color: 'primary' },
    ],
  },
  {
    id: 'chevron',
    name: 'Szewron',
    description: 'Symetryczny wzór jodełki w dwóch kolorach.',
    cells: [
      { row: 0, col: 0, color: 'accent' },
      { row: 1, col: 0, color: 'primary' },
      { row: 1, col: 1, color: 'primary' },
      { row: 2, col: 0, color: 'secondary' },
      { row: 2, col: 2, color: 'secondary' },
      { row: 3, col: 0, color: 'primary' },
      { row: 3, col: 3, color: 'primary' },
      { row: 4, col: 0, color: 'accent' },
      { row: 4, col: 4, color: 'accent' },
    ],
  },
  {
    id: 'dot-grid',
    name: 'Siatka kropek',
    description: 'Kropki akcentowe na jednolitym tle.',
    cells: [
      { row: 0, col: 0, color: 'accent' },
      { row: 2, col: 0, color: 'accent' },
      { row: 2, col: 2, color: 'accent' },
      { row: 4, col: 1, color: 'accent' },
      { row: 4, col: 3, color: 'accent' },
    ],
  },
];

/**
 * Rozwiązuje alias koloru na rzeczywisty BeadColor z palety projektu.
 * Kolejność fallbacków gwarantuje, że szablon zawsze znajdzie kolor,
 * o ile paleta nie jest pusta.
 */
function resolveAlias(
  alias: TemplateColorAlias,
  palette: BeadColor[],
  fallbackIndex: number
): BeadColor | null {
  const byIndex: Record<TemplateColorAlias, number> = {
    primary: 0,
    secondary: 1,
    accent: 2,
    background: 3,
  };
  return (
    palette[byIndex[alias]] ??
    palette[fallbackIndex % Math.max(palette.length, 1)] ??
    palette[0] ??
    null
  );
}

/**
 * Aplikuje szablon na wskazany segment projektu.
 * ID kolorów są brane z palety projektu (resolveAlias), nie z szablonu.
 * Zwraca nowy PatternMap — komórki spoza szablonu pozostają bez zmian.
 */
export function applyTemplate(
  project: Project,
  template: PatternTemplate,
  segment: Segment
): PatternMap {
  const palette = project.palette.colors;
  if (palette.length === 0) return { ...project.patternMap };

  const cellsByKey = new Map(
    segment.cells.map((cell) => [cellKey(cell.row, cell.col), cell])
  );

  const next: PatternMap = { ...project.patternMap };

  template.cells.forEach((templateCell, index) => {
    const cell = cellsByKey.get(cellKey(templateCell.row, templateCell.col));
    if (!cell) return;
    const color = resolveAlias(templateCell.color, palette, index);
    if (!color) return;
    next[cell.id] = color.id;
  });

  return next;
}

Podsumowanie wprowadzonych poprawek:

geometry.ts — floodFill O(n²) — lookup komórek odbywa się teraz wyłącznie przez Mapy cellsById/cellsByKey (O(1)); cała funkcja ma złożoność O(n), bez cells.filter w pętli.

geometry.ts — applyRadialSymmetry O(n²) — komórki źródłowe są indeksowane raz w Mapie sourceByKey (klucz row:col), więc każda komórka docelowa znajduje odpowiednik w O(1) zamiast cells.find w pętli; całość O(n).

persistence.ts — brak walidacji Zod — dodano pełny projectSchema (Zod) używany w importProjectFromJSON, a także w exportProjectToJSON i przy odczycie z IDB; dodatkowo sprawdzane są schemaVersion i FORMAT_VERSION.

persistence.ts — race condition w openDB — singleton zastąpiony cache'owanym Promise<IDBDatabase>: równoległe wywołania dzielą jedno otwarcie bazy; po onclose/onversionchange/błędzie cache jest czyszczony, więc kolejne wywołania otwierają połączenie ponownie.

TEMPLATES.ts — hardkodowane ID c1–c4 — szablony używają teraz aliasów (primary/secondary/accent/background), które applyTemplate rozwiązuje na rzeczywiste ID z palety aktywnego projektu z bezpiecznymi fallbackami.