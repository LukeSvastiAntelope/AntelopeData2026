'use client';

/**
 * Compact MapLibre map for python-analysis — survey/campaign geo snapshot.
 * Registers with capture-map so combined PDF / Save as Report can include it.
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2, Map as MapIcon } from 'lucide-react';
import { registerMapForExport } from '../utils/capture-map';

const MAPLIBRE_CSS_URL = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
const US_STATES_GEOJSON_URL =
  'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json';

type Props = {
  surveyId?: number | null;
  /** Shown in PDF figure label */
  label?: string;
  className?: string;
  height?: number;
};

type DashGeo = {
  points?: { lat: number; lng: number; surveyId?: number }[];
  states?: Record<string, { responses?: number }>;
  orgCenter?: { latitude: number; longitude: number; zoom?: number } | null;
};

export function AnalysisGeoMap({
  surveyId,
  label = 'Campaign geography map',
  className,
  height = 280,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>(
    'loading'
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unregister: (() => void) | undefined;
    let mapInstance: any = null;

    const init = async () => {
      setStatus('loading');
      setErrorMsg(null);

      try {
        if (!document.getElementById('maplibre-gl-css')) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = MAPLIBRE_CSS_URL;
          link.id = 'maplibre-gl-css';
          document.head.appendChild(link);
          await new Promise<void>((resolve) => {
            link.onload = () => resolve();
            link.onerror = () => resolve();
            setTimeout(resolve, 2500);
          });
        }

        const geoUrl =
          surveyId && Number(surveyId) > 0
            ? `/api/surveys/${surveyId}/geo`
            : '/api/dashboard/geo';
        const geoRes = await fetch(geoUrl);
        const geoJson = geoRes.ok ? await geoRes.json() : null;

        // Normalize survey geo vs dashboard geo
        let points: { lat: number; lng: number }[] = [];
        let stateCounts: Record<string, number> = {};
        let center: [number, number] = [-98.5, 39.8];
        let zoom = 3.5;

        if (geoJson?.status !== false) {
          if (Array.isArray(geoJson?.points)) {
            points = (geoJson.points as DashGeo['points']) || [];
          } else if (geoJson?.data?.points) {
            points = geoJson.data.points;
          }

          if (geoJson?.states && typeof geoJson.states === 'object') {
            for (const [k, v] of Object.entries(geoJson.states as DashGeo['states'])) {
              stateCounts[k] = Number((v as any)?.responses ?? (v as any)?.count ?? 0);
            }
          }
          if (Array.isArray(geoJson?.stateData)) {
            for (const row of geoJson.stateData) {
              if (row?.state) stateCounts[String(row.state)] = Number(row.count || 0);
            }
          }

          const org = geoJson?.orgCenter || geoJson?.data?.orgCenter;
          if (org?.latitude != null && org?.longitude != null) {
            center = [Number(org.longitude), Number(org.latitude)];
            zoom = Number(org.zoom) || 8;
          }
        }

        if (cancelled || !containerRef.current) return;

        const maplibregl = (await import('maplibre-gl')).default;
        if (cancelled || !containerRef.current) return;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style:
            'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
          center,
          zoom,
          attributionControl: false,
          // Required so canvas.toDataURL works for PDF export
          preserveDrawingBuffer: true,
        });

        mapInstance = map;
        mapRef.current = map;

        map.on('error', (e: any) => {
          console.warn('[AnalysisGeoMap]', e?.error || e);
        });

        map.on('load', () => {
          if (cancelled) return;
          map.resize();

          map.addSource('us-states', {
            type: 'geojson',
            data: US_STATES_GEOJSON_URL,
          });
          map.addLayer({
            id: 'state-fills',
            type: 'fill',
            source: 'us-states',
            paint: {
              'fill-color': '#93c5fd',
              'fill-opacity': 0.15,
            },
          });
          map.addLayer({
            id: 'state-borders',
            type: 'line',
            source: 'us-states',
            paint: {
              'line-color': 'rgba(0,0,0,0.2)',
              'line-width': 1,
            },
          });

          if (points.length) {
            const fc = {
              type: 'FeatureCollection' as const,
              features: points
                .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
                .map((p) => ({
                  type: 'Feature' as const,
                  properties: {},
                  geometry: {
                    type: 'Point' as const,
                    coordinates: [p.lng, p.lat],
                  },
                })),
            };
            map.addSource('analysis-points', { type: 'geojson', data: fc });
            map.addLayer({
              id: 'analysis-points-circles',
              type: 'circle',
              source: 'analysis-points',
              paint: {
                'circle-radius': 5,
                'circle-color': '#1d4ed8',
                'circle-opacity': 0.75,
                'circle-stroke-width': 1,
                'circle-stroke-color': '#fff',
              },
            });

            if (fc.features.length === 1) {
              map.flyTo({
                center: fc.features[0].geometry.coordinates as [number, number],
                zoom: 10,
              });
            } else if (fc.features.length > 1) {
              const bounds = new maplibregl.LngLatBounds();
              fc.features.forEach((f) =>
                bounds.extend(f.geometry.coordinates as [number, number])
              );
              map.fitBounds(bounds, { padding: 40, maxZoom: 11 });
            }
          }

          const hasGeo =
            points.length > 0 || Object.keys(stateCounts).length > 0;
          setStatus(hasGeo ? 'ready' : 'empty');

          unregister = registerMapForExport(
            `analysis-geo-${surveyId || 'campaign'}`,
            () => mapRef.current,
            label
          );
        });
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(e instanceof Error ? e.message : 'Map failed to load');
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
      unregister?.();
      if (mapInstance) {
        try {
          mapInstance.remove();
        } catch {
          /* ignore */
        }
      }
      mapRef.current = null;
    };
  }, [surveyId, label]);

  return (
    <div
      className={`mx-6 mb-4 rounded-lg border border-border overflow-hidden bg-muted/10 ${className || ''}`}
    >
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border text-xs text-muted-foreground">
        <MapIcon className="h-3.5 w-3.5" />
        <span className="font-medium text-card-foreground">{label}</span>
        <span className="text-[10px]">
          Included in combined PDF &amp; saved reports
        </span>
      </div>
      <div className="relative" style={{ height }}>
        <div ref={containerRef} className="absolute inset-0" />
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-xs text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading map…
          </div>
        )}
        {status === 'empty' && (
          <div className="absolute bottom-2 left-2 right-2 text-[10px] text-muted-foreground bg-background/80 rounded px-2 py-1">
            No geocoded points yet — map basemap still exports for context.
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-destructive px-4 text-center">
            {errorMsg || 'Map unavailable'}
          </div>
        )}
      </div>
    </div>
  );
}
