typescript
import type { Project, BeadColor, PatternMap, Segment } from '@/shared/types';
import { FORMAT_VERSION, SCHEMA_VERSION } from '@/shared/constants';

const PALETTE_CLASSIC: BeadColor[] = [
  { id: 'c-red', name: 'Czerwony', hex: '#c0392b' },
  { id: 'c-gold', name: 'Złoty', hex: '#f39c12' },
  { id: 'c-green', name: 'Zielony', hex: '#27ae60' },
  { id: 'c-blue', name: 'Niebieski', hex: '#2980b9' },
  { id: 'c-white', name: 'Biały', hex: '#ecf0f1' },
  { id: 'c-black', name: 'Czarny', hex: '#2c3e50' },
];

const PALETTE_PASTEL: BeadColor[] = [
  { id: 'p-pink', name: 'Różowy', hex: '#f8a5c2' },
  { id: 'p-mint', name: 'Miętowy', hex: '#78e08f' },
  { id: 'p-sky', name: 'Błękitny', hex: '#82ccdd' },
  { id: 'p-lavender', name: 'Lawendowy', hex: '#b8b8e0' },
  { id: 'p-cream', name: 'Kremowy', hex: '#f6e58d' },
  { id: 'p-white', name: 'Biały', hex: '#f9f9f9' },
];

const PALETTE_METALLIC: BeadColor[] = [
  { id: 'm-gold', name: 'Złoty metalik', hex: '#d4a017' },
  { id: 'm-silver', name: 'Srebrny metalik', hex: '#b0b7bc' },
  { id: 'm-copper', name: 'Miedziany', hex: '#b87333' },
  { id: 'm-bronze', name: 'Brązowy', hex: '#cd7f32' },
  { id: 'm-black', name: 'Czarny metalik', hex: '#1a1a1a' },
];

function buildSegments(segmentCount: number, segmentRows: number): Segment[] {
  const segments: Segment[] = [];
  for (let si = 0; si < segmentCount; si++) {
    const cells = [];
    for (let row = 0; row < segmentRows; row++) {
      const colsInRow = row + 1;
      for (let col = 0; col < colsInRow; col++) {
        cells.push({ id: `s${si}-r${row}-c${col}`, row, col });
      }
    }
    segments.push({ id: `segment-${si}`, index: si, cells });
  }
  return segments;
}

function buildStripesPattern(segments: Segment[], colorIds: string[]): PatternMap {
  const map: PatternMap = {};
  for (const segment of segments) {
    for (const cell of segment.cells) {
      map[cell.id] = colorIds[cell.row % colorIds.length];
    }
  }
  return map;
}

function buildRadialPattern(segments: Segment[], colorIds: string[]): PatternMap {
  const map: PatternMap = {};
  segments.forEach((segment, si) => {
    const colorId = colorIds[si % colorIds.length];
    for (const cell of segment.cells) {
      map[cell.id] = colorId;
    }
  });
  return map;
}

function buildGradientPattern(segments: Segment[], colorIds: string[]): PatternMap {
  const map: PatternMap = {};
  for (const segment of segments) {
    const rows = Math.max(...segment.cells.map((c) => c.row)) + 1;
    for (const cell of segment.cells) {
      const t = rows > 1 ? cell.row / (rows - 1) : 0;
      map[cell.id] = colorIds[Math.min(colorIds.length - 1, Math.floor(t * colorIds.length))];
    }
  }
  return map;
}

interface TemplateOptions {
  name: string;
  author: string;
  diameterMm: number;
  segmentCount: number;
  segmentRows: number;
  palette: BeadColor[];
  patternMap: PatternMap;
}

function buildProject(options: TemplateOptions): Project {
  const now = new Date().toISOString();
  const segments = buildSegments(options.segmentCount, options.segmentRows);
  return {
    version: FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    projectId: `template-${options.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
    name: options.name,
    ornamentSpec: {
      diameterMm: options.diameterMm,
      segmentCount: options.segmentCount,
      segmentRows: options.segmentRows,
      constructionType: 'triangular-modular',
    },
    palette: { colors: options.palette },
    segments,
    patternMap: options.patternMap,
    symmetry: { mode: 'radial', sourceSegmentId: null },
    projectionConfig: { type: 'mercator', resolution: 2048 },
    metadata: { author: options.author, createdAt: now, updatedAt: now },
  };
}

export function createClassicStripesTemplate(author = 'Szablon'): Project {
  const segments = buildSegments(8, 6);
  return buildProject({
    name: 'Klasyczne pasy',
    author,
    diameterMm: 80,
    segmentCount: 8,
    segmentRows: 6,
    palette: PALETTE_CLASSIC,
    patternMap: buildStripesPattern(segments, PALETTE_CLASSIC.map((c) => c.id)),
  });
}

export function createRadialClassicTemplate(author = 'Szablon'): Project {
  const segments = buildSegments(8, 6);
  return buildProject({
    name: 'Klasyczny promienisty',
    author,
    diameterMm: 80,
    segmentCount: 8,
    segmentRows: 6,
    palette: PALETTE_CLASSIC,
    patternMap: buildRadialPattern(segments, PALETTE_CLASSIC.map((c) => c.id)),
  });
}

export function createPastelGradientTemplate(author = 'Szablon'): Project {
  const segments = buildSegments(8, 6);
  return buildProject({
    name: 'Pastelowy gradient',
    author,
    diameterMm: 80,
    segmentCount: 8,
    segmentRows: 6,
    palette: PALETTE_PASTEL,
    patternMap: buildGradientPattern(segments, PALETTE_PASTEL.map((c) => c.id)),
  });
}

export function createMetallicRadialTemplate(author = 'Szablon'): Project {
  const segments = buildSegments(8, 6);
  return buildProject({
    name: 'Metaliczny promienisty',
    author,
    diameterMm: 80,
    segmentCount: 8,
    segmentRows: 6,
    palette: PALETTE_METALLIC,
    patternMap: buildRadialPattern(segments, PALETTE_METALLIC.map((c) => c.id)),
  });
}

export function createEmptyTemplate(author = 'Szablon'): Project {
  return buildProject({
    name: 'Pusty projekt',
    author,
    diameterMm: 80,
    segmentCount: 8,
    segmentRows: 6,
    palette: PALETTE_CLASSIC,
    patternMap: {},
  });
}

/*
 * Fix #4: wcześniej wiszący tekst komentarza był poza blokiem komentarza
 * i powodował błąd kompilacji TypeScript — teraz poprawnie zamknięty w /* *&#47;.
 *
 * Eksportowane szablony:
 *   createClassicStripesTemplate
 *   createRadialClassicTemplate
 *   createPastelGradientTemplate
 *   createMetallicRadialTemplate
 *   createEmptyTemplate
 */