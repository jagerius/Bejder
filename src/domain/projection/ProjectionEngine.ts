typescript
import type { Project } from '@/shared/types';

export interface Projection2DResult {
  textureCanvas: HTMLCanvasElement;
}

export class ProjectionEngine {
  constructor(private readonly project: Project) {}

  /**
   * Mapuje id komórki na znormalizowane współrzędne UV na sferze
   * na podstawie numeru segmentu i pozycji komórki w segmencie.
   */
  buildSegmentUVMap(): Map<string, { u: number; v: number }> {
    const uvMap = new Map<string, { u: number; v: number }>();
    const segmentCount = this.project.ornamentSpec.segmentCount;
    const segmentRows = this.project.ornamentSpec.segmentRows;

    this.project.segments.forEach((segment, segmentIndex) => {
      const uBase = segmentIndex / segmentCount;
      const uStep = 1 / segmentCount;

      segment.cells.forEach((cell) => {
        const v = segmentRows > 0 ? cell.row / segmentRows : 0;
        const u = uBase + (cell.col / Math.max(1, cell.row + 1)) * uStep;
        uvMap.set(cell.id, { u, v });
      });
    });

    return uvMap;
  }

  /**
   * Zwraca id komórki, której środek UV jest najbliższy podanym
   * współrzędnym sferycznym (u, v ∈ [0, 1]).
   * Zwraca null jeśli mapa jest pusta.
   */
  pickCellFromSphereUV(
    targetU: number,
    targetV: number,
    uvMap: Map<string, { u: number; v: number }>
  ): string | null {
    let bestId: string | null = null;
    let bestDist = Infinity;

    for (const [cellId, { u, v }] of uvMap) {
      const du = targetU - u;
      const dv = targetV - v;
      const dist = du * du + dv * dv;
      if (dist < bestDist) {
        bestDist = dist;
        bestId = cellId;
      }
    }

    return bestId;
  }

  project2D(): Projection2DResult {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Nie udało się utworzyć kontekstu 2D.');
    }

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Zbuduj mapę UV dla wszystkich komórek
    const uvMap = this.buildSegmentUVMap();

    // Zbuduj mapę kolorów z palety projektu
    const colorMap = new Map(
      this.project.palette.colors.map((color) => [color.id, color.hex])
    );

    const W = canvas.width;
    const H = canvas.height;
    const CELL_RADIUS_PX = Math.min(W, H) / (this.project.ornamentSpec.segmentRows * 4 + 4);

    // Renderuj każdy segment i każdą komórkę wzoru
    for (const segment of this.project.segments) {
      for (const cell of segment.cells) {
        const uv = uvMap.get(cell.id);
        if (!uv) continue;

        const cx = uv.u * W;
        const cy = uv.v * H;

        const colorId = this.project.patternMap[cell.id];
        ctx.fillStyle = colorId
          ? (colorMap.get(colorId) ?? '#888888')
          : '#2a2a3e';

        ctx.beginPath();
        ctx.arc(cx, cy, CELL_RADIUS_PX, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    return { textureCanvas: canvas };
  }
}