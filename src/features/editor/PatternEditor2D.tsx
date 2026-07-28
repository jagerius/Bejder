tsx
import React, {
  useRef,
  useCallback,
  useEffect,
  useState,
  useMemo,
} from 'react';
import { useAppDispatch, useAppSelector } from '@/app/store';
import { updatePatternMap } from '@/app/store/projectSlice';
import { pushHistory } from '@/app/store/historySlice';
import { setHoveredCell, setActiveColor } from '@/app/store/editorSlice';
import { floodFill, applyRadialSymmetry } from '@/shared/utils/geometry';
import type { PatternMap } from '@/shared/types';

interface PatternEditor2DProps {
  projectId: string;
}

const CELL_SIZE = 28;
const PADDING = 20;

export default function PatternEditor2D({ projectId }: PatternEditor2DProps) {
  const dispatch = useAppDispatch();
  const project = useAppSelector((state) =>
    state.projects.projects.find((p) => p.projectId === projectId)
  );
  const { activeTool, activeColorId, selectedSegmentId } = useAppSelector(
    (state) => state.editor
  );

  const svgRef = useRef<SVGSVGElement>(null);
  const [isPainting, setIsPainting] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const lastPanRef = useRef({ x: 0, y: 0, startX: 0, startY: 0, active: false });

  const activeSegment = useMemo(() => {
    if (!project) return null;
    if (selectedSegmentId) {
      return project.segments.find((s) => s.id === selectedSegmentId) ?? project.segments[0];
    }
    return project.segments[0] ?? null;
  }, [project, selectedSegmentId]);

  const colorMap = useMemo(() => {
    if (!project) return new Map<string, string>();
    return new Map(project.palette.colors.map((c) => [c.id, c.hex]));
  }, [project]);

  const isSourceSegment = useMemo(() => {
    if (!project || !activeSegment) return true;
    return (
      project.symmetry.mode !== 'radial' ||
      project.symmetry.sourceSegmentId === activeSegment.id ||
      !project.symmetry.sourceSegmentId
    );
  }, [project, activeSegment]);

  function getCellColor(cellId: string): string {
    if (!project) return '#333';
    const colorRef = project.patternMap[cellId] ?? null;
    if (!colorRef) return '#2a2a3e';
    return colorMap.get(colorRef) ?? '#888';
  }

  function paintCell(cellId: string) {
    if (!project || !activeSegment) return;
    if (!isSourceSegment) return;

    const currentColor = project.patternMap[cellId] ?? null;

    if (activeTool === 'picker') {
      if (currentColor) dispatch(setActiveColor(currentColor));
      return;
    }

    let newMap: PatternMap = { ...project.patternMap };

    if (activeTool === 'pencil') {
      const newColor = activeColorId;
      newMap[cellId] = newColor;
    } else if (activeTool === 'eraser') {
      newMap[cellId] = null;
    } else if (activeTool === 'fill') {
      const toFill = floodFill(
        activeSegment.cells,
        cellId,
        currentColor,
        activeColorId,
        project.patternMap
      );
      for (const id of toFill) {
        newMap[id] = activeColorId;
      }
    }

    // Apply symmetry
    if (project.symmetry.mode === 'radial' && project.symmetry.sourceSegmentId) {
      newMap = applyRadialSymmetry(project.segments, project.symmetry.sourceSegmentId, newMap);
    }

    dispatch(
      pushHistory({
        patternMap: project.patternMap,
        description: `paint ${activeTool}`,
      })
    );
    dispatch(updatePatternMap({ projectId, patternMap: newMap }));
  }

  function getCellPosition(row: number, col: number): { x: number; y: number } {
    const colsInRow = row + 1;
    const rowWidth = colsInRow * CELL_SIZE;
    const maxRowWidth = (activeSegment?.rows ?? 1) * CELL_SIZE;
    const offsetX = (maxRowWidth - rowWidth) / 2;
    const x = PADDING + offsetX + col * CELL_SIZE + CELL_SIZE / 2;
    const y = PADDING + row * CELL_SIZE * 0.87 + CELL_SIZE / 2;
    return { x, y };
  }

  const svgWidth = ((activeSegment?.rows ?? 1) + 1) * CELL_SIZE + PADDING * 2;
  const svgHeight = ((activeSegment?.rows ?? 1) + 1) * CELL_SIZE * 0.87 + PADDING * 2;

  if (!project || !activeSegment) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        Brak segmentu
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-[#16213e] border-b border-[#0f3460] shrink-0">
        <span className="text-xs text-gray-400">
          Segment: <span className="text-white">{activeSegment.id}</span>
          {!isSourceSegment && (
            <span className="ml-2 text-yellow-400 text-xs">
              (tylko odczyt – symetria)
            </span>
          )}
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
            className="px-2 py-1 bg-[#0f3460] rounded text-xs hover:bg-[#1a4f8a]"
          >
            +
          </button>
          <span className="text-xs text-gray-400">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
            className="px-2 py-1 bg-[#0f3460] rounded text-xs hover:bg-[#1a4f8a]"
          >
            −
          </button>
          <button
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            className="px-2 py-1 bg-[#0f3460] rounded text-xs hover:bg-[#1a4f8a]"
          >
            Reset
          </button>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="flex-1 overflow-hidden flex items-center justify-center bg-[#12122a]">
        <svg
          ref={svgRef}
          width={svgWidth * zoom}
          height={svgHeight * zoom}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px)`, cursor: isSourceSegment ? 'crosshair' : 'not-allowed' }}
          onMouseLeave={() => dispatch(setHoveredCell(null))}
        >
          {/* Grid lines */}
          {activeSegment.cells.map((cell) => {
            const { x, y } = getCellPosition(cell.row, cell.col);
            const fillColor = getCellColor(cell.id);
            const r = CELL_SIZE * 0.38;

            return (
              <g key={cell.id}>
                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill={fillColor}
                  stroke={fillColor === '#2a2a3e' ? '#3a3a5e' : '#1a1a2e'}
                  strokeWidth={1}
                  className="bead-cell"
                  onMouseEnter={() => dispatch(setHoveredCell(cell.id))}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    setIsPainting(true);
                    paintCell(cell.id);
                  }}
                  onMouseUp={() => setIsPainting(false)}
                  onMouseMove={() => {
                    if (isPainting) paintCell(cell.id);
                  }}
                />
                {/* Highlight */}
                <circle
                  cx={x - r * 0.2}
                  cy={y - r * 0.25}
                  r={r * 0.3}
                  fill="rgba(255,255,255,0.18)"
                  pointerEvents="none"
                />
              </g>
            );
          })}
          {/* Row labels */}
          {Array.from({ length: activeSegment.rows }, (_, row) => (
            <text
              key={`row-${row}`}
              x={4}
              y={getCellPosition(row, 0).y + 4}
              fontSize={9}
              fill="#555"
              fontFamily="monospace"
            >
              {row + 1}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}