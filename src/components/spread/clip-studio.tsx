'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Film,
  Loader2,
  Scissors,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StagedActionCard, type StagedActionCardModel } from '@/components/consultant/staged-action-card';
import { cn } from '@/lib/utils';
import { AI_DISCLOSURE_DEFAULT } from '@/app/utils/services/video/guardrails';

type ClipProviderCap = {
  id: string;
  displayName: string;
  tier: string;
  notes?: string;
};

type ClipCandidate = {
  id: string;
  url: string;
  score: number;
  hook: string;
  durationSeconds?: number;
  thumbnailUrl?: string | null;
};

type ClipJob = {
  jobId: string;
  status: string;
  progress: number;
  clips: ClipCandidate[];
  error?: string | null;
  provider?: string;
  sourceUrl?: string;
};

type LibraryAsset = {
  id: string;
  url: string;
  type: 'image' | 'video';
  name: string;
};

export function ClipStudioPanel() {
  const [providers, setProviders] = useState<ClipProviderCap[]>([]);
  const [defaultProvider, setDefaultProvider] = useState('mock');
  const [provider, setProvider] = useState('mock');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceKind, setSourceKind] = useState<'upload' | 'url'>('upload');
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [busyUpload, setBusyUpload] = useState(false);
  const [busyClip, setBusyClip] = useState(false);
  const [job, setJob] = useState<ClipJob | null>(null);
  const [clips, setClips] = useState<ClipCandidate[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [stagedCards, setStagedCards] = useState<StagedActionCardModel[]>([]);
  const [stageBusy, setStageBusy] = useState<number | null>(null);
  const [includeAiDisclosure, setIncludeAiDisclosure] = useState(true);
  const [captionDraft, setCaptionDraft] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadMeta = useCallback(async () => {
    const res = await fetch('/api/video/clip');
    const data = await res.json();
    setProviders(data.providers || []);
    const def = data.defaultProvider || 'mock';
    setDefaultProvider(def);
    setProvider(def);
  }, []);

  const loadAssets = useCallback(async () => {
    const res = await fetch('/api/media/assets?type=video');
    if (!res.ok) return;
    const data = await res.json();
    setAssets((data.assets || []).filter((a: LibraryAsset) => a.type === 'video'));
  }, []);

  useEffect(() => {
    void loadMeta();
    void loadAssets();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadMeta, loadAssets]);

  const onUpload = async (file: File) => {
    setBusyUpload(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.status) throw new Error(data.message || 'Upload failed');
      setSourceUrl(data.url);
      setSourceKind('upload');
      await loadAssets();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusyUpload(false);
    }
  };

  const pollJob = (jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/video/clip/${jobId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Status failed');
        const j = data.job as ClipJob;
        setJob(j);
        if (j.status === 'succeeded') {
          setClips(j.clips || []);
          const initial: Record<string, boolean> = {};
          (j.clips || []).slice(0, 2).forEach((c) => {
            initial[c.id] = true;
          });
          setSelected(initial);
          if (j.clips?.[0]?.hook) setCaptionDraft(j.clips[0].hook);
          setBusyClip(false);
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (j.status === 'failed' || j.status === 'canceled') {
          setError(j.error || `Job ${j.status}`);
          setBusyClip(false);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Poll failed');
        setBusyClip(false);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 2500);
  };

  const runClip = async () => {
    if (!sourceUrl.trim()) {
      setError('Upload a long video or paste a public URL first');
      return;
    }
    setBusyClip(true);
    setError(null);
    setClips([]);
    setStagedCards([]);
    try {
      const res = await fetch('/api/video/clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl,
          provider,
          maxClips: 6,
          maxDurationSeconds: 30,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Clip submit failed');
      setJob(data.job);
      pollJob(data.job.jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Clip failed');
      setBusyClip(false);
    }
  };

  const keepers = clips.filter((c) => selected[c.id]);

  const stageKeepers = async () => {
    if (!keepers.length) {
      setError('Select at least one short to stage');
      return;
    }
    setError(null);
    const created: StagedActionCardModel[] = [];
    for (const clip of keepers) {
      const res = await fetch('/api/video/stage-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: clip.url,
          caption: captionDraft || clip.hook,
          platform: 'tiktok',
          hook: clip.hook,
          script: clip.hook,
          provider,
          includeAiDisclosure,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not stage clip');
        continue;
      }
      created.push({
        id: data.staged.id,
        toolName: data.staged.toolName,
        summary: data.staged.summary,
        status: data.staged.status,
        payload: data.staged.payload,
      });
    }
    setStagedCards(created);
  };

  const onApproveStaged = async (id: number) => {
    setStageBusy(id);
    try {
      const res = await fetch(`/api/agents/consultant/staged/${id}/approve`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Approve failed');
      setStagedCards((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                status: data.staged?.status || 'executed',
                summary:
                  data.staged?.resultSummary ||
                  data.execution?.summary ||
                  c.summary,
              }
            : c
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setStageBusy(null);
    }
  };

  const onDismissStaged = async (id: number) => {
    setStageBusy(id);
    try {
      const res = await fetch(`/api/agents/consultant/staged/${id}/dismiss`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Dismiss failed');
      }
      setStagedCards((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: 'dismissed' } : c))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dismiss failed');
    } finally {
      setStageBusy(null);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
      <div className="xl:col-span-3 space-y-5">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            Clip a long video
          </h2>
          <p className="text-sm text-muted-foreground">
            Upload a speech or livestream — Opus or Klap return ranked captioned shorts.
            Clipping is private; posting stays behind the human gate.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Clipper</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.displayName}
                    {p.id === defaultProvider ? ' · default' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Source</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={sourceKind === 'upload' ? 'default' : 'outline'}
                onClick={() => setSourceKind('upload')}
              >
                Upload
              </Button>
              <Button
                type="button"
                size="sm"
                variant={sourceKind === 'url' ? 'default' : 'outline'}
                onClick={() => setSourceKind('url')}
              >
                URL
              </Button>
            </div>
          </div>
        </div>

        {sourceKind === 'upload' ? (
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busyUpload}
              onClick={() => fileRef.current?.click()}
            >
              {busyUpload ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Upload long video (mp4)
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
              }}
            />
            {assets.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {assets.slice(0, 10).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    title={a.name}
                    onClick={() => setSourceUrl(a.url)}
                    className={cn(
                      'shrink-0 rounded border border-border h-14 w-20 bg-muted flex items-center justify-center',
                      sourceUrl === a.url && 'ring-2 ring-primary'
                    )}
                  >
                    <Film className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Public video URL</Label>
            <Input
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://… or YouTube / Vimeo link"
            />
          </div>
        )}

        {sourceUrl && (
          <p className="text-xs text-muted-foreground truncate">Source: {sourceUrl}</p>
        )}

        <Button type="button" disabled={busyClip || !sourceUrl.trim()} onClick={() => void runClip()}>
          {busyClip ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Scissors className="h-4 w-4" />
          )}
          Clip into shorts
        </Button>

        {busyClip && (
          <div className="space-y-2">
            <Progress value={job?.progress || 15} />
            <p className="text-xs text-muted-foreground">
              Clipping with {provider}… this can take a few minutes on live providers.
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {clips.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Ranked shorts</p>
              <Badge variant="secondary">{clips.length} clips</Badge>
            </div>
            <div className="space-y-3">
              {clips.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    'rounded-lg border border-border p-3 space-y-2',
                    selected[c.id] && 'ring-1 ring-primary'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{c.hook}</p>
                      <p className="text-xs text-muted-foreground">
                        Score {c.score}
                        {c.durationSeconds ? ` · ~${c.durationSeconds}s` : ''}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={selected[c.id] ? 'default' : 'outline'}
                      onClick={() =>
                        setSelected((prev) => ({ ...prev, [c.id]: !prev[c.id] }))
                      }
                    >
                      {selected[c.id] ? 'Keeper' : 'Keep'}
                    </Button>
                  </div>
                  <video
                    src={c.url}
                    controls
                    playsInline
                    className="w-full max-h-56 rounded bg-black"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="xl:col-span-2 space-y-4">
        <div className="rounded-lg border border-border p-4 space-y-3">
          <p className="text-sm font-medium">Stage keepers for post</p>
          <div className="space-y-1.5">
            <Label className="text-xs">Caption</Label>
            <Textarea
              value={captionDraft}
              onChange={(e) => setCaptionDraft(e.target.value)}
              rows={3}
              className="text-sm"
              placeholder="Caption for selected shorts"
            />
          </div>
          <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={includeAiDisclosure}
              onChange={(e) => setIncludeAiDisclosure(e.target.checked)}
            />
            <span>
              Include AI disclosure on caption
              <span className="block text-[11px] opacity-80 mt-0.5">
                {AI_DISCLOSURE_DEFAULT}
              </span>
            </span>
          </label>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setClips([]);
                setJob(null);
                setSelected({});
                setStagedCards([]);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!keepers.length}
              onClick={() => void stageKeepers()}
            >
              <Check className="h-3.5 w-3.5" />
              Approve keepers ({keepers.length})
            </Button>
          </div>
        </div>

        {stagedCards.map((card) => (
          <StagedActionCard
            key={card.id}
            action={card}
            onApprove={onApproveStaged}
            onDismiss={onDismissStaged}
            busyId={stageBusy}
          />
        ))}

        <p className="text-xs text-muted-foreground">
          Each keeper stages <code className="text-[11px]">generate_and_post_video</code>{' '}
          — same &quot;review before it goes out&quot; card. Clipping itself never posts.
        </p>
      </div>
    </div>
  );
}
