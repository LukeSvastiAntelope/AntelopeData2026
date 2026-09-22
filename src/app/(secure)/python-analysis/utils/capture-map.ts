/**
 * Capture MapLibre (WebGL) maps as PNG ExportableFigures for PDF / saved reports.
 * Requires maps to be created with `preserveDrawingBuffer: true`.
 */

import type { ExportableFigure } from './export-pdf';

export type MapLike = {
  getCanvas: () => HTMLCanvasElement;
  isStyleLoaded?: () => boolean;
  loaded?: () => boolean;
  triggerRepaint?: () => void;
  once?: (type: string, fn: () => void) => void;
};

type RegistryEntry = {
  id: string;
  label: string;
  getMap: () => MapLike | null | undefined;
};

const registry = new Map<string, RegistryEntry>();

/** Register a live MapLibre instance for later PDF/report capture. */
export function registerMapForExport(
  id: string,
  getMap: () => MapLike | null | undefined,
  label = 'Map'
): () => void {
  registry.set(id, { id, label, getMap });
  return () => {
    registry.delete(id);
  };
}

export function unregisterMapForExport(id: string): void {
  registry.delete(id);
}

export function listRegisteredMaps(): Array<{ id: string; label: string }> {
  return [...registry.values()].map((e) => ({ id: e.id, label: e.label }));
}

/**
 * Snapshot one MapLibre map → PNG data URL figure.
 * Waits one animation frame + optional idle so tiles finish painting.
 */
export async function captureMapLibreToFigure(
  map: MapLike,
  label = 'Map'
): Promise<ExportableFigure> {
  if (typeof map.triggerRepaint === 'function') {
    map.triggerRepaint();
  }

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  // Prefer idle if available (MapLibre)
  if (typeof (map as any).once === 'function') {
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 1500);
      try {
        (map as any).once('idle', () => {
          clearTimeout(timeout);
          resolve();
        });
        map.triggerRepaint?.();
      } catch {
        clearTimeout(timeout);
        resolve();
      }
    });
  }

  const canvas = map.getCanvas();
  if (!canvas || !canvas.width || !canvas.height) {
    throw new Error('Map canvas is empty — is the map loaded?');
  }

  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL('image/png');
  } catch (e) {
    throw new Error(
      `Map canvas capture failed (tainted canvas?). ${e instanceof Error ? e.message : e}`
    );
  }

  if (!dataUrl || dataUrl === 'data:,') {
    throw new Error('Map canvas produced an empty PNG');
  }

  return {
    pngBase64: dataUrl,
    label,
    kind: 'map',
  };
}

/** Capture every registered analysis/dashboard map that is currently mounted. */
export async function captureAllRegisteredMaps(): Promise<ExportableFigure[]> {
  const figures: ExportableFigure[] = [];
  for (const entry of registry.values()) {
    try {
      const map = entry.getMap();
      if (!map) continue;
      const loaded =
        typeof map.loaded === 'function'
          ? map.loaded()
          : typeof map.isStyleLoaded === 'function'
            ? map.isStyleLoaded()
            : true;
      if (!loaded) continue;
      const fig = await captureMapLibreToFigure(map, entry.label);
      figures.push(fig);
    } catch (e) {
      console.warn(`[capture-map] skip ${entry.id}:`, e);
    }
  }
  return figures;
}

/** Convert map figures into PackagedReportMap rows for Save as Report. */
export function figuresToPackagedMaps(
  figures: ExportableFigure[]
): Array<{ id: string; dataUrl: string; label?: string }> {
  return figures
    .filter((f) => f.kind === 'map' || (f.label || '').toLowerCase().includes('map'))
    .map((f, i) => ({
      id: `map-${i + 1}`,
      dataUrl: f.pngBase64,
      label: f.label || `Map ${i + 1}`,
    }));
}
