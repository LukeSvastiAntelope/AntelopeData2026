'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Database,
  FileSpreadsheet,
  GripVertical,
  Loader2,
  Trash2,
  Users,
  Upload,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Dataset } from '../hooks/useAnalysisContext';
import {
  type AnalysisFrame,
  type DatasetSourceCatalogItem,
  type DatasetSourceKind,
  suggestFrameName,
} from '../utils/named-datasets';

const DRAG_MIME = 'application/x-antelope-dataset-source';

type DatasetTrayProps = {
  surveyId?: number | null;
  /** Local uploads already parsed (shown in Available). */
  localUploads?: DatasetSourceCatalogItem[];
  analysisFrames: AnalysisFrame[];
  onFramesChange: (frames: AnalysisFrame[]) => void;
  /** Parse a File into a Dataset (reuse loadDataset). */
  parseFile: (file: File) => Promise<Dataset>;
  disabled?: boolean;
};

function kindIcon(kind: DatasetSourceKind) {
  switch (kind) {
    case 'survey':
    case 'prior_survey':
      return <Database className="h-3.5 w-3.5 shrink-0" />;
    case 'voter':
      return <Users className="h-3.5 w-3.5 shrink-0" />;
    case 'upload':
    default:
      return <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />;
  }
}

function kindLabel(kind: DatasetSourceKind) {
  switch (kind) {
    case 'survey':
      return 'Survey';
    case 'prior_survey':
      return 'Prior';
    case 'voter':
      return 'Voter';
    case 'upload':
      return 'Upload';
  }
}

async function fetchSourceAsDataset(
  source: DatasetSourceCatalogItem,
  parseFile: (file: File) => Promise<Dataset>
): Promise<Dataset> {
  if (source.kind === 'upload' && source.localDataset) {
    return source.localDataset;
  }

  const params = new URLSearchParams({ kind: source.kind });
  if (source.surveyId) params.set('surveyId', String(source.surveyId));
  if (source.listId) params.set('listId', String(source.listId));

  const res = await fetch(
    `/api/python-analysis/dataset-sources/export?${params.toString()}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to load ${source.label}`);
  }
  const csv = await res.text();
  const label =
    res.headers.get('X-Dataset-Label') ||
    source.label ||
    `${source.kind}.csv`;
  const file = new File([csv], `${label.replace(/[^\w.-]+/g, '_')}.csv`, {
    type: 'text/csv',
  });
  const dataset = await parseFile(file);
  if (source.surveyId) {
    (dataset as any).surveyId = source.surveyId;
  }
  if (source.listId) {
    (dataset as any).listId = source.listId;
  }
  return dataset;
}

