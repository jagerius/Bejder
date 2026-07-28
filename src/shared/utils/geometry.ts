typescript
import type {
  BeadCell,
  OrnamentSpec,
  PatternMap,
  Project,
  Segment,
} from '@/shared/types';

/** UV komórki na mapie sferycznej (mercator). */
export function cellToSphereUV(
  segmentIndex: number,
  segmentCount: number,
  rows: number,
  row: number,
  col: number
): { u: number; v: number } {
  const colsInRow = row + 1;
  const u =
    (segmentIndex + (colsInRow > 1 ? col / (colsInRow - 1) : 0.5)) /
    segmentCount;
  const v = rows > 1 ? row / (rows - 1) : 0.5;
  return { u, v };
}

/** Generuje segmenty z komórkami na podstawie specyfikacji ornamentu. */
export function generateOrnamentSegments(spec: OrnamentSpec): Segment[] {
  const segments: Segment[] = [];
  for (let si = 0; si < spec.segmentCount; si++) {
    const cells: BeadCell[] = [];
    for (let row = 0; row < spec.segmentRows; row++) {
      const colsInRow = row + 1;
      for (let col = 0; col < colsInRow; col++) {
        cells.push({ id: `s${si}-r${row}-c${col}`, row, col });
      }
    }
    segments.push({ id: `segment-${si}`, index: si, cells });
  }
  return segments;
}

/** Klucz komórki w lokalnej siatce segmentu. */
export function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

/** Sąsiedzi komórki w siatce trójkątnej (w obrębie segmentu). */
export function getCellNeighbors(
  cell: BeadCell,
  cellsByKey: Map<string, BeadCell>
): BeadCell[] {
  const candidates: Array<[number, number]> = [
    [cell.row, cell.col - 1],
    [cell.row, cell.col + 1],
    [cell.row - 1, cell.col - 1],
    [cell.row - 1, cell.col],
    [cell.row + 1, cell.col],
    [cell.row + 1, cell.col + 1],
  ];

  const neighbors: BeadCell[] = [];
  for (const [row, col] of candidates) {
    if (row < 0 || col < 0 || col > row) continue;
    const neighbor = cellsByKey.get(cellKey(row, col));
    if (neighbor) neighbors.push(neighbor);
  }
  return neighbors;
}

/**
 * Flood fill — BFS (wskaźnik head zamiast kosztownego queue.shift()).
 * Wszystkie lookupy przez Mapy O(1) — całkowita złożoność O(n),
 * zamiast wcześniejszego O(n²) z cells.filter wewnątrz pętli.
 */
export function floodFill(
  segment: Segment,
  startCellId: string,
  targetColorId: string | null,
  replacementColorId: string,
  patternMap: PatternMap
): PatternMap {
  const cellsById = new Map(segment.cells.map((cell) => [cell.id, cell]));
  const cellsByKey = new Map(
    segment.cells.map((cell) => [cellKey(cell.row, cell.col), cell])
  );

  const start = cellsById.get(startCellId);
  if (!start) return patternMap;

  const startColor = patternMap[startCellId] ?? targetColorId;
  const replacement = replacementColorId;
  if (startColor === replacement) return patternMap;

  const next: PatternMap = { ...patternMap };
  const visited = new Set<string>([startCellId]);
  const queue: BeadCell[] = [start];
  let head = 0;

  while (head < queue.length) {
    const cell = queue[head];
    head += 1;
    if (!cell) break;

    next[cell.id] = replacement;

    // Sąsiedzi przez Mapę O(1) — brak cells.filter.
    for (const neighbor of getCellNeighbors(cell, cellsByKey)) {
      if (visited.has(neighbor.id)) continue;
      const neighborColor = next[neighbor.id] ?? targetColorId;
      if (neighborColor !== startColor) continue;
      visited.add(neighbor.id);
      queue.push(neighbor);
    }
  }

  return next;
}

/**
 * Kopiuje wzór z segmentu źródłowego na wszystkie pozostałe segmenty (symetria radialna).
 * Lookup komórek przez Mapę z kluczem row:col — O(1) zamiast cells.find O(n),
 * co redukuje całkowitą złożoność z O(n²) do O(n).
 */
export function applyRadialSymmetry(project: Project): PatternMap {
  const { segments, symmetry, patternMap } = project;
  const sourceSegment =
    segments.find((segment) => segment.id === symmetry.sourceSegmentId) ??
    segments[0];

  if (!sourceSegment) return { ...patternMap };

  // Indeks komórek źródłowych po współrzędnych — budowany raz, O(n).
  const sourceByKey = new Map(
    sourceSegment.cells.map((cell) => [cellKey(cell.row, cell.col), cell])
  );

  const next: PatternMap = { ...patternMap };

  for (const segment of segments) {
    if (segment.id === sourceSegment.id) continue;
    for (const cell of segment.cells) {
      const sourceCell = sourceByKey.get(cellKey(cell.row, cell.col));
      if (!sourceCell) continue;
      const sourceColor = patternMap[sourceCell.id];
      if (sourceColor) {
        next[cell.id] = sourceColor;
      } else {
        delete next[cell.id];
      }
    }
  }

  return next;
}