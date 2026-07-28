typescript
export type BeadColorRef = string | null;

export interface BeadColor {
  id: string;
  name: string;
  hex: string;
  materialCode?: string;
}

export interface BeadCell {
  id: string;
  row: number;
  col: number;
  localU: number;
  localV: number;
  color: BeadColorRef;
  locked?: boolean;
  derivedFrom?: string;
}

export interface SegmentTemplate {
  id: string;
  rows: number;
  cells: BeadCell[];
  edgeRules: {
    leftJoin: boolean;
    rightJoin: boolean;
    topJoin: boolean;
  };
}

export interface OrnamentSpec {
  diameterMm: number;
  segmentCount: number;
  segmentRows: number;
  constructionType: 'triangular-modular';
}

export interface Palette {
  colors: BeadColor[];
}

export type PatternMap = Record<string, BeadColorRef>;

export interface SymmetryConfig {
  mode: 'none' | 'radial' | 'axial' | 'segmental';
  sourceSegmentId: string | null;
}

export interface ProjectionConfig {
  type: 'mercator' | 'segment-aware';
  resolution: number;
}

export interface ProjectMetadata {
  author: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  version: string;
  schemaVersion: string;
  projectId: string;
  name: string;
  ornamentSpec: OrnamentSpec;
  palette: Palette;
  segments: SegmentTemplate[];
  patternMap: PatternMap;
  symmetry: SymmetryConfig;
  projectionConfig: ProjectionConfig;
  metadata: ProjectMetadata;
}

export type EditorTool =
  | 'pencil'
  | 'fill'
  | 'eraser'
  | 'picker'
  | 'line'
  | 'mirror';

export interface EditorState {
  activeTool: EditorTool;
  activeColorId: string | null;
  selectedSegmentId: string | null;
  hoveredCellId: string | null;
  selectedCells: Set<string>;
  zoom: number;
  panX: number;
  panY: number;
}

export interface HistoryEntry {
  patternMap: PatternMap;
  description: string;
  timestamp: number;
}

export interface SphericalProjectionResult {
  textureCanvas: HTMLCanvasElement;
  segmentUVMap: Map<string, { u: number; v: number }[]>;
}

export interface BeadCellRef {
  segmentId: string;
  cellId: string;
  cell: BeadCell;
}

export interface ValidationWarning {
  type: 'missing-color' | 'isolated-bead' | 'too-many-colors' | 'seam-conflict';
  message: string;
  severity: 'error' | 'warning' | 'info';
  cellIds?: string[];
}

export type OrnamentSize = 'small' | 'medium' | 'large' | 'custom';

export interface OrnamentPreset {
  size: OrnamentSize;
  diameterMm: number;
  segmentCount: number;
  segmentRows: number;
}