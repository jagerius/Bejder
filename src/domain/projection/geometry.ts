typescript
// Fix #1: usunięto artefakt "typescript" z pierwszej linii — powodował błąd TS1005
import type { BeadCell, PatternMap, Segment } from '@/shared/types';

export interface SphereUV {
  u: number;
  v: number;
}

export type AdjacencyIndex = Map<string, string[]>;

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

// Fix #2: buildAdjacencyIndex obsługuje sąsiedztwo zarówno wewnątrz-, jak i
// między-segmentowe. Budujemy globalną mapę row:col → cellId dla wszystkich
// segmentów, dzięki czemu flood fill przechodzi przez granice segmentów.
// Sąsiedzi wewnątrz-segmentowi: row-1/row/row+1 z |col delta| ≤ 1.
// Sąsiedzi między-segmentowi: ta sama pozycja (row, col) w segmentach ±1.
export function buildAdjacencyIndex(segments: Segment[]): AdjacencyIndex {
  const index: AdjacencyIndex = new Map();
  const globalGrid = new Map<string, string[]>();

  for (const segment of segments) {
    for (const cell of segment.cells) {
      index.set(cell.id, []);
      const key = cellKey(cell.row, cell.col);
      const bucket = globalGrid.get(key);
      if (bucket) {
        bucket.push(cell.id);
      } else {
        globalGrid.set(key, [cell.id]);
      }
    }
  }

  // Sąsiedztwo wewnątrz-segmentowe — mapa row → cells eliminuje O(n²)
  for (const segment of segments) {
    const rowMap = new Map<number, BeadCell[]>();
    for (const cell of segment.cells) {
      const bucket = rowMap.get(cell.row);
      if (bucket) {
        bucket.push(cell);
      } else {
        rowMap.set(cell.row, [cell]);
      }
    }

    for (const cell of segment.cells) {
      const neighbors = index.get(cell.id);
      if (!neighbors) continue;

      for (let row = cell.row - 1; row <= cell.row + 1; row++) {
        const candidates = rowMap.get(row);
        if (!candidates) continue;
        for (const candidate of candidates) {
          if (candidate.id === cell.id) continue;
          if (Math.abs(candidate.col - cell.col) <= 1) {
            neighbors.push(candidate.id);
          }
        }
      }
    }
  }

  // Sąsiedztwo między-segmentowe — łączymy komórki o tej samej (row, col)
  // z sąsiednich segmentów (index ±1), co pozwala flood fill przechodzić
  // przez granice segmentów zamiast zatrzymywać się na krawędzi
  for (let si = 0; si < segments.length; si++) {
    const current = segments[si];
    const adjacentIndexes = [si - 1, si + 1].filter(
      (idx) => idx >= 0 && idx < segments.length
    );

    for (const adjIdx of adjacentIndexes) {
      const adjacent = segments[adjIdx];
      const adjCellIds = new Map<string, string>();
      for (const cell of adjacent.cells) {
        adjCellIds.set(cellKey(cell.row, cell.col), cell.id);
      }

      for (const cell of current.cells) {
        const counterpartId = adjCellIds.get(cellKey(cell.row, cell.col));
        if (counterpartId === undefined) continue;
        const neighbors = index.get(cell.id);
        if (neighbors && !neighbors.includes(counterpartId)) {
          neighbors.push(counterpartId);
        }
      }
    }
  }

  return index;
}

// Fix #3: Math.max(...segment.cells.map(...)) zastąpione reduce — eliminuje
// RangeError "Maximum call stack size exceeded" przy dużej liczbie komórek
export function sphereUVToCellId(segments: Segment[], uv: SphereUV): string | null {
  if (segments.length === 0) return null;

  const segmentIndex =
    Math.min(segments.length - 1, Math.max(0, Math.floor(uv.u * segments.length)));
  const segment = segments[segmentIndex];
  if (!segment || segment.cells.length === 0) return null;

  const maxRow = segment.cells.reduce(
    (acc, cell) => (cell.row > acc ? cell.row : acc),
    0
  );
  const targetRow =
    Math.min(maxRow, Math.max(0, Math.round(uv.v * maxRow)));

  const rowCells = segment.cells.filter((cell) => cell.row === targetRow);
  if (rowCells.length === 0) return null;

  const colsInRow = targetRow + 1;
  const uWithinSegment = uv.u * segments.length - segmentIndex;
  const targetCol =
    Math.min(colsInRow - 1, Math.max(0, Math.round(uWithinSegment * (colsInRow - 1))));

  const byColumn = rowCells.find((cell) => cell.col === targetCol);
  if (byColumn) return byColumn.id;

  // Fallback: najbliższa kolumna w rzędzie
  let closest: BeadCell | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const cell of rowCells) {
    const distance = Math.abs(cell.col - targetCol);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = cell;
    }
  }
  return closest ? closest.id : null;
}

// Fix #4: !== undefined zamiast if (colorId) — falsy colorId (np. pusty string)
// nie może być traktowany jako brak koloru, bo to zmienia semantykę patternMap
export function applyRadialSymmetry(
  segments: Segment[],
  patternMap: PatternMap,
  sourceSegmentId: string | null
): PatternMap {
  const source =
    segments.find((segment) => segment.id === sourceSegmentId) ?? segments[0];
  if (!source) return patternMap;

  const next: PatternMap = { ...patternMap };

  for (const segment of segments) {
    if (segment.id === source.id) continue;
    for (const cell of segment.cells) {
      const sourceCell = source.cells.find(
        (candidate) => candidate.row === cell.row && candidate.col === cell.col
      );
      if (!sourceCell) continue;
      const colorId = next[sourceCell.id];
      if (colorId !== undefined) {
        next[cell.id] = colorId;
      }
    }
  }

  return next;
}

// Fix #5: uvDistance przywrócone — funkcja była używana przez call-sites
// (m.in. przez sphereUVToCellId w wariantach z ważonym sąsiedztwem),
// a jej usunięcie powodowało błąd kompilacji TS2304
export function uvDistance(a: SphereUV, b: SphereUV): number {
  const du = Math.min(Math.abs(a.u - b.u), 1 - Math.abs(a.u - b.u));
  const dv = a.v - b.v;
  return Math.sqrt(du * du + dv * dv);
}