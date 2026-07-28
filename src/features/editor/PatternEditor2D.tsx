tsx
// Fix #1: import React — wymagany dla React.PointerEvent, React.WheelEvent
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/store';
import {
  setEditorZoom,
  setEditorPan,
  pushHistory,
} from '@/app/store/editorSlice';
import { updatePatternMap } from '@/app/store/projectSlice';
import type { BeadCell, PatternMap, Project, Segment } from '@/shared/types';

interface PatternEditor2DProps {
  project: Project;
}

interface CellPosition {
  x: number;
  y: number;
  size: number;
}

interface CellHit {
  segment: Segment;
  cell: BeadCell;
}

const CELL_SIZE = 28;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

// Fix #3: rozmiar bucketu dla spatial hash — dobierany do wielkości komórki
const SPATIAL_BUCKET_SIZE = CELL_SIZE * 2;

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function bucketKey(bx: number, by: number): string {
  return `${bx},${by}`;
}

export default function PatternEditor2D({ project }: PatternEditor2DProps) {
  const dispatch = useAppDispatch();
  const zoom = useAppSelector((state) => state.editor.zoom);
  const pan = useAppSelector((state) => state.editor.pan);
  const selectedColorId = useAppSelector((state) => state.editor.selectedColorId);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPaintingRef = useRef(false);
  const isPanningRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const [, setPointerVersion] = useState(0);

  const colorMap = useMemo(
    () => new Map(project.palette.colors.map((color) => [color.id, color.hex])),
    [project.palette.colors]
  );

  const layout = useMemo(() => {
    const positions = new Map<string, CellPosition>();
    const rowHeight = CELL_SIZE * 0.9;
    let maxX = 0;
    let maxY = 0;

    project.segments.forEach((segment, segmentIndex) => {
      const segmentOffsetX =
        segmentIndex * (project.ornamentSpec.segmentRows + 1) * CELL_SIZE;
      for (const cell of segment.cells) {
        const colsInRow = cell.row + 1;
        const rowWidth = colsInRow * CELL_SIZE;
        const x = segmentOffsetX + cell.col * CELL_SIZE + rowWidth / 2;
        const y = cell.row * rowHeight + CELL_SIZE / 2;
        positions.set(cell.id, { x, y, size: CELL_SIZE * 0.86 });
        maxX = Math.max(maxX, x + CELL_SIZE);
        maxY = Math.max(maxY, y + CELL_SIZE);
      }
    });

    return { positions, width: maxX + CELL_SIZE, height: maxY + CELL_SIZE };
  }, [project.segments, project.ornamentSpec.segmentRows]);

  // Fix #2 (cellHitIndex): O(1) lookup cellId → {segment, cell}
  const cellHitIndex = useMemo<Map<string, CellHit>>(() => {
    const index = new Map<string, CellHit>();
    for (const segment of project.segments) {
      for (const cell of segment.cells) {
        index.set(cell.id, { segment, cell });
      }
    }
    return index;
  }, [project.segments]);

  // Fix #3: spatial hash — bucket grid budowany raz w useMemo
  // findCellAtPoint sprawdza tylko komórki w okolicznych bucketach (O(1) zamiast O(n))
  const spatialHash = useMemo<Map<string, string[]>>(() => {
    const hash = new Map<string, string[]>();
    for (const [cellId, pos] of layout.positions) {
      const bx = Math.floor(pos.x / SPATIAL_BUCKET_SIZE);
      const by = Math.floor(pos.y / SPATIAL_BUCKET_SIZE);
      const key = bucketKey(bx, by);
      const bucket = hash.get(key);
      if (bucket) {
        bucket.push(cellId);
      } else {
        hash.set(key, [cellId]);
      }
    }
    return hash;
  }, [layout.positions]);

  const getCellColor = useCallback(
    (cell: BeadCell): string => {
      const colorId = project.patternMap[cell.id];
      if (!colorId) return '#2a2a3e';
      return colorMap.get(colorId) ?? '#888888';
    },
    [project.patternMap, colorMap]
  );

  const getCellPosition = useCallback(
    (cell: BeadCell): CellPosition | null => {
      return layout.positions.get(cell.id) ?? null;
    },
    [layout.positions]
  );

  // Fix #3: findCellAtPoint używa spatial hash — sprawdza tylko buckety sąsiadujące
  const findCellAtPoint = useCallback(
    (clientX: number, clientY: number): CellHit | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const worldX = (clientX - rect.left - pan.x) / zoom;
      const worldY = (clientY - rect.top - pan.y) / zoom;

      const bx = Math.floor(worldX / SPATIAL_BUCKET_SIZE);
      const by = Math.floor(worldY / SPATIAL_BUCKET_SIZE);

      // Sprawdzamy 3×3 buckety wokół punktu, aby obsłużyć komórki przy granicy
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const candidates = spatialHash.get(bucketKey(bx + dx, by + dy));
          if (!candidates) continue;
          for (const cellId of candidates) {
            const position = layout.positions.get(cellId);
            if (!position) continue;
            const ddx = worldX - position.x;
            const ddy = worldY - position.y;
            const radius = position.size / 2;
            if (ddx * ddx + ddy * ddy <= radius * radius) {
              return cellHitIndex.get(cellId) ?? null;
            }
          }
        }
      }
      return null;
    },
    [layout.positions, cellHitIndex, spatialHash, pan.x, pan.y, zoom]
  );

  // Fix #3: resize canvasu TYLKO gdy layout się zmienia — nie przy zoom/pan
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = layout.width;
    canvas.height = layout.height;
  }, [layout]);

  // Fix #3: rysowanie — bez zmiany canvas.width/height, brak kosztownego resetu
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, layout.width, layout.height);

    for (const segment of project.segments) {
      for (const cell of segment.cells) {
        const position = getCellPosition(cell);
        if (!position) continue;

        ctx.fillStyle = getCellColor(cell);
        ctx.beginPath();
        ctx.arc(position.x, position.y, position.size / 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1 / zoom;
        ctx.stroke();
      }
    }

    ctx.restore();
  }, [project.segments, layout, zoom, pan, getCellColor, getCellPosition]);

  const paintCell = useCallback(
    (clientX: number, clientY: number) => {
      const hit = findCellAtPoint(clientX, clientY);
      if (!hit) return;

      const nextPatternMap: PatternMap = { ...project.patternMap };
      if (selectedColorId) {
        nextPatternMap[hit.cell.id] = selectedColorId;
      } else {
        delete nextPatternMap[hit.cell.id];
      }
      dispatch(
        updatePatternMap({ projectId: project.projectId, patternMap: nextPatternMap })
      );
    },
    [dispatch, findCellAtPoint, project.patternMap, project.projectId, selectedColorId]
  );

  // Fix #5: wszystkie handlery zdarzeń canvasu opakowane w useCallback
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      lastPointerRef.current = { x: event.clientX, y: event.clientY };

      if (event.button === 1 || event.button === 2 || event.shiftKey) {
        isPanningRef.current = true;
        return;
      }

      dispatch(pushHistory(project.patternMap));
      isPaintingRef.current = true;
      paintCell(event.clientX, event.clientY);
    },
    [dispatch, paintCell, project.patternMap]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const last = lastPointerRef.current;

      if (isPanningRef.current && last) {
        dispatch(
          setEditorPan({
            x: pan.x + event.clientX - last.x,
            y: pan.y + event.clientY - last.y,
          })
        );
        lastPointerRef.current = { x: event.clientX, y: event.clientY };
        return;
      }

      if (isPaintingRef.current) {
        paintCell(event.clientX, event.clientY);
      }
    },
    [dispatch, paintCell, pan.x, pan.y]
  );

  // Fix #1: celowe puste [] deps — handler operuje wyłącznie na refach
  // (isPaintingRef, isPanningRef, lastPointerRef) oraz na setPointerVersion
  // z functional update, więc nie odczytuje żadnych wartości z closure.
  // Nie dodawaj deps bez weryfikacji, że handler faktycznie ich potrzebuje.
  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.currentTarget.releasePointerCapture(event.pointerId);
      isPaintingRef.current = false;
      isPanningRef.current = false;
      lastPointerRef.current = null;
      setPointerVersion((version) => version + 1);
    },
    []
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLCanvasElement>) => {
      const nextZoom = clampZoom(zoom * (event.deltaY < 0 ? 1.1 : 0.9));
      dispatch(setEditorZoom(nextZoom));
    },
    [dispatch, zoom]
  );

  // Fix #5: nazwany handler zamiast inline arrow — spójny z resztą handlerów,
  // stabilna referencja zapobiega niepotrzebnym re-renderom
  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      event.preventDefault();
    },
    []
  );

  return (
    <section aria-label="Edytor wzoru 2D" className="pattern-editor">
      <canvas
        ref={canvasRef}
        className="pattern-editor__canvas"
        aria-label="Edytor wzoru koralikowego"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      />
    </section>
  );
}