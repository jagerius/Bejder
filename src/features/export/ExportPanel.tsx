tsx
import React, { useRef } from 'react';
import { useAppSelector } from '@/app/store';
import { exportProjectToJSON } from '@/shared/utils/persistence';
import { ProjectionEngine } from '@/domain/projection/ProjectionEngine';
import { countBeadsByColor } from '@/shared/utils/geometry';
import jsPDF from 'jspdf';

interface ExportPanelProps {
  projectId: string;
}

export default function ExportPanel({ projectId }: ExportPanelProps) {
  const project = useAppSelector((state) =>
    state.projects.projects.find((p) => p.projectId === projectId)
  );

  if (!project) return null;

  function handleExportJSON() {
    exportProjectToJSON(project!);
  }

  function handleExportPNG() {
    if (!project) return;
    const engine = new ProjectionEngine(project);
    const canvas = engine.generateTexture(2048);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project!.name.replace(/\s+/g, '_')}_wzor.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function handleExportCSV() {
    if (!project) return;
    const counts = countBeadsByColor(project.segments, project.patternMap);
    const rows = ['Kolor,Hex,Kod materiału,Ilość'];
    for (const color of project.palette.colors) {
      const count = counts[color.id] ?? 0;
      rows.push(`"${color.name}","${color.hex}","${color.materialCode ?? ''}",${count}`);
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    rows.push(`"RAZEM","","",${total}`);
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '_')}_materialy.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportPDF() {
    if (!project) return;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const counts = countBeadsByColor(project.segments, project.patternMap);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    // Title
    doc.setFontSize(20);
    doc.setTextColor(40, 40, 80);
    doc.text('Instrukcja wykonania bombki', 20, 20);

    doc.setFontSize(12);
    doc.setTextColor(60, 60, 60);
    doc.text(`Projekt: ${project.name}`, 20, 32);
    doc.text(`Średnica: ${project.ornamentSpec.diameterMm}mm`, 20, 40);
    doc.text(`Segmenty: ${project.ornamentSpec.segmentCount}`, 20, 48);
    doc.text(`Rzędy na segment: ${project.ornamentSpec.segmentRows}`, 20, 56);
    doc.text(`Data: ${new Date(project.metadata.createdAt).toLocaleDateString('pl')}`, 20, 64);

    // Separator
    doc.setDrawColor(200, 200, 200);
    doc.line(20, 70, 190, 70);

    // BOM Table
    doc.setFontSize(14);
    doc.setTextColor(40, 40, 80);
    doc.text('Lista materiałów', 20, 80);

    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text('Kolor', 20, 90);
    doc.text('Kod', 80, 90);
    doc.text('Ilość', 140, 90);
    doc.text('%', 165, 90);
    doc.line(20, 92, 190, 92);

    let y = 98;
    for (const color of project.palette.colors) {
      const count = counts[color.id] ?? 0;
      const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';

      // Color swatch
      const rgb = hexToRgb(color.hex);
      doc.setFillColor(rgb.r, rgb.g, rgb.b);
      doc.circle(22, y - 1, 2.5, 'F');

      doc.setTextColor(40, 40, 40);
      doc.text(color.name, 28, y);
      doc.text(color.materialCode ?? '—', 80, y);
      doc.text(String(count), 140, y);
      doc.text(`${pct}%`, 165, y);
      y += 7;
    }

    doc.setFontSize(11);
    doc.setTextColor(200, 50, 50);
    doc.text(`Razem: ${total} koralików`, 20, y + 4);

    // Row instructions
    y += 16;
    doc.setFontSize(14);
    doc.setTextColor(40, 40, 80);
    doc.text('Sekwencja rzędów (segment 1)', 20, y);
    y += 8;

    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const seg0 = project.segments[0];
    if (seg0) {
      for (let row = 0; row < seg0.rows; row++) {
        const cells = seg0.cells.filter((c) => c.row === row);
        const colorSeq = cells
          .map((c) => {
            const cId = project.patternMap[c.id] ?? null;
            const col = project.palette.colors.find((pc) => pc.id === cId);
            return col ? col.name : '—';
          })
          .join(', ');
        doc.text(`Rząd ${row + 1} (${cells.length} kor.): ${colorSeq}`, 20, y);
        y += 5;
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
      }
    }

    doc.save(`${project.name.replace(/\s+/g, '_')}_instrukcja.pdf`);
  }

  function hexToRgb(hex: string) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }

  const exportOptions = [
    {
      icon: '📄',
      label: 'JSON projektu',
      desc: 'Pełny plik projektu do ponownego importu',
      action: handleExportJSON,
      color: 'bg-blue-900/40 hover:bg-blue-800/40',
    },
    {
      icon: '🖼',
      label: 'PNG wzoru',
      desc: 'Grafika tekstury rozwinięcia wzoru (2048px)',
      action: handleExportPNG,
      color: 'bg-green-900/40 hover:bg-green-800/40',
    },
    {
      icon: '📊',
      label: 'CSV materiałów',
      desc: 'Lista koralików per kolor z ilościami',
      action: handleExportCSV,
      color: 'bg-yellow-900/40 hover:bg-yellow-800/40',
    },
    {
      icon: '📋',
      label: 'PDF instrukcji',
      desc: 'Kompletna instrukcja montażu z BOM i rzędami',
      action: handleExportPDF,
      color: 'bg-red-900/40 hover:bg-red-800/40',
    },
  ];

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h2 className="text-xl font-bold mb-2">📤 Eksport projektu</h2>
      <p className="text-gray-400 text-sm mb-6">
        Eksportuj projekt w wybranym formacie.
      </p>

      <div className="space-y-3">
        {exportOptions.map((opt) => (
          <button
            key={opt.label}
            onClick={opt.action}
            className={`w-full flex items-center gap-4 p-4 rounded-xl text-left transition ${opt.color}`}
          >
            <span className="text-3xl">{opt.icon}</span>
            <div>
              <div className="font-semibold text-white">{opt.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
            </div>
            <span className="ml-auto text-gray-500">↓</span>
          </button>
        ))}
      </div>

      <div className="mt-8 bg-[#16213e] rounded-xl p-4 text-sm text-gray-400">
        <div className="font-semibold text-white mb-2">Podsumowanie projektu</div>
        <div className="space-y-1">
          <div>Nazwa: <span className="text-white">{project.name}</span></div>
          <div>Średnica: <span className="text-white">{project.ornamentSpec.diameterMm}mm</span></div>
          <div>Segmenty: <span className="text-white">{project.ornamentSpec.segmentCount}</span></div>
          <div>Kolory: <span className="text-white">{project.palette.colors.length}</span></div>
          <div>Autor: <span className="text-white">{project.metadata.author}</span></div>
          <div>
            Utworzono:{' '}
            <span className="text-white">
              {new Date(project.metadata.createdAt).toLocaleString('pl')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}