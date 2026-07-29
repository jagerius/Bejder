typescript
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
// Sąsiedzi między-segmentowi: ta sama pozycja (row, col) w segmentach ±1
// z wrap-around: segment 0 jest sąsiadem segmentu N-1 (szew ornamentu).
export function buildAdjacencyIndex(segments: Segment[]): AdjacencyIndex {
  const index: AdjacencyIndex = new Map();

  // Fix #2 (poprawka): jedna globalna mapa Set per komórka — trzymana przez
  // całą budowę indeksu, dzięki czemu dedup jest faktycznie O(1) przy każdym
  // dodawaniu sąsiada, bez kosztu tworzenia nowego Set per komórka.
  const neighborSets = new Map<string, Set<string>>();

  const addNeighbor = (cellId: string, neighborId: string): void => {
    const set = neighborSets.get(cellId);
    if (!set) return;
    if (set.has(neighborId)) return;
    set.add(neighborId);
    index.get(cellId)?.push(neighborId);
  };

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
      index.set(cell.id, []);
      neighborSets.set(cell.id, new Set());
    }

    for (const cell of segment.cells) {
      for (let row = cell.row - 1; row <= cell.row + 1; row++) {
        const candidates = rowMap.get(row);
        if (!candidates) continue;
        for (const candidate of candidates) {
          if (candidate.id === cell.id) continue;
          if (Math.abs(candidate.col - cell.col) <= 1) {
            addNeighbor(cell.id, candidate.id);
          }
        }
      }
    }
  }

  // Sąsiedztwo między-segmentowe — łączymy komórki o tej samej (row, col)
  // z sąsiednich segmentów. Indeks segmentu liczony modulo N, więc segment
  // N-1 jest połączony z segmentem 0 (wrap-around na szwie ornamentu).
  // Fix #3: globalny neighborSets — O(1) dedup przy dodawaniu sąsiada,
  // bez kosztu budowania tymczasowego Set per komórka.
  const n = segments.length;
  for (let si = 0; si < n; si++) {
    const current = segments[si];
    // Modulo zapewnia wrap-around: dla si=0 → n-1, dla si=n-1 → 0
    const adjacentIndexes = [
      (si - 1 + n) % n,
      (si + 1) % n,
    ];

    for (const adjIdx of adjacentIndexes) {
      const adjacent = segments[adjIdx];
      const adjCellIds = new Map<string, string>();
      for (const cell of adjacent.cells) {
        adjCellIds.set(cellKey(cell.row, cell.col), cell.id);
      }

      for (const cell of current.cells) {
        const counterpartId = adjCellIds.get(cellKey(cell.row, cell.col));
        if (counterpartId === undefined) continue;
        addNeighbor(cell.id, counterpartId);
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