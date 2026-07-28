typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { EditorTool } from '@/shared/types';

interface EditorSliceState {
  activeTool: EditorTool;
  activeColorId: string | null;
  selectedSegmentId: string | null;
  hoveredCellId: string | null;
  zoom: number;
  panX: number;
  panY: number;
}

const initialState: EditorSliceState = {
  activeTool: 'pencil',
  activeColorId: null,
  selectedSegmentId: null,
  hoveredCellId: null,
  zoom: 1,
  panX: 0,
  panY: 0,
};

const editorSlice = createSlice({
  name: 'editor',
  initialState,
  reducers: {
    setActiveTool: (state, action: PayloadAction<EditorTool>) => {
      state.activeTool = action.payload;
    },
    setActiveColor: (state, action: PayloadAction<string | null>) => {
      state.activeColorId = action.payload;
    },
    setSelectedSegment: (state, action: PayloadAction<string | null>) => {
      state.selectedSegmentId = action.payload;
    },
    setHoveredCell: (state, action: PayloadAction<string | null>) => {
      state.hoveredCellId = action.payload;
    },
    setZoom: (state, action: PayloadAction<number>) => {
      state.zoom = Math.max(0.5, Math.min(4, action.payload));
    },
    setPan: (state, action: PayloadAction<{ x: number; y: number }>) => {
      state.panX = action.payload.x;
      state.panY = action.payload.y;
    },
    resetView: (state) => {
      state.zoom = 1;
      state.panX = 0;
      state.panY = 0;
    },
  },
});

export const {
  setActiveTool,
  setActiveColor,
  setSelectedSegment,
  setHoveredCell,
  setZoom,
  setPan,
  resetView,
} = editorSlice.actions;

export default editorSlice.reducer;