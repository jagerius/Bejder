typescript
import type { BeadCell, OrnamentSpec, SegmentTemplate } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generuje siatkę komórek dla segmentu trójkątnego.
 * Rząd 0 = wierzchołek (1 koralik), kolejne rzędy rosną.
 */
export function generateTriangularSegment(
  segmentId: string,
  rows: number
): SegmentTemplate {
  const cells: BeadCell[] = [];

  for (let row = 0; row < rows; row++) {
    const colsInRow = row + 1;
    for (let col = 0; col < colsInRow; col++) {
      const localU = colsInRow > 1 ? col / (colsInRow - 1) : 0.5;
      const localV = row / (rows - 1);
      cells.push({
        id: `${segmentId}_r${row}_c${col}`,
        row,
        col,
        localU,
        localV,
        color: null,
      });
    }
  }

  return {
    id: segmentId,
    rows,
    cells,
    edgeRules: {
      leftJoin: true,
      rightJoin: true,
      topJoin: false,
    },
  };
}

export function generateOrnamentSegments(spec: OrnamentSpec): SegmentTemplate[] {
  const segments: SegmentTemplate[] = [];
  for (let i = 0; i < spec.segmentCount; i++) {
    const segId = `seg_${i}`;
    segments.push(generateTriangularSegment(segId, spec.segmentRows));
  }
  return segments;
}

/**
 * Mapuje komórkę segmentu na współrzędne UV sfery.
 * segmentIndex: indeks segmentu (0..segmentCount-1)
 * rows: całkowita liczba rzędów
 * row, col: pozycja w siatce
 * segmentCount: liczba segmentów
 */
export function cellToSphereUV(
  segmentIndex: number,
  segmentCount: number,
  rows: number,
  row: number,
  col: number
): { u: number; v: number } {
  const colsInRow = row + 1;
  const localU = colsInRow > 1 ? col / (colsInRow - 1) : 0.5;

  // V: od bieguna do równika i z powrotem (0 = góra, 0.5 = równik, 1 = dół)
  // Mapujemy rząd na połowę sfery: segment zajmuje ćwiartkę sfery
  const v = 0.05 + (row / (rows - 1)) * 0.45;

  // U: każdy segment zajmuje 1/segmentCount szerokości sfery
  const segStart = segmentIndex / segmentCount;
  const segEnd = (segmentIndex + 1) / segmentCount;
  const u = segStart + localU * (segEnd - segStart);

  return { u, v };
}

export function floodFill(
  cells: BeadCell[],
  startCellId: string,
  targetColor: string | null,
  newColor: string | null,
  patternMap: Record<string, string | null>
): string[] {
  if (targetColor === newColor) return [];

  const cellMap = new Map(cells.map((c) => [c.id, c]));
  const visited = new Set<string>();
  const toFill: string[] = [];
  const queue = [startCellId];

  while (queue.length > 0) {
    const id = queue.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const cell = cellMap.get(id);
    if (!cell) continue;
    if ((patternMap[id] ?? null) !== targetColor) continue;

    toFill.push(id);

    // Znajdź sąsiadów w tej samej siatce
    const neighbors = cells.filter((c) => {
      if (c.id === id) return false;
      const dr = Math.abs(c.row - cell.row);
      const dc = Math.abs(c.col - cell.col);
      return (dr === 0 && dc === 1) || (dr === 1 && dc <= 1);
    });

    for (const n of neighbors) {
      if (!visited.has(n.id)) {
        queue.push(n.id);
      }
    }
  }

  return toFill;
}

export function applyRadialSymmetry(
  segments: SegmentTemplate[],
  sourceSegmentId: string,
  patternMap: Record<string, string | null>
): Record<string, string | null> {
  const newMap = { ...patternMap };
  const sourceSegment = segments.find((s) => s.id === sourceSegmentId);
  if (!sourceSegment) return newMap;

  for (const segment of segments) {
    if (segment.id === sourceSegmentId) continue;
    for (const cell of segment.cells) {
      const sourceCell = sourceSegment.cells.find(
        (sc) => sc.row === cell.row && sc.col === cell.col
      );
      if (sourceCell) {
        newMap[cell.id] = patternMap[sourceCell.id] ?? null;
      }
    }
  }
  return newMap;
}

export function countBeadsByColor(
  segments: SegmentTemplate[],
  patternMap: Record<string, string | null>
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const seg of segments) {
    for (const cell of seg.cells) {
      const color = patternMap[cell.id] ?? null;
      if (color) {
        counts[color] = (counts[color] || 0) + 1;
      }
    }
  }
  return counts;
}