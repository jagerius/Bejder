tsx
import { useCallback, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { ProjectionEngine } from '@/domain/projection/ProjectionEngine';
import { downloadProjectJSON } from '@/shared/utils/persistence';
import type { Project } from '@/shared/types';

interface ExportPanelProps {
  project: Project;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface BomEntry {
  colorId: string;
  name: string;
  hex: string;
  rgb: RgbColor;
  count: number;
}

const HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const PAGE_WIDTH_MM = 297;
const PAGE_HEIGHT_MM = 210;
const MARGIN_MM = 14;
const LINE_HEIGHT_MM = 8;
// Fix #3: maksymalny czas oczekiwania na toBlob/FileReader — 30 s
const CANVAS_TO_DATA_URL_TIMEOUT_MS = 30_000;

function hexToRgb(hex: string): RgbColor | null {
  if (!HEX_PATTERN.test(hex)) return null;
  let normalized = hex.slice(1);
  if (normalized.length === 3) {
    normalized = normalized.split('').map((c) => c + c).join('');
  } else if (normalized.length === 8) {
    normalized = normalized.slice(0, 6);
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r, g, b };
}

function ensureLineSpace(pdf: jsPDF, cursorY: number, title?: string): number {
  if (cursorY + LINE_HEIGHT_MM <= PAGE_HEIGHT_MM - MARGIN_MM) return cursorY;
  pdf.addPage('a4', 'landscape');
  if (title) {
    pdf.setFontSize(12);
    pdf.text(title, MARGIN_MM, MARGIN_MM + 2);
    return MARGIN_MM + LINE_HEIGHT_MM + 4;
  }
  return MARGIN_MM;
}

// Fix #3: timeout 30 s — jeśli toBlob lub FileReader nie odpowie (np. zawieszony
// GPU context), Promise jest odrzucany i isExporting resetowany przez finally
// w handleExportPdf zamiast pozostawać true na zawsze
function canvasToDataURL(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('canvasToDataURL: przekroczono limit czasu (30 s)'));
    }, CANVAS_TO_DATA_URL_TIMEOUT_MS);

    const cleanup = () => clearTimeout(timeoutId);

    canvas.toBlob((blob) => {
      if (!blob) {
        cleanup();
        reject(new Error('toBlob zwrócił null'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        cleanup();
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('FileReader zwrócił nie-string wynik'));
        }
      };
      reader.onerror = () => {
        cleanup();
        reject(reader.error ?? new Error('FileReader błąd'));
      };
      reader.readAsDataURL(blob);
    }, 'image/png');
  });
}

