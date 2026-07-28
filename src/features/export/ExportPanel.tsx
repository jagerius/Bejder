tsx
import { useCallback, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { useAppSelector } from '@/app/store';
import { ProjectionEngine } from '@/domain/projection/ProjectionEngine';
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

function hexToRgb(hex: string): RgbColor | null {
  if (!HEX_PATTERN.test(hex)) {
    return null;
  }

  let normalized = hex.slice(1);
  if (normalized.length === 3) {
    normalized = normalized
      .split('')
      .map((char) => char + char)
      .join('');
  } else if (normalized.length === 8) {
    normalized = normalized.slice(0, 6);
  }

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return null;
  }
  return { r, g, b };
}

// Zapewnia miejsce na kolejną linię; w razie potrzeby dodaje nową stronę PDF.
// Chroni przed przepełnieniem strony we wszystkich sekcjach listowych (BOM, rzędy itp.).
function ensureLineSpace(pdf: jsPDF, cursorY: number, title?: string): number {
  if (cursorY + LINE_HEIGHT_MM <= PAGE_HEIGHT_MM - MARGIN_MM) {
    return cursorY;
  }
  pdf.addPage('a4', 'landscape');
  if (title) {
    pdf.setFontSize(12);
    pdf.text(title, MARGIN_MM, MARGIN_MM + 2);
    return MARGIN_MM + LINE_HEIGHT_MM + 4;
  }
  return MARGIN_MM;
}

export default function ExportPanel({ project }: ExportPanelProps) {
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const activeProjectId = useAppSelector((state) => state.projects.activeProjectId);

  const paletteWithRgb = useMemo(
    () =>
      project.palette.colors.map((color) => ({
        ...color,
        rgb: hexToRgb(color.hex),
      })),
    [project.palette.colors]
  );

  const invalidColors = useMemo(
    () => paletteWithRgb.filter((color) => color.rgb === null),
    [paletteWithRgb]
  );

  // Lista materiałów (BOM) — liczba koralików per kolor.
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

  const handleExportPdf = useCallback(() => {
    if (activeProjectId !== project.projectId) {
      setExportError('Projekt nie jest aktywny.');
      return;
    }
    if (invalidColors.length > 0) {
      setExportError(
        `Nieprawidłowy format koloru HEX: ${invalidColors
          .map((color) => `${color.name} (${color.hex})`)
          .join(', ')}`
      );
      return;
    }

    setIsExporting(true);
    setExportError(null);

    try {
      const engine = new ProjectionEngine(project);
      const result = engine.project2D();

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      pdf.setFontSize(16);
      pdf.text(project.name, MARGIN_MM, 16);
      pdf.setFontSize(10);
      pdf.text(
        `Średnica: ${project.ornamentSpec.diameterMm} mm · Segmenty: ${project.ornamentSpec.segmentCount} · Rzędy: ${project.ornamentSpec.segmentRows}`,
        MARGIN_MM,
        24
      );

      const image = result.textureCanvas.toDataURL('image/png');
      pdf.addImage(image, 'PNG', MARGIN_MM, 32, PAGE_WIDTH_MM - 2 * MARGIN_MM, 134.5);

      // Sekcja BOM z ochroną przed przepełnieniem strony.
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

      // Sekcja rzędów — również z ochroną przed przepełnieniem strony.
      cursorY = ensureLineSpace(pdf, cursorY + LINE_HEIGHT_MM, 'Schemat rzędów');
      pdf.setFontSize(12);
      pdf.text('Schemat rzędów', MARGIN_MM, cursorY);
      cursorY += LINE_HEIGHT_MM;

      pdf.setFontSize(10);
      for (let row = 0; row < project.ornamentSpec.segmentRows; row++) {
        cursorY = ensureLineSpace(pdf, cursorY, 'Schemat rzędów — cd.');
        pdf.text(
          `Rząd ${row + 1}: ${row + 1} kolumn(y) w segmencie`,
          MARGIN_MM,
          cursorY
        );
        cursorY += LINE_HEIGHT_MM;
      }

      pdf.save(`${project.name}.pdf`);
    } catch {
      setExportError('Eksport PDF nie powiódł się.');
    } finally {
      setIsExporting(false);
    }
  }, [activeProjectId, bomEntries, invalidColors, project]);

  return (
    <section aria-label="Panel eksportu" className="export-panel">
      <h2>Eksport</h2>

      <ul className="export-panel__palette">
        {bomEntries.map((entry) => (
          <li key={entry.colorId}>
            <span
              className="export-panel__swatch"
              style={{ backgroundColor: entry.hex }}
              aria-hidden="true"
            />
            <span>{entry.name}</span>
            <code>{entry.hex}</code>
            <span>{entry.count} szt.</span>
          </li>
        ))}
      </ul>

      {invalidColors.length > 0 ? (
        <ul className="export-panel__invalid-list">
          {invalidColors.map((color) => (
            <li key={color.id} role="alert">
              {color.name} ({color.hex}) — nieprawidłowy HEX
            </li>
          ))}
        </ul>
      ) : null}

      <button type="button" onClick={handleExportPdf} disabled={isExporting}>
        {isExporting ? 'Eksportowanie…' : 'Eksportuj do PDF'}
      </button>

      {exportError ? (
        <p role="alert" className="export-panel__error">
          {exportError}
        </p>
      ) : null}
    </section>
  );
}