typescript
import type { PatternMap } from '@/shared/types';

export interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
  generate: (segmentId: string, rows: number) => PatternMap;
}

export const BUILT_IN_TEMPLATES: Template[] = [
  {
    id: 'stripes',
    name: 'Pasy',
    description: 'Naprzemienne pasy dwukolorowe',
    icon: '🎄',
    generate: (segmentId, rows) => {
      const map: PatternMap = {};
      const colors = ['c1', 'c2'];
      for (let row = 0; row < rows; row++) {
        const colsInRow = row + 1;
        for (let col = 0; col < colsInRow; col++) {
          const cellId = `${segmentId}_r${row}_c${col}`;
          map[cellId] = colors[row % 2];
        }
      }
      return map;
    },
  },
  {
    id: 'diamond',
    name: 'Romb',
    description: 'Wzór rombowy',
    icon: '💎',
    generate: (segmentId, rows) => {
      const map: PatternMap = {};
      for (let row = 0; row < rows; row++) {
        const colsInRow = row + 1;
        for (let col = 0; col < colsInRow; col++) {
          const cellId = `${segmentId}_r${row}_c${col}`;
          const mid = (colsInRow - 1) / 2;
          const dist = Math.abs(col - mid);
          map[cellId] = dist <= row * 0.3 ? 'c3' : 'c1';
        }
      }
      return map;
    },
  },
  {
    id: 'gradient',
    name: 'Gradient',
    description: 'Gradient od góry do dołu',
    icon: '🌅',
    generate: (segmentId, rows) => {
      const map: PatternMap = {};
      const colors = ['c1', 'c3', 'c2', 'c4'];
      for (let row = 0; row < rows; row++) {
        const colsInRow = row + 1;
        const colorIdx = Math.floor((row / rows) * colors.length);
        for (let col = 0; col < colsInRow; col++) {
          const cellId = `${segmentId}_r${row}_c${col}`;
          map[cellId] = colors[Math.min(colorIdx, colors.length - 1)];
        }
      }
      return map;
    },
  },
];