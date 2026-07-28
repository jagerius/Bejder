typescript
import type { Segment, PatternMap } from '@/shared/types';

export interface SphereUV {
  u: number;
  v: number;
}

/**
 * Konwertuje współrzędne komórki w segmencie na UV sfery (Mercator).
 */
export function cellToSphereUV(
  segmentIndex: number,
  segmentCount: number,
  totalRows: number,
  row: number,
  col: number
): SphereUV {
  const u = (segmentIndex + (col + 0.5) / (row + 1)) / segmentCount;
  const v = (row + 0.5) / totalRows;
  return { u, v };
}

/**
 * Buduje mapę sąsiedztwa komórki → sąsiedzi (te same lub sąsiednie segmenty).
 */
export function buildAdjacencyMap(
  segments: Segment[]
): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  const cellById = new Map<string, { segmentIndex: number; row: number; col: number }>();

  segments.forEach((segment, segmentIndex) => {
    for (const cell of segment.cells) {
      cellById.set(cell.id, { segmentIndex, row: cell.row, col: cell.col });
    }
  });

  for (const [cellId, { segmentIndex, row, col }] of cellById) {
    const neighbors: string[] = [];

    // Sąsiedzi w tym samym segmencie
    for (const [otherId, other] of cellById) {
      if (otherId === cellId) continue;
      const sameSegment = other.segmentIndex === segmentIndex;
      const adjacentSegment =
        Math.abs(other.segmentIndex - segmentIndex) === 1 ||
        (segmentIndex === 0 && other.segmentIndex === segments.length - 1) ||
        (segmentIndex === segments.length - 1 && other.segmentIndex === 0);

      if (sameSegment) {
        const rowDiff = Math.abs(other.row - row);
        const colDiff = Math.abs(other.col - col);
        if ((rowDiff === 1 && colDiff <= 1) || (rowDiff === 0 && colDiff === 1)) {
          neighbors.push(otherId);
        }
      } else if (adjacentSegment && other.row === row && Math.abs(other.col - col) <= 1) {
        neighbors.push(otherId);
      }
    }

    adjacency.set(cellId, neighbors);
  }

  return adjacency;
}

/**
 * Fix #1: floodFill — poprawna sygnatura i eksport.
 * Wypełnia obszar komórek o tym samym kolorze co startCellId,
 * zamieniając je na newColorId (lub usuwa gdy null).
 * Zwraca nowy PatternMap — nie mutuje wejścia.
 */
export function floodFill(
  segments: Segment[],
  patternMap: PatternMap,
  startCellId: string,
  newColorId: string | null
): PatternMap {
  const adjacency = buildAdjacencyMap(segments);
  const startColor = patternMap[startCellId] ?? null;

  const visited = new Set<string>();
  const queue: string[] = [startCellId];
  const nextMap: PatternMap = { ...patternMap };

  while (queue.length > 0) {
    const cellId = queue.shift()!;
    if (visited.has(cellId)) continue;
    visited.add(cellId);

    const cellColor = nextMap[cellId] ?? null;
    if (cellColor !== startColor) continue;

    if (newColorId === null) {
      delete nextMap[cellId];
    } else {
      nextMap[cellId] = newColorId;
    }

    const neighbors = adjacency.get(cellId) ?? [];
    for (const neighborId of neighbors) {
      if (!visited.has(neighborId)) {
        queue.push(neighborId);
      }
    }
  }

  return nextMap;
}

/**
 * Fix #1: applyRadialSymmetry — poprawna sygnatura i eksport.
 * Kopiuje kolory z sourceSegmentId do wszystkich pozostałych segmentów,
 * zachowując pozycję (row, col) każdej komórki.
 * Zwraca nowy PatternMap — nie mutuje wejścia.
 */
export function applyRadialSymmetry(
  segments: Segment[],
  patternMap: PatternMap,
  sourceSegmentId: string
): PatternMap {
  const sourceSegment = segments.find((s) => s.id === sourceSegmentId);
  if (!sourceSegment) return { ...patternMap };

  // Budujemy mapę (row, col) → colorId z segmentu źródłowego
  const sourcePattern = new Map<string, string>();
  for (const cell of sourceSegment.cells) {
    const colorId = patternMap[cell.id];
    if (colorId) {
      sourcePattern.set(`${cell.row}:${cell.col}`, colorId);
    }
  }

  const nextMap: PatternMap = { ...patternMap };

  for (const segment of segments) {
    if (segment.id === sourceSegmentId) continue;
    for (const cell of segment.cells) {
      const key = `${cell.row}:${cell.col}`;
      const colorId = sourcePattern.get(key);
      if (colorId !== undefined) {
        nextMap[cell.id] = colorId;
      } else {
        delete nextMap[cell.id];
      }
    }
  }

  return nextMap;
}

/**
 * Odległość euklidesowa między dwoma punktami UV.
 */
export function uvDistance(a: SphereUV, b: SphereUV): number {
  const du = a.u - b.u;
  const dv = a.v - b.v;
  return Math.sqrt(du * du + dv * dv);
}