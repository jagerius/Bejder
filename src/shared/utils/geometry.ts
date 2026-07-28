typescript
import type { BeadCell, PatternMap, Segment } from '@/shared/types';

export interface SphereUV {
  u: number;
  v: number;
}

/**
 * Fix #1: floodFill i applyRadialSymmetry są poprawnie wyeksportowane.
 */

export function cellToSphereUV(
  segmentIndex: number,
  segmentCount: number,
  segmentRows: number,
  row: number,
  col: number
): SphereUV {
  const segmentWidth = 1 / segmentCount;
  const colsInRow = row + 1;
  const u = segmentIndex * segmentWidth + ((col + 0.5) / colsInRow) * segmentWidth;
  const v = (row + 0.5) / segmentRows;
  return { u, v };
}

export function sphereUVToCellId(
  segments: Segment[],
  segmentCount: number,
  segmentRows: number,
  u: number,
  v: number
): BeadCell | null {
  const segmentIndex = Math.min(segmentCount - 1, Math.floor(u * segmentCount));
  const row = Math.min(segmentRows - 1, Math.floor(v * segmentRows));
  const segment = segments[segmentIndex];
  if (!segment) return null;
  const cell = segment.cells.find((c) => c.row === row);
  return cell ?? null;
}

/**
 * Buduje indeks sąsiedztwa: cellId → Set<cellId>.
 */
export function buildAdjacencyIndex(segments: Segment[]): Map<string, Set<string>> {
  const rowMap = new Map<string, string[]>();
  for (const segment of segments) {
    for (const cell of segment.cells) {
      const key = `${cell.row}`;
      if (!rowMap.has(key)) rowMap.set(key, []);
      rowMap.get(key)!.push(cell.id);
    }
  }

  const adjacency = new Map<string, Set<string>>();
  for (const segment of segments) {
    for (const cell of segment.cells) {
      const neighbors = new Set<string>();
      const sameRow = segment.cells.filter((c) => c.row === cell.row);
      const nextCell = sameRow.find((c) => c.col === cell.col + 1);
      const prevCell = sameRow.find((c) => c.col === cell.col - 1);
      if (nextCell) neighbors.add(nextCell.id);
      if (prevCell) neighbors.add(prevCell.id);
      const rowBelow = segment.cells.filter((c) => c.row === cell.row + 1);
      const belowLeft = rowBelow.find((c) => c.col === cell.col);
      const belowRight = rowBelow.find((c) => c.col === cell.col + 1);
      if (belowLeft) neighbors.add(belowLeft.id);
      if (belowRight) neighbors.add(belowRight.id);
      const rowAbove = segment.cells.filter((c) => c.row === cell.row - 1);
      const aboveLeft = rowAbove.find((c) => c.col === cell.col - 1);
      const aboveRight = rowAbove.find((c) => c.col === cell.col);
      if (aboveLeft) neighbors.add(aboveLeft.id);
      if (aboveRight) neighbors.add(aboveRight.id);
      adjacency.set(cell.id, neighbors);
    }
  }
  return adjacency;
}

/**
 * Fix #1: floodFill — eksportowany z aktualną sygnaturą.
 * Wypełnia wszystkie komórki w tym samym kolorze co startCellId.
 */
export function floodFill(
  segments: Segment[],
  patternMap: PatternMap,
  startCellId: string,
  targetColorId: string,
  adjacency?: Map<string, Set<string>>
): PatternMap {
  const adj = adjacency ?? buildAdjacencyIndex(segments);
  const startColor = patternMap[startCellId] ?? null;
  const result: PatternMap = { ...patternMap };
  const visited = new Set<string>();
  const queue: string[] = [startCellId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const currentColor = patternMap[currentId] ?? null;
    if (currentColor !== startColor) continue;

    if (targetColorId) {
      result[currentId] = targetColorId;
    } else {
      delete result[currentId];
    }

    for (const neighborId of adj.get(currentId) ?? []) {
      if (!visited.has(neighborId)) {
        queue.push(neighborId);
      }
    }
  }

  return result;
}

/**
 * Fix #1: applyRadialSymmetry — eksportowany z aktualną sygnaturą.
 * Kopiuje patternMap segmentu źródłowego na wszystkie pozostałe segmenty.
 */
export function applyRadialSymmetry(
  segments: Segment[],
  patternMap: PatternMap,
  sourceSegmentId: string
): PatternMap {
  const sourceSegment = segments.find((s) => s.id === sourceSegmentId);
  if (!sourceSegment) return { ...patternMap };

  const sourcePattern = new Map<string, string>();
  for (const cell of sourceSegment.cells) {
    const colorId = patternMap[cell.id];
    if (colorId) {
      sourcePattern.set(`${cell.row}:${cell.col}`, colorId);
    }
  }

  const result: PatternMap = { ...patternMap };
  for (const segment of segments) {
    if (segment.id === sourceSegmentId) continue;
    for (const cell of segment.cells) {
      const key = `${cell.row}:${cell.col}`;
      const colorId = sourcePattern.get(key);
      if (colorId) {
        result[cell.id] = colorId;
      } else {
        delete result[cell.id];
      }
    }
  }

  return result;
}

/**
 * Liczba pokolorowanych komórek.
 */
export function countColoredBeads(patternMap: PatternMap): number {
  return Object.keys(patternMap).length;
}