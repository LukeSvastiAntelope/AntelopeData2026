/**
 * Compose a branded social card on a canvas from a re-rendered chart PNG.
 */

export type ComposeSocialCardInput = {
  width: number;
  height: number;
  chartDataUrl: string;
  headline: string;
  sourceLine: string;
  caveat: string | null;
  campaignName: string;
  footer?: string;
};

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (ctx.measureText(trial).width <= maxWidth) {
      current = trial;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load chart image'));
    img.crossOrigin = 'anonymous';
    img.src = src;
  });
}

export async function composeSocialCardPng(
  input: ComposeSocialCardInput
): Promise<string> {
  const {
    width,
    height,
    chartDataUrl,
    headline,
    sourceLine,
    caveat,
    campaignName,
    footer = 'Powered by Antelope',
  } = input;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  // Background
  ctx.fillStyle = '#F7F4EF';
  ctx.fillRect(0, 0, width, height);

  // Subtle top brand bar
  ctx.fillStyle = '#0B3D2E';
  ctx.fillRect(0, 0, width, Math.max(8, Math.round(height * 0.008)));

  const pad = Math.round(Math.min(width, height) * 0.055);
  let y = pad + Math.round(height * 0.02);

  // Campaign name
  ctx.fillStyle = '#0B3D2E';
  ctx.font = `600 ${Math.round(width * 0.028)}px "Source Sans 3", "Segoe UI", sans-serif`;
  ctx.fillText(campaignName || 'Campaign', pad, y);
  y += Math.round(height * 0.035);

  // Headline
  const headlineSize = Math.round(width * 0.048);
  ctx.fillStyle = '#1A1A1A';
  ctx.font = `700 ${headlineSize}px Georgia, "Times New Roman", serif`;
  const headlineLines = wrapText(ctx, headline || 'Insight', width - pad * 2).slice(
    0,
    4
  );
  const headlineLineH = Math.round(headlineSize * 1.2);
  for (const line of headlineLines) {
    ctx.fillText(line, pad, y);
    y += headlineLineH;
  }
  y += Math.round(height * 0.02);

  // Chart area
  const chart = await loadImage(chartDataUrl);
  const caveatReserve = caveat ? Math.round(height * 0.09) : Math.round(height * 0.04);
  const footerReserve = Math.round(height * 0.08);
  const sourceReserve = Math.round(height * 0.045);
  const maxChartH = height - y - caveatReserve - footerReserve - sourceReserve - pad;
  const maxChartW = width - pad * 2;
  const scale = Math.min(maxChartW / chart.width, maxChartH / chart.height);
  const drawW = Math.max(1, chart.width * scale);
  const drawH = Math.max(1, chart.height * scale);
  const chartX = pad + (maxChartW - drawW) / 2;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(chartX - 8, y - 8, drawW + 16, drawH + 16);
  ctx.drawImage(chart, chartX, y, drawW, drawH);
  y += drawH + Math.round(height * 0.025);

  // Source line
  ctx.fillStyle = '#5C6B73';
  ctx.font = `400 ${Math.round(width * 0.022)}px "Source Sans 3", "Segoe UI", sans-serif`;
  const sourceLines = wrapText(ctx, sourceLine, width - pad * 2).slice(0, 2);
  for (const line of sourceLines) {
    ctx.fillText(line, pad, y);
    y += Math.round(width * 0.028);
  }

  // Caveat
  if (caveat) {
    y += Math.round(height * 0.01);
    ctx.fillStyle = '#8B4513';
    ctx.font = `500 ${Math.round(width * 0.02)}px "Source Sans 3", "Segoe UI", sans-serif`;
    const caveatLines = wrapText(ctx, caveat, width - pad * 2).slice(0, 4);
    for (const line of caveatLines) {
      ctx.fillText(line, pad, y);
      y += Math.round(width * 0.026);
    }
  }

  // Footer
  const footerY = height - pad;
  ctx.fillStyle = '#0B3D2E';
  ctx.font = `500 ${Math.round(width * 0.018)}px "Source Sans 3", "Segoe UI", sans-serif`;
  ctx.fillText(footer, pad, footerY);

  return canvas.toDataURL('image/png');
}
