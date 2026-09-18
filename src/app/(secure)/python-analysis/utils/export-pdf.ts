'use client';

import { jsPDF } from 'jspdf';
import JSZip from 'jszip';

export type ExportableFigure = {
  /** data:image/png;base64,... or raw base64 */
  pngBase64: string;
  /** Used for filename stem */
  label?: string;
};

function stripDataUrl(pngBase64: string): string {
  const trimmed = pngBase64.trim();
  const idx = trimmed.indexOf('base64,');
  if (idx >= 0) return trimmed.slice(idx + 'base64,'.length);
  return trimmed;
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'figure';
}

function loadImage(pngBase64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode PNG for PDF export'));
    const raw = stripDataUrl(pngBase64);
    img.src = pngBase64.startsWith('data:')
      ? pngBase64
      : `data:image/png;base64,${raw}`;
  });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * One figure → one PDF, page sized to image aspect ratio, image full-bleed.
 */
export async function exportFigureToPdf(
  pngBase64: string,
  filename: string
): Promise<void> {
  const img = await loadImage(pngBase64);
  const pxW = img.naturalWidth || img.width;
  const pxH = img.naturalHeight || img.height;
  if (!pxW || !pxH) throw new Error('Invalid figure dimensions');

  // jsPDF uses points (1/72"); map pixels assuming 96dpi screen → points
  const widthPt = (pxW * 72) / 96;
  const heightPt = (pxH * 72) / 96;

  const pdf = new jsPDF({
    orientation: widthPt >= heightPt ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [widthPt, heightPt],
    compress: true,
  });

  const dataUrl = pngBase64.startsWith('data:')
    ? pngBase64
    : `data:image/png;base64,${stripDataUrl(pngBase64)}`;

  pdf.addImage(dataUrl, 'PNG', 0, 0, widthPt, heightPt, undefined, 'FAST');
  const safe = sanitizeFilename(filename.replace(/\.pdf$/i, ''));
  pdf.save(`${safe}.pdf`);
}

/**
 * Primary ask: one PDF per figure, delivered as a zip of separate files.
 */
export async function exportAllAsSeparatePdfs(
  figures: ExportableFigure[]
): Promise<void> {
  if (!figures.length) throw new Error('No figures to export');

  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (let i = 0; i < figures.length; i++) {
    const fig = figures[i];
    const img = await loadImage(fig.pngBase64);
    const pxW = img.naturalWidth || img.width;
    const pxH = img.naturalHeight || img.height;
    const widthPt = (pxW * 72) / 96;
    const heightPt = (pxH * 72) / 96;

    const pdf = new jsPDF({
      orientation: widthPt >= heightPt ? 'landscape' : 'portrait',
      unit: 'pt',
      format: [widthPt, heightPt],
      compress: true,
    });

    const dataUrl = fig.pngBase64.startsWith('data:')
      ? fig.pngBase64
      : `data:image/png;base64,${stripDataUrl(fig.pngBase64)}`;
    pdf.addImage(dataUrl, 'PNG', 0, 0, widthPt, heightPt, undefined, 'FAST');

    let stem = sanitizeFilename(fig.label || `figure-${i + 1}`);
    if (usedNames.has(stem)) stem = `${stem}-${i + 1}`;
    usedNames.add(stem);

    const blob = pdf.output('blob');
    zip.file(`${stem}.pdf`, blob);
  }

  const zipped = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipped, `python-analysis-figures-${Date.now()}.zip`);
}

/**
 * Bonus: combined report with overview text + all figures.
 */
export async function exportCombinedReportPdf(
  figures: ExportableFigure[],
  overviewText: string
): Promise<void> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  pdf.setFontSize(16);
  pdf.text('Python Analysis Report', margin, y);
  y += 24;

  pdf.setFontSize(10);
  const overview = (overviewText || 'No overview text.').trim();
  const lines = pdf.splitTextToSize(overview, pageW - margin * 2);
  for (const line of lines) {
    if (y > pageH - margin) {
      pdf.addPage();
      y = margin;
    }
    pdf.text(line, margin, y);
    y += 12;
  }

  for (let i = 0; i < figures.length; i++) {
    const fig = figures[i];
    pdf.addPage();
    const label = fig.label || `Figure ${i + 1}`;
    pdf.setFontSize(12);
    pdf.text(label, margin, margin);

    const img = await loadImage(fig.pngBase64);
    const pxW = img.naturalWidth || img.width;
    const pxH = img.naturalHeight || img.height;
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2 - 20;
    const scale = Math.min(maxW / pxW, maxH / pxH);
    const drawW = pxW * scale;
    const drawH = pxH * scale;

    const dataUrl = fig.pngBase64.startsWith('data:')
      ? fig.pngBase64
      : `data:image/png;base64,${stripDataUrl(fig.pngBase64)}`;
    pdf.addImage(dataUrl, 'PNG', margin, margin + 16, drawW, drawH, undefined, 'FAST');
  }

  pdf.save(`python-analysis-report-${Date.now()}.pdf`);
}
