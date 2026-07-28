tsx
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

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
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

  // Fix #2: przestrzenny indeks cellId → {segment, cell} — lookup O(1) zamiast O(segments×cells)
  const cellHitIndex = useMemo<Map<string, CellHit>>(() => {
    const index = new Map<string, CellHit>();
    for (const segment of project.segments) {
      for (const cell of segment.cells) {
        index.set(cell.id, { segment, cell });
      }
    }
    return index;
  }, [project.segments]);

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

  // Fix #2: findCellAtPoint używa indeksu przestrzennego — O(n) po cellHitIndex,
  // ale iteruje tylko raz przez layout.positions bez zagnieżdżonej pętli segmentów
  const findCellAtPoint = useCallback(
    (clientX: number, clientY: number): CellHit | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const worldX = (clientX - rect.left - pan.x) / zoom;
      const worldY = (clientY - rect.top - pan.y) / zoom;

      for (const [cellId, position] of layout.positions) {
        const dx = worldX - position.x;
        const dy = worldY - position.y;
        const radius = position.size / 2;
        if (dx * dx + dy * dy <= radius * radius) {
          const hit = cellHitIndex.get(cellId);
          if (hit) return hit;
        }
      }
      return null;
    },
    [layout.positions, cellHitIndex, pan.x, pan.y, zoom]
  );

  // Fix #3: resize canvasu TYLKO gdy zmienia się layout — nie przy każdym zoom/pan
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = layout.width;
    canvas.height = layout.height;
  }, [layout]);

  // Fix #3: rysowanie bez dotykania canvas.width/height — nie powoduje czyszczenia
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

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    lastPointerRef.current = { x: event.clientX, y: event.clientY };

    if (event.button === 1 || event.button === 2 || event.shiftKey) {
      isPanningRef.current = true;
      return;
    }

    dispatch(pushHistory(project.patternMap));
    isPaintingRef.current = true;
    paintCell(event.clientX, event.clientY);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
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
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    isPaintingRef.current = false;
    isPanningRef.current = false;
    lastPointerRef.current = null;
    setPointerVersion((version) => version + 1);
  };

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    const nextZoom = clampZoom(zoom * (event.deltaY < 0 ? 1.1 : 0.9));
    dispatch(setEditorZoom(nextZoom));
  };

  return (
    <section aria-label="Edytor wzoru 2D" className="pattern-editor">
      {/* Fix #4: aria-label na canvas dla dostępności */}
      <canvas
        ref={canvasRef}
        className="pattern-editor__canvas"
        aria-label="Edytor wzoru koralikowego"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={(event) => event.preventDefault()}
      />
    </section>
  );
}