export function DatasetTray({
  surveyId,
  localUploads = [],
  analysisFrames,
  onFramesChange,
  parseFile,
  disabled,
}: DatasetTrayProps) {
  const [catalog, setCatalog] = useState<DatasetSourceCatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [loadingSourceId, setLoadingSourceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const refreshCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    setError(null);
    try {
      const qs =
        surveyId != null && Number(surveyId) > 0
          ? `?surveyId=${surveyId}`
          : '';
      const res = await fetch(`/api/python-analysis/dataset-sources${qs}`);
      if (!res.ok) throw new Error('Failed to load dataset sources');
      const data = await res.json();
      setCatalog(Array.isArray(data.sources) ? data.sources : []);
    } catch (e) {
      console.warn('[DatasetTray] catalog', e);
      setCatalog([]);
    } finally {
      setLoadingCatalog(false);
    }
  }, [surveyId]);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  const available = useMemo(() => {
    const loadedIds = new Set(analysisFrames.map((f) => f.id));
    const fromServer = catalog.filter((s) => !loadedIds.has(s.id));
    const fromLocal = localUploads.filter((s) => !loadedIds.has(s.id));
    // Local uploads first, then server catalog
    const seen = new Set<string>();
    const out: DatasetSourceCatalogItem[] = [];
    for (const s of [...fromLocal, ...fromServer]) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }
    return out;
  }, [catalog, localUploads, analysisFrames]);

  const addSource = useCallback(
    async (source: DatasetSourceCatalogItem) => {
      if (disabled || loadingSourceId) return;
      if (analysisFrames.some((f) => f.id === source.id)) return;

      setLoadingSourceId(source.id);
      setError(null);
      try {
        const dataset = await fetchSourceAsDataset(source, parseFile);
        const frameName = suggestFrameName(source.kind, {
          surveyId: source.surveyId,
          listId: source.listId,
          existingNames: analysisFrames.map((f) => f.frameName),
        });
        const next: AnalysisFrame = {
          id: source.id,
          kind: source.kind,
          label: source.label,
          frameName,
          dataset,
          surveyId: source.surveyId,
          listId: source.listId,
          isPrimary: analysisFrames.length === 0,
        };
        const frames = [...analysisFrames, next];
        if (!frames.some((f) => f.isPrimary) && frames[0]) {
          frames[0] = { ...frames[0], isPrimary: true };
        }
        onFramesChange(frames);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to add dataset');
      } finally {
        setLoadingSourceId(null);
      }
    },
    [analysisFrames, disabled, loadingSourceId, onFramesChange, parseFile]
  );

  const removeFrame = useCallback(
    (id: string) => {
      const frames = analysisFrames.filter((f) => f.id !== id);
      if (frames.length && !frames.some((f) => f.isPrimary)) {
        frames[0] = { ...frames[0], isPrimary: true };
      }
      onFramesChange(frames);
    },
    [analysisFrames, onFramesChange]
  );

  const setPrimary = useCallback(
    (id: string) => {
      onFramesChange(
        analysisFrames.map((f) => ({ ...f, isPrimary: f.id === id }))
      );
    },
    [analysisFrames, onFramesChange]
  );

  const onDragStartSource = (
    e: React.DragEvent,
    source: DatasetSourceCatalogItem
  ) => {
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(source));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const onDropAnalysis = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) {
      // Native file drop → treat as upload into analysis
      const file = e.dataTransfer.files?.[0];
      if (file) {
        setLoadingSourceId(`upload-drop-${Date.now()}`);
        try {
          const dataset = await parseFile(file);
          const id = `upload-${Date.now()}`;
          const frameName = suggestFrameName('upload', {
            existingNames: analysisFrames.map((f) => f.frameName),
          });
          const next: AnalysisFrame = {
            id,
            kind: 'upload',
            label: file.name,
            frameName,
            dataset,
            isPrimary: analysisFrames.length === 0,
          };
          onFramesChange([...analysisFrames, next]);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
          setLoadingSourceId(null);
        }
      }
      return;
    }
    try {
      const source = JSON.parse(raw) as DatasetSourceCatalogItem;
      await addSource(source);
    } catch {
      setError('Invalid drag payload');
    }
  };

  return (
    <div className="mx-6 mb-4 rounded-lg border border-border bg-muted/20">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div>
          <h3 className="text-sm font-medium text-card-foreground">
            Dataset tray
          </h3>
          <p className="text-xs text-muted-foreground">
            Drag sources into Analysis to load named Pyodide frames (
            <code className="text-[10px]">df_survey</code>,{' '}
            <code className="text-[10px]">df_voter</code>,{' '}
            <code className="text-[10px]">df_prior_*</code>
            ). Primary is also aliased as <code className="text-[10px]">df</code>
            .
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-xs"
          onClick={() => void refreshCatalog()}
          disabled={loadingCatalog || disabled}
        >
          {loadingCatalog ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            'Refresh'
          )}
        </Button>
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-destructive border-b border-border">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:divide-x divide-border">
        {/* Available */}
        <div className="p-3 min-h-[140px]">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
            Available sources
          </div>
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {available.length === 0 && !loadingCatalog && (
              <li className="text-xs text-muted-foreground py-4 text-center">
                Upload a file or load a survey — sources appear here.
              </li>
            )}
            {available.map((s) => (
              <li
                key={s.id}
                draggable={!disabled && loadingSourceId == null}
                onDragStart={(e) => onDragStartSource(e, s)}
                className="flex items-center gap-2 rounded-md border border-border/80 bg-card px-2 py-1.5 text-xs cursor-grab active:cursor-grabbing hover:border-foreground/30"
              >
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {kindIcon(s.kind)}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{s.label}</div>
                  {s.subtitle && (
                    <div className="truncate text-muted-foreground">
                      {s.subtitle}
                    </div>
                  )}
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {kindLabel(s.kind)}
                </Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px] shrink-0"
                  disabled={disabled || loadingSourceId === s.id}
                  onClick={() => void addSource(s)}
                >
                  {loadingSourceId === s.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    'Add'
                  )}
                </Button>
              </li>
            ))}
          </ul>
        </div>

        {/* Analysis drop zone */}
        <div
          className={`p-3 min-h-[140px] transition-colors ${
            dragOver ? 'bg-primary/5 ring-1 ring-inset ring-primary/40' : ''
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => void onDropAnalysis(e)}
        >
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
            Analysis frames ({analysisFrames.length})
          </div>
          {analysisFrames.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 py-8 text-xs text-muted-foreground border border-dashed border-border rounded-md">
              <Upload className="h-4 w-4 mb-1" />
              Drop sources here, or click Add
            </div>
          ) : (
            <ul className="space-y-1.5 max-h-48 overflow-y-auto">
              {analysisFrames.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-xs"
                >
                  {kindIcon(f.kind)}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{f.label}</div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <code className="text-[10px] bg-muted px-1 rounded">
                        {f.frameName}
                      </code>
                      <span>
                        {(f.dataset.shape?.[0] ?? 0).toLocaleString()} ×{' '}
                        {f.dataset.shape?.[1] ?? 0}
                      </span>
                      {f.isPrimary && (
                        <Badge className="text-[9px] h-4 px-1" variant="default">
                          primary / df
                        </Badge>
                      )}
                    </div>
                  </div>
                  {!f.isPrimary && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[10px]"
                      disabled={disabled}
                      onClick={() => setPrimary(f.id)}
                      title="Use as primary df"
                    >
                      Make primary
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    disabled={disabled}
                    onClick={() => removeFrame(f.id)}
                    title="Remove from analysis"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
