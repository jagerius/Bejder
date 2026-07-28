tsx
import React, { useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/store';
import {
  setActiveTool,
  setActiveColor,
  setSelectedSegment,
} from '@/app/store/editorSlice';
import { addColor, removeColor } from '@/app/store/projectSlice';
import { undo, redo } from '@/app/store/historySlice';
import { TOOL_LABELS } from '@/shared/constants';
import type { EditorTool, BeadColor } from '@/shared/types';
import { v4 as uuidv4 } from 'uuid';

interface LeftPanelProps {
  projectId: string;
}

export default function LeftPanel({ projectId }: LeftPanelProps) {
  const dispatch = useAppDispatch();
  const project = useAppSelector((state) =>
    state.projects.projects.find((p) => p.projectId === projectId)
  );
  const { activeTool, activeColorId, selectedSegmentId } = useAppSelector(
    (state) => state.editor
  );
  const canUndo = useAppSelector((state) => state.history.past.length > 0);
  const canRedo = useAppSelector((state) => state.history.future.length > 0);

  const [newColorHex, setNewColorHex] = useState('#ff0000');
  const [newColorName, setNewColorName] = useState('');

  if (!project) return null;

  const tools: EditorTool[] = [
    'pencil',
    'fill',
    'eraser',
    'picker',
    'line',
    'mirror',
  ];

  const toolIcons: Record<EditorTool, string> = {
    pencil: '✏️',
    fill: '🪣',
    eraser: '🧹',
    picker: '💉',
    line: '📏',
    mirror: '🪞',
  };

  function handleAddColor() {
    const name = newColorName.trim() || `Kolor ${project!.palette.colors.length + 1}`;
    const color: BeadColor = {
      id: uuidv4(),
      name,
      hex: newColorHex,
    };
    dispatch(addColor({ projectId, color }));
    dispatch(setActiveColor(color.id));
    setNewColorName('');
  }

  return (
    <div className="w-56 bg-[#16213e] border-r border-[#0f3460] flex flex-col overflow-y-auto shrink-0">
      {/* Tools */}
      <div className="p-3 border-b border-[#0f3460]">
        <div className="text-xs text-gray-500 uppercase mb-2 tracking-wider">
          Narzędzia
        </div>
        <div className="grid grid-cols-3 gap-1">
          {tools.map((tool) => (
            <button
              key={tool}
              title={TOOL_LABELS[tool]}
              onClick={() => dispatch(setActiveTool(tool))}
              className={`p-2 rounded text-lg transition ${
                activeTool === tool
                  ? 'bg-[#e94560] text-white'
                  : 'bg-[#0f3460] hover:bg-[#1a4f8a] text-white'
              }`}
            >
              {toolIcons[tool]}
            </button>
          ))}
        </div>
      </div>

      {/* Undo/Redo */}
      <div className="px-3 py-2 border-b border-[#0f3460] flex gap-2">
        <button
          onClick={() => dispatch(undo())}
          disabled={!canUndo}
          className="flex-1 text-xs py-1.5 rounded bg-[#0f3460] hover:bg-[#1a4f8a] disabled:opacity-40 transition"
        >
          ↩ Cofnij
        </button>
        <button
          onClick={() => dispatch(redo())}
          disabled={!canRedo}
          className="flex-1 text-xs py-1.5 rounded bg-[#0f3460] hover:bg-[#1a4f8a] disabled:opacity-40 transition"
        >
          ↪ Ponów
        </button>
      </div>

      {/* Palette */}
      <div className="p-3 border-b border-[#0f3460]">
        <div className="text-xs text-gray-500 uppercase mb-2 tracking-wider">
          Paleta kolorów
        </div>
        <div className="flex flex-wrap gap-1 mb-3">
          {project.palette.colors.map((color) => (
            <div
              key={color.id}
              className="relative group"
            >
              <button
                title={`${color.name} (${color.hex})`}
                onClick={() => dispatch(setActiveColor(color.id))}
                className={`w-7 h-7 rounded-full border-2 transition ${
                  activeColorId === color.id
                    ? 'border-white scale-110'
                    : 'border-transparent hover:border-gray-400'
                }`}
                style={{ backgroundColor: color.hex }}
              />
              <button
                onClick={() => dispatch(removeColor({ projectId, colorId: color.id }))}
                className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full text-xs w-3.5 h-3.5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Add color */}
        <div className="flex gap-1 items-center mb-1">
          <input
            type="color"
            value={newColorHex}
            onChange={(e) => setNewColorHex(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
          />
          <input
            type="text"
            placeholder="Nazwa"
            value={newColorName}
            onChange={(e) => setNewColorName(e.target.value)}
            className="flex-1 bg-[#0f3460] text-white text-xs px-2 py-1.5 rounded focus:outline-none"
          />
        </div>
        <button
          onClick={handleAddColor}
          className="w-full text-xs py-1.5 bg-[#0f3460] hover:bg-[#1a4f8a] rounded transition"
        >
          + Dodaj kolor
        </button>
      </div>

      {/* Segments */}
      <div className="p-3">
        <div className="text-xs text-gray-500 uppercase mb-2 tracking-wider">
          Segmenty
        </div>
        <div className="flex flex-col gap-1">
          {project.segments.map((seg, i) => (
            <button
              key={seg.id}
              onClick={() => dispatch(setSelectedSegment(seg.id))}
              className={`text-left px-2 py-1.5 rounded text-xs transition ${
                selectedSegmentId === seg.id
                  ? 'bg-[#e94560] text-white'
                  : 'bg-[#0f3460] hover:bg-[#1a4f8a] text-gray-300'
              }`}
            >
              Segment {i + 1}
              {project.symmetry.mode === 'radial' &&
                project.symmetry.sourceSegmentId === seg.id && (
                  <span className="ml-1 text-yellow-400">★</span>
                )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}