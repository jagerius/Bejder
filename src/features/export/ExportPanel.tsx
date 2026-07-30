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

function canvasToDataURL(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      fn();
    };

    const timeoutId = setTimeout(() => {
      settle(() =>
        reject(new Error('canvasToDataURL: przekroczono limit czasu (30 s)'))
      );
    }, CANVAS_TO_DATA_URL_TIMEOUT_MS);

    canvas.toBlob((blob) => {
      if (!blob) {
        settle(() => reject(new Error('toBlob zwrócił null')));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        settle(() => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error('FileReader zwrócił nie-string wynik'));
          }
        });
      };
      reader.onerror = () => {
        settle(() => reject(reader.error ?? new Error('FileReader błąd')));
      };
      reader.readAsDataURL(blob);
    }, 'image/png');
  });
}

function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string): void {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function downloadBomAsCsv(bomEntries: BomEntry[], filename: string): void {
  const header = 'ID,Kolor,HEX,R,G,B,Ilość\n';
  const rows = bomEntries
    .map((e) => `${e.colorId},${e.name},${e.hex},${e.rgb.r},${e.rgb.g},${e.rgb.b},${e.count}`)
    .join('\n');
  const csvContent = header + rows;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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

  const rowInstructions = useMemo(() => {
    const rowMap = new Map<number, { colorName: string }[]>();
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
        bucket.push({ colorName: color.name });
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

    setExportError(null);
    setIsExporting(true);

    try {
      const engine = new ProjectionEngine(project);
      const { textureCanvas } = engine.project2D();
      const textureDataUrl = await canvasToDataURL(textureCanvas);

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      pdf.setFontSize(16);
      pdf.text(`Instrukcja ornamentu — ${project.name}`, MARGIN_MM, MARGIN_MM + 4);

      pdf.setFontSize(10);
      pdf.text(
        `Średnica: ${project.ornamentSpec.diameterMm} mm | Segmenty: ${project.ornamentSpec.segmentCount} | Rzędy: ${project.ornamentSpec.segmentRows}`,
        MARGIN_MM,
        MARGIN_MM + 12
      );

      const imgWidth = PAGE_WIDTH_MM - 2 * MARGIN_MM;
      const imgHeight = (textureCanvas.height / textureCanvas.width) * imgWidth;
      pdf.addImage(textureDataUrl, 'PNG', MARGIN_MM, MARGIN_MM + 18, imgWidth, imgHeight);

      pdf.addPage('a4', 'landscape');
      pdf.setFontSize(12);
      pdf.text('Lista materiałów (BOM)', MARGIN_MM, MARGIN_MM + 2);

      let cursorY = MARGIN_MM + LINE_HEIGHT_MM + 4;
      for (const entry of bomEntries) {
        cursorY = ensureLineSpace(pdf, cursorY, 'Lista materiałów (BOM) — cd.');
        pdf.setFillColor(entry.rgb.r, entry.rgb.g, entry.rgb.b);
        pdf.rect(MARGIN_MM, cursorY - 3, 5, 5, 'F');
        pdf.setFontSize(10);
        pdf.text(
          `${entry.name} (${entry.hex}) — ${entry.count} szt.`,
          MARGIN_MM + 8,
          cursorY
        );
        cursorY += LINE_HEIGHT_MM;
      }

      pdf.addPage('a4', 'landscape');
      pdf.setFontSize(12);
      pdf.text('Instrukcja koralikowania rzędami', MARGIN_MM, MARGIN_MM + 2);

      cursorY = MARGIN_MM + LINE_HEIGHT_MM + 4;
      const maxTextWidth = PAGE_WIDTH_MM - 2 * MARGIN_MM;

      for (const [rowNum, cells] of rowInstructions) {
        const rowText = `Rząd ${rowNum + 1}: ${cells.map((c) => c.colorName).join(', ')}`;
        const wrappedLines = pdf.splitTextToSize(rowText, maxTextWidth) as string[];

        for (const line of wrappedLines) {
          cursorY = ensureLineSpace(pdf, cursorY, 'Instrukcja koralikowania — cd.');
          pdf.setFontSize(10);
          pdf.text(line, MARGIN_MM, cursorY);
          cursorY += LINE_HEIGHT_MM;
        }
      }

      pdf.save(`${project.name}-instrukcja.pdf`);
    } catch (error) {
      console.error('[ExportPanel] Błąd eksportu PDF:', error);
      setExportError(
        `Nie udało się wyeksportować PDF: ${error instanceof Error ? error.message : 'nieznany błąd'}`
      );
    } finally {
      setIsExporting(false);
    }
  }, [bomEntries, invalidColors, project, rowInstructions]);

  const handleExportJson = useCallback(() => {
    setExportError(null);
    try {
      downloadProjectJSON(project);
    } catch (error) {
      console.error('[ExportPanel] Błąd eksportu JSON:', error);
      setExportError(
        `Nie udało się wyeksportować JSON: ${error instanceof Error ? error.message : 'nieznany błąd'}`
      );
    }
  }, [project]);

  const handleExportPng = useCallback(async () => {
    setExportError(null);
    setIsExporting(true);
    try {
      const engine = new ProjectionEngine(project);
      const { textureCanvas } = engine.project2D();
      downloadCanvasAsPng(textureCanvas, `${project.name}-rzut2d.png`);
    } catch (error) {
      console.error('[ExportPanel] Błąd eksportu PNG:', error);
      setExportError(
        `Nie udało się wyeksportować PNG: ${error instanceof Error ? error.message : 'nieznany błąd'}`
      );
    } finally {
      setIsExporting(false);
    }
  }, [project]);

  const handleExportCsv = useCallback(() => {
    setExportError(null);
    try {
      downloadBomAsCsv(bomEntries, `${project.name}-bom.csv`);
    } catch (error) {
      console.error('[ExportPanel] Błąd eksportu CSV:', error);
      setExportError(
        `Nie udało się wyeksportować CSV: ${error instanceof Error ? error.message : 'nieznany błąd'}`
      );
    }
  }, [bomEntries, project]);

  return (
    <section aria-label="Eksport projektu" className="export-panel">
      <h2>Eksport</h2>

      {invalidColors.length > 0 ? (
        <div role="alert" className="export-panel__warning">
          <strong>Nieprawidłowe kolory w palecie:</strong>
          <ul>
            {invalidColors.map((color) => (
              <li key={color.id}>
                {color.name} — nieprawidłowy HEX: <code>{color.hex}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {exportError ? (
        <p role="alert" className="export-panel__error">
          {exportError}
        </p>
      ) : null}

      <div className="export-panel__actions">
        <button
          type="button"
          disabled={isExporting}
          onClick={handleExportPdf}
        >
          {isExporting ? 'Generowanie PDF…' : 'Eksportuj PDF (instrukcja)'}
        </button>
        <button
          type="button"
          disabled={isExporting}
          onClick={handleExportJson}
        >
          Eksportuj JSON (projekt)
        </button>
        <button
          type="button"
          disabled={isExporting}
          onClick={handleExportPng}
        >
          Eksportuj PNG (rzut 2D)
        </button>
        <button
          type="button"
          disabled={isExporting}
          onClick={handleExportCsv}
        >
          Eksportuj CSV (BOM)
        </button>
      </div>

      <section aria-label="Lista materiałów" className="export-panel__bom">
        <h3>Lista materiałów</h3>
        {bomEntries.length === 0 ? (
          <p>Brak pomalowanych komórek.</p>
        ) : (
          <ul>
            {bomEntries.map((entry) => (
              <li key={entry.colorId} className="export-panel__bom-item">
                <span
                  className="export-panel__swatch"
                  aria-hidden="true"
                  style={
                    {
                      '--swatch-color': entry.hex,
                      backgroundColor: entry.hex,
                      display: 'inline-block',
                      width: '12px',
                      height: '12px',
                      borderRadius: '2px',
                      border: '1px solid rgba(0,0,0,0.2)',
                      flexShrink: 0,
                    } as React.CSSProperties
                  }
                />
                <span>{entry.name}</span>
                <span>{entry.hex}</span>
                <span>{entry.count} szt.</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}