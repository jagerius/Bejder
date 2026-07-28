typescript
import type {
  Project,
  SphericalProjectionResult,
  BeadCellRef,
} from '@/shared/types';
import { TEXTURE_RESOLUTION } from '@/shared/constants';
import { cellToSphereUV } from '@/shared/utils/geometry';

export class ProjectionEngine {
  private project: Project;

  constructor(project: Project) {
    this.project = project;
  }

  project2D(): SphericalProjectionResult {
    const canvas = this.generateTexture(TEXTURE_RESOLUTION);
    const segmentUVMap = this.buildSegmentUVMap();
    return { textureCanvas: canvas, segmentUVMap };
  }

  generateTexture(resolution: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = resolution;
    canvas.height = resolution / 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Nie można uzyskać kontekstu 2D dla canvas');
    }

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const { segments, patternMap, ornamentSpec, palette } = this.project;
    const colorMap = new Map(palette.colors.map((c) => [c.id, c.hex]));
    const segCount = ornamentSpec.segmentCount;
    const rows = ornamentSpec.segmentRows;

    // Fix #1: guard against division by zero when rows === 0
    if (rows <= 0) {
      throw new Error('ornamentSpec.segmentRows musi być większe od 0');
    }

    const beadHeight = (resolution / 2 / rows) * 0.5 * 0.85;
    const beadWidthByRow = Array.from({ length: rows }, (_, row) => {
      const colsInRow = row + 1;
      return (resolution / segCount / colsInRow) * 0.85;
    });

    for (let si = 0; si < segments.length; si++) {
      const segment = segments[si];

      for (const cell of segment.cells) {
        const color = patternMap[cell.id] ?? null;
        if (!color) continue;

        const hex = colorMap.get(color) ?? '#888';
        const uv = cellToSphereUV(si, segCount, rows, cell.row, cell.col);
        const beadW = beadWidthByRow[cell.row];
        if (beadW === undefined) continue;

        const px = uv.u * resolution;
        const py = uv.v * (resolution / 2);

        ctx.fillStyle = hex;
        ctx.beginPath();
        ctx.ellipse(px, py, beadW / 2, beadHeight / 2, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.ellipse(
          px - beadW * 0.1,
          py - beadHeight * 0.15,
          beadW * 0.2,
          beadHeight * 0.2,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }

    return canvas;
  }

  buildSegmentUVMap(): Map<string, { u: number; v: number }[]> {
    const map = new Map<string, { u: number; v: number }[]>();
    const { segments, ornamentSpec } = this.project;
    const segCount = ornamentSpec.segmentCount;
    const rows = ornamentSpec.segmentRows;

    for (let si = 0; si < segments.length; si++) {
      const segment = segments[si];
      const uvs: { u: number; v: number }[] = [];
      for (const cell of segment.cells) {
        uvs.push(cellToSphereUV(si, segCount, rows, cell.row, cell.col));
      }
      map.set(segment.id, uvs);
    }

    return map;
  }

  pickCellFromSphereUV(u: number, v: number): BeadCellRef | null {
    const { segments, ornamentSpec } = this.project;
    const segCount = ornamentSpec.segmentCount;
    const rows = ornamentSpec.segmentRows;

    let bestMatch: BeadCellRef | null = null;
    let bestDist = Infinity;

    for (let si = 0; si < segments.length; si++) {
      const segment = segments[si];
      for (const cell of segment.cells) {
        const cellUV = cellToSphereUV(si, segCount, rows, cell.row, cell.col);
        const du = u - cellUV.u;
        const dv = v - cellUV.v;
        const dist = du * du + dv * dv;
        if (dist < bestDist) {
          bestDist = dist;
          bestMatch = { segmentId: segment.id, cellId: cell.id, cell };
        }
      }
    }

    return bestDist < 0.001 ? bestMatch : null;
  }
}