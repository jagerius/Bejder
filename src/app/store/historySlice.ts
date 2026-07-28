typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { PatternMap } from '@/shared/types';
import { HISTORY_LIMIT } from '@/shared/constants';

interface HistoryState {
  past: Array<{ patternMap: PatternMap; description: string }>;
  future: Array<{ patternMap: PatternMap; description: string }>;
}

const initialState: HistoryState = {
  past: [],
  future: [],
};

const historySlice = createSlice({
  name: 'history',
  initialState,
  reducers: {
    pushHistory: (
      state,
      action: PayloadAction<{ patternMap: PatternMap; description: string }>
    ) => {
      state.past.push(action.payload);
      if (state.past.length > HISTORY_LIMIT) {
        state.past.shift();
      }
      state.future = [];
    },

    undo: (state) => {
      if (state.past.length === 0) return;
      const last = state.past.pop()!;
      state.future.unshift(last);
    },

    redo: (state) => {
      if (state.future.length === 0) return;
      const next = state.future.shift()!;
      state.past.push(next);
    },

    clearHistory: (state) => {
      state.past = [];
      state.future = [];
    },
  },
});

export const { pushHistory, undo, redo, clearHistory } = historySlice.actions;
export default historySlice.reducer;