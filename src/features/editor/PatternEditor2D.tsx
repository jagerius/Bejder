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

  const cellHitIndex = useMemo<Map<string, CellHit>>(() => {
    const index = new Map<string, CellHit>();
    for (const segment of project.segments) {
      for (const cell of segment.cells) {
        index.set(cell.id, { segment, cell });
      }
    }
    return index;
  }, [project.segments]);

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
    (cell: BeadCell): CellPosition | null => layout.positions.get(cell.id) ?? null,
    [layout.positions]
  );

  const findCellAtPoint = useCallback(
    (clientX: number, clientY: number): CellHit | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const worldX = (clientX - rect.left - pan.x) / zoom;
      const worldY = (clientY - rect.top - pan.y) / zoom;

      const bx = Math.floor(worldX / SPATIAL_BUCKET_SIZE);
      const by = Math.floor(worldY / SPATIAL_BUCKET_SIZE);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = layout.width;
    canvas.height = layout.height;
  }, [layout]);

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
    (hit: CellHit) => {
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
    [dispatch, project.patternMap, project.projectId, selectedColorId]
  );

  const resetPointerInteraction = useCallback(() => {
    isPaintingRef.current = false;
    isPanningRef.current = false;
    lastPointerRef.current = null;
    setPointerVersion((value) => value + 1);
  }, []);

  const handlePointerUp = useCallback(
    (event?: React.PointerEvent<HTMLCanvasElement>) => {
      if (event?.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      resetPointerInteraction();
    },
    [resetPointerInteraction]
  );

  // Fix #1: jawna obsługa onPointerCancel i onPointerLeave.
  // Oba przypadki resetują tryb malowania/panowania i zwalniają pointer capture,
  // aby aplikacja nie utkwiła w stanie "painting" po utracie gestu przez system
  // lub wyjściu kursora poza canvas.
  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      handlePointerUp(event);
    },
    [handlePointerUp]
  );

  const handlePointerLeave = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      handlePointerUp(event);
    },
    [handlePointerUp]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

      if (event.button === 1 || event.button === 2 || event.altKey || event.metaKey) {
        isPanningRef.current = true;
        lastPointerRef.current = { x: event.clientX, y: event.clientY };
        return;
      }

      const hit = findCellAtPoint(event.clientX, event.clientY);
      if (!hit) {
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        return;
      }

      dispatch(pushHistory(project.patternMap));
      isPaintingRef.current = true;
      paintCell(hit);
    },
    [dispatch, findCellAtPoint, paintCell, project.patternMap]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (isPanningRef.current && lastPointerRef.current) {
        const dx = event.clientX - lastPointerRef.current.x;
        const dy = event.clientY - lastPointerRef.current.y;
        lastPointerRef.current = { x: event.clientX, y: event.clientY };
        dispatch(setEditorPan({ x: pan.x + dx, y: pan.y + dy }));
        return;
      }

      if (!isPaintingRef.current) return;
      const hit = findCellAtPoint(event.clientX, event.clientY);
      if (!hit) return;
      paintCell(hit);
    },
    [dispatch, findCellAtPoint, paintCell, pan.x, pan.y]
  );

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();

      const delta = event.deltaY < 0 ? 0.1 : -0.1;
      dispatch(setEditorZoom(clampZoom(zoom + delta)));
    },
    [dispatch, zoom]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  return (
    <section className="pattern-editor-2d" aria-label="Edytor wzoru 2D">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerLeave}
        style={{ cursor: isPanningRef.current ? 'grabbing' : 'crosshair' }}
      />
    </section>
  );
}