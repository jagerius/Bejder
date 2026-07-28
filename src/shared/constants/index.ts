typescript
import type { OrnamentPreset } from '../types';

export const ORNAMENT_PRESETS: Record<string, OrnamentPreset> = {
  small: {
    size: 'small',
    diameterMm: 60,
    segmentCount: 6,
    segmentRows: 10,
  },
  medium: {
    size: 'medium',
    diameterMm: 80,
    segmentCount: 8,
    segmentRows: 14,
  },
  large: {
    size: 'large',
    diameterMm: 100,
    segmentCount: 10,
    segmentRows: 18,
  },
};

export const DEFAULT_PALETTE = [
  { id: 'c1', name: 'Biały', hex: '#F5F5F5', materialCode: '11/0-White' },
  { id: 'c2', name: 'Czerwony', hex: '#C62828', materialCode: '11/0-Red' },
  { id: 'c3', name: 'Złoty', hex: '#FFD700', materialCode: '11/0-Gold' },
  { id: 'c4', name: 'Zielony', hex: '#2E7D32', materialCode: '11/0-Green' },
  { id: 'c5', name: 'Granatowy', hex: '#1A237E', materialCode: '11/0-Navy' },
  { id: 'c6', name: 'Srebrny', hex: '#B0BEC5', materialCode: '11/0-Silver' },
];

export const SCHEMA_VERSION = '1.0.0';
export const FORMAT_VERSION = '1.0.0';

export const HISTORY_LIMIT = 100;
export const AUTOSAVE_INTERVAL_MS = 15000;
export const TEXTURE_RESOLUTION = 1024;

export const TOOL_LABELS: Record<string, string> = {
  pencil: 'Ołówek',
  fill: 'Wiadro',
  eraser: 'Gumka',
  picker: 'Pipeta',
  line: 'Linia',
  mirror: 'Lustro',
};