export default function ExportPanel({ project }: ExportPanelProps) {
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const colorMap = useMemo(
    () => new Map(project.palette.colors.map((color) => [color.id, color])),
    [project.palette.colors]
  );

  const paletteWithRgb = useMemo(
    () => project.palette.colors.map((color) => ({ ...color, rgb: hexToRgb(color.hex) })),
    [project.palette.colors]
  );

  const invalidColors = useMemo(
    () => paletteWithRgb.filter((color) => color.rgb === null),
    [paletteWithRgb]
  );

  const bomEntries = useMemo<BomEntry[]>(() => {
    const counts = new Map<string, number>();
    for (const colorId of Object.values(project.patternMap)) {
      counts.set(colorId, (counts.get(colorId) ?? 0) + 1);
    }
    return paletteWithRgb
      .filter((color): color is typeof color & { rgb: RgbColor } => color.rgb !== null)
      .map((color) => ({
        colorId: color.id,
        name: color.name,
        hex: color.hex,
        rgb: color.rgb,
        count: counts.get(color.id) ?? 0,
      }));
  }, [paletteWithRgb, project.patternMap]);

  // Fix #1: przywrócono cellId w rowInstructions — był potrzebny downstream (np. PDF renderer)
  // Fix #2: wzorzec ?? + set zamiast podwójnego rowMap.get(cell.row) —
  // jedna operacja lookup na komórkę, spójne z wzorcem z MaterialsPanel
  const rowInstructions = useMemo(() => {
    const rowMap = new Map<number, { cellId: string; colorHex: string; colorName: string }[]>();
    for (const segment of project.segments) {
      for (const cell of segment.cells) {
        const colorId = project.patternMap[cell.id];
        if (!colorId) continue;
        const color = colorMap.get(colorId);
        if (!color) continue;
        const bucket = rowMap.get(cell.row) ?? [];
        if (bucket.length === 0) {
          rowMap.set(cell.row, bucket);
        }
        bucket.push({ cellId: cell.id, colorHex: color.hex, colorName: color.name });
      }
    }
    return Array.from(rowMap.entries()).sort(([a], [b]) => a - b);
  }, [project.segments, project.patternMap, colorMap]);

  const handleExportPdf = useCallback(async () => {
    if (invalidColors.length > 0) {
      setExportError(
        `Nieprawidłowy format koloru HEX: ${invalidColors
          .map((c) => `${c.name} (${c.hex})`)
          .join(', ')}`
      );
      return;
    }

    setIsExporting(true);
    setExportError(null);

    try {
      const engine = new ProjectionEngine(project);
      const result = engine.project2D();
      const image = await canvasToDataURL(result.textureCanvas);

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      pdf.setFontSize(16);
      pdf.text(project.name, MARGIN_MM, 16);
      pdf.setFontSize(10);
      pdf.text(
        `Średnica: ${project.ornamentSpec.diameterMm} mm · Segmenty: ${project.ornamentSpec.segmentCount} · Rzędy: ${project.ornamentSpec.segmentRows}`,
        MARGIN_MM,
        24
      );
      pdf.addImage(image, 'PNG', MARGIN_MM, 32, PAGE_WIDTH_MM - 2 * MARGIN_MM, 134.5);

      let cursorY = ensureLineSpace(pdf, 176, 'Lista materiałów (BOM)');
      pdf.setFontSize(12);
      pdf.text('Lista materiałów (BOM)', MARGIN_MM, cursorY);
      cursorY += LINE_HEIGHT_MM;
      pdf.setFontSize(10);
      for (const entry of bomEntries) {
        cursorY = ensureLineSpace(pdf, cursorY, 'Lista materiałów (BOM) — cd.');
        pdf.setFillColor(entry.rgb.r, entry.rgb.g, entry.rgb.b);
        pdf.rect(MARGIN_MM, cursorY - 4, 6, 6, 'F');
        pdf.setTextColor(30, 30, 30);
        pdf.text(`${entry.name} (${entry.hex}) — ${entry.count} szt.`, MARGIN_MM + 10, cursorY);
        cursorY += LINE_HEIGHT_MM;
      }

      cursorY = ensureLineSpace(pdf, cursorY + LINE_HEIGHT_MM, 'Schemat rzędów');
      pdf.setFontSize(12);
      pdf.text('Schemat rzędów', MARGIN_MM, cursorY);
      cursorY += LINE_HEIGHT_MM;
      pdf.setFontSize(9);
      for (const [row, cells] of rowInstructions) {
        cursorY = ensureLineSpace(pdf, cursorY, 'Schemat rzędów — cd.');
        pdf.setTextColor(30, 30, 30);
        pdf.text(`Rząd ${row + 1}:`, MARGIN_MM, cursorY);
        let cellX = MARGIN_MM + 22;
        for (const cell of cells) {
          const rgb = hexToRgb(cell.colorHex);
          if (rgb) {
            pdf.setFillColor(rgb.r, rgb.g, rgb.b);
            pdf.rect(cellX, cursorY - 3.5, 5, 5, 'F');
          }
          pdf.setTextColor(60, 60, 60);
          pdf.text(cell.colorName.slice(0, 6), cellX + 6, cursorY);
          cellX += 26;
          if (cellX > PAGE_WIDTH_MM - MARGIN_MM - 30) {
            cellX = MARGIN_MM + 22;
            cursorY += LINE_HEIGHT_MM;
            cursorY = ensureLineSpace(pdf, cursorY, 'Schemat rzędów — cd.');
          }
        }
        cursorY += LINE_HEIGHT_MM + 2;
      }

      pdf.save(`${project.name}.pdf`);
    } catch (error) {
      console.error('[ExportPanel] Eksport PDF nie powiódł się:', error);
      setExportError('Eksport PDF nie powiódł się.');
    } finally {
      setIsExporting(false);
    }
  }, [project, invalidColors, bomEntries, rowInstructions]);

  const handleExportJson = useCallback(() => {
    setIsExporting(true);
    setExportError(null);
    try {
      downloadProjectJSON(project);
    } catch (error) {
      console.error('[ExportPanel] Eksport JSON nie powiódł się:', error);
      setExportError('Eksport JSON nie powiódł się.');
    } finally {
      setIsExporting(false);
    }
  }, [project]);

  return (
    <section aria-label="Panel eksportu" className="export-panel">
      <h2>Eksport</h2>

      <div className="export-panel__actions">
        <button type="button" onClick={handleExportPdf} disabled={isExporting}>
          {isExporting ? 'Eksportowanie…' : 'Eksportuj PDF'}
        </button>
        <button type="button" onClick={handleExportJson} disabled={isExporting}>
          {isExporting ? 'Eksportowanie…' : 'Eksportuj JSON'}
        </button>
      </div>

      {exportError ? (
        <p role="alert" className="export-panel__error">
          {exportError}
        </p>
      ) : null}

      <section aria-label="Lista materiałów">
        <h3>Lista materiałów (BOM)</h3>
        <ul>
          {bomEntries.map((entry) => (
            <li key={entry.colorId}>
              <span
                aria-hidden="true"
                style={{ backgroundColor: entry.hex, display: 'inline-block', width: 12, height: 12, borderRadius: 2, marginRight: 6 }}
              />
              {entry.name} ({entry.hex}) — {entry.count} szt.
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}