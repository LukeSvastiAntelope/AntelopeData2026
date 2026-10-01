/**
 * Upload a matplotlib (or other) PNG data-URL to private media storage.
 * Returns the storage key + authenticated /api/media URL for later reload/share.
 */

export type PersistedFigure = {
  storageKey: string;
  url: string;
};

function dataUrlToBlob(dataUrl: string): Blob {
  const trimmed = dataUrl.trim();
  if (!trimmed.startsWith('data:')) {
    throw new Error('Expected a data:image URL');
  }
  const comma = trimmed.indexOf(',');
  if (comma < 0) throw new Error('Malformed data URL');
  const header = trimmed.slice(0, comma);
  const payload = trimmed.slice(comma + 1);
  const isBase64 = /;base64/i.test(header);
  const mimeMatch = header.match(/^data:([^;]+)/i);
  const mime = mimeMatch?.[1] || 'image/png';
  if (isBase64) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(payload)], { type: mime });
}

export async function uploadChartPng(
  dataUrl: string,
  opts?: { filename?: string }
): Promise<PersistedFigure> {
  const blob = dataUrlToBlob(dataUrl);
  const fd = new FormData();
  fd.append('file', blob, opts?.filename || `chart-${Date.now()}.png`);
  const response = await fetch('/api/media/upload', {
    method: 'POST',
    body: fd,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.status || !data.key) {
    throw new Error(
      (data && data.message) || `Chart upload failed (${response.status})`
    );
  }
  return {
    storageKey: String(data.key),
    url: String(data.url || `/api/media/${data.key}`),
  };
}

/** Resolve a displayable image src from message content + figure metadata. */
export function resolveFigureSrc(input: {
  content?: string | null;
  storageKey?: string | null;
  mediaUrl?: string | null;
}): string | null {
  if (input.mediaUrl) return input.mediaUrl;
  if (input.storageKey) {
    const key = String(input.storageKey).replace(/^\/+/, '');
    return `/api/media/${key}`;
  }
  if (typeof input.content === 'string' && input.content.startsWith('data:image/')) {
    return input.content;
  }
  return null;
}

export async function fetchImageAsDataUrl(src: string): Promise<string> {
  if (src.startsWith('data:')) return src;
  const res = await fetch(src, { credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to load image (${res.status})`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(blob);
  });
}

export async function downloadPng(src: string, filename: string): Promise<void> {
  const dataUrl = await fetchImageAsDataUrl(src);
  const blob = dataUrlToBlob(dataUrl);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/\.png$/i, '') + '.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function copyImageToClipboard(src: string): Promise<void> {
  const dataUrl = await fetchImageAsDataUrl(src);
  const blob = dataUrlToBlob(dataUrl);
  const pngBlob =
    blob.type === 'image/png'
      ? blob
      : await (async () => {
          const img = await createImageBitmap(blob);
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas unavailable');
          ctx.drawImage(img, 0, 0);
          return await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))),
              'image/png'
            );
          });
        })();

  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    throw new Error('Clipboard image copy is not supported in this browser');
  }
  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': pngBlob }),
  ]);
}
