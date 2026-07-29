typescript
import type { Project } from '@/shared/types';

export interface Projection2DResult {
  textureCanvas: HTMLCanvasElement;
}

export class ProjectionEngine {
  constructor(private readonly project: Project) {}

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

    return { textureCanvas: canvas };
  }
}