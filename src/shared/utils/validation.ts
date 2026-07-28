typescript
import type { Project, ValidationWarning } from '../types';

export function validateProject(project: Project): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // Sprawdź niekolorowane komórki
  const uncolored: string[] = [];
  for (const seg of project.segments) {
    for (const cell of seg.cells) {
      if (!project.patternMap[cell.id]) {
        uncolored.push(cell.id);
      }
    }
  }
  if (uncolored.length > 0) {
    warnings.push({
      type: 'missing-color',
      message: `${uncolored.length} komórek nie ma przypisanego koloru.`,
      severity: 'warning',
      cellIds: uncolored,
    });
  }

  // Sprawdź liczbę kolorów
  const usedColors = new Set(
    Object.values(project.patternMap).filter(Boolean)
  );
  if (usedColors.size > 8) {
    warnings.push({
      type: 'too-many-colors',
      message: `Wzór używa ${usedColors.size} kolorów. Dla czytelności zalecamy max 6.`,
      severity: 'info',
    });
  }

  return warnings;
}