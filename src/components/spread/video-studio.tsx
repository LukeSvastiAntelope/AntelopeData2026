'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Film,
  ImagePlus,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  Check,
  Clapperboard,
  Scissors,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StagedActionCard, type StagedActionCardModel } from '@/components/consultant/staged-action-card';
import { ClipStudioPanel } from '@/components/spread/clip-studio';
import { cn } from '@/lib/utils';
import { AI_DISCLOSURE_DEFAULT } from '@/app/utils/services/video/guardrails';

type ProviderCap = {
  id: string;
  displayName: string;
  tier: string;
  modes: Array<'t2v' | 'i2v' | 'v2v'>;
  notes?: string;
};

type Template = {
  id: string;
  label: string;
  description: string;
  starterPrompt: string;
};

type LibraryAsset = {
  id: string;
  url: string;
  type: 'image' | 'video';
  name: string;
};

type Assisted = {
  subject: string;
  motion: string;
  camera: string;
  style: string;
  durationSeconds: number;
  aspectRatio: string;
  modelPrompt: string;
  negativePrompt?: string;
  referenceGuidance?: string;
  explanation: string;
};

type Job = {
  jobId: string;
  status: string;
  progress: number;
  assetUrl?: string | null;
  localAssetUrl?: string | null;
  error?: string | null;
  provider?: string;
};

const ASPECTS = ['9:16', '16:9', '1:1'] as const;

export function VideoStudio() {
  const [providers, setProviders] = useState<ProviderCap[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [defaultProvider, setDefaultProvider] = useState('mock');
  const [provider, setProvider] = useState('mock');
  const [templateId, setTemplateId] = useState('issue_explainer');
  const [plain, setPlain] = useState(
    '30-sec clip on our housing plan, upbeat, city backdrop'
  );
  const [aspectRatio, setAspectRatio] = useState<(typeof ASPECTS)[number]>('9:16');
  const [mode, setMode] = useState<'t2v' | 'i2v' | 'v2v'>('t2v');
  const [assisted, setAssisted] = useState<Assisted | null>(null);
  const [modelPrompt, setModelPrompt] = useState('');
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [referenceKind, setReferenceKind] = useState<'image' | 'video' | null>(null);
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [busyAssist, setBusyAssist] = useState(false);
  const [busyGenerate, setBusyGenerate] = useState(false);
  const [busyUpload, setBusyUpload] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [staged, setStaged] = useState<StagedActionCardModel | null>(null);
  const [stageBusy, setStageBusy] = useState<number | null>(null);
  const [includeAiDisclosure, setIncludeAiDisclosure] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedCaps = useMemo(
    () => providers.find((p) => p.id === provider),
    [providers, provider]
  );
  const availableModes = selectedCaps?.modes || ['t2v'];

  useEffect(() => {
    if (!availableModes.includes(mode)) {
      setMode(availableModes[0] || 't2v');
    }
  }, [availableModes, mode]);

  const loadMeta = useCallback(async () => {
    const res = await fetch('/api/video/prompt-assist');
    const data = await res.json();
    setTemplates(data.templates || []);
    setProviders(data.providers || []);
    const def = data.defaultProvider || 'mock';
    setDefaultProvider(def);
    setProvider(def);
  }, []);

  const loadAssets = useCallback(async () => {
    const res = await fetch('/api/media/assets');
    if (!res.ok) return;
    const data = await res.json();
    setAssets(data.assets || []);
  }, []);

  useEffect(() => {
    void loadMeta();
    void loadAssets();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadMeta, loadAssets]);

  useEffect(() => {
    const t = templates.find((x) => x.id === templateId);
    if (t?.starterPrompt) setPlain(t.starterPrompt);
  }, [templateId, templates]);

  const onUpload = async (file: File) => {
    setBusyUpload(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.status) {
        throw new Error(data.message || 'Upload failed');
      }
      setReferenceUrl(data.url);
      setReferenceKind(String(data.type || '').startsWith('video') ? 'video' : 'image');
      if (String(data.type || '').startsWith('video')) {
        if (availableModes.includes('v2v')) setMode('v2v');
      } else if (availableModes.includes('i2v')) {
        setMode('i2v');
      }
      await loadAssets();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusyUpload(false);
    }
  };

  const runAssist = async (): Promise<string | null> => {
    setBusyAssist(true);
    setError(null);
    try {
      const res = await fetch('/api/video/prompt-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plainDescription: plain,
          provider,
          mode,
          templateId,
          aspectRatio,
          hasReferenceImage: referenceKind === 'image',
          hasReferenceVideo: referenceKind === 'video',
          referenceImage: referenceKind === 'image' ? referenceUrl : null,
          referenceVideo: referenceKind === 'video' ? referenceUrl : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Prompt assist failed');
      setAssisted(data.assisted);
      setModelPrompt(data.assisted.modelPrompt);
      if (!caption) {
        setCaption(plain.slice(0, 140));
      }
      return String(data.assisted.modelPrompt || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Prompt assist failed');
      return null;
    } finally {
      setBusyAssist(false);
    }
  };

  const pollJob = (jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/video/jobs/${jobId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Status failed');
        const j = data.job as Job;
        setJob(j);
        if (j.status === 'succeeded') {
          setPreviewUrl(j.localAssetUrl || j.assetUrl || null);
          setBusyGenerate(false);
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (j.status === 'failed' || j.status === 'canceled') {
          setError(j.error || `Job ${j.status}`);
          setBusyGenerate(false);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Poll failed');
        setBusyGenerate(false);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 2000);
  };

  const runGenerate = async () => {
    setBusyGenerate(true);
    setError(null);
    setPreviewUrl(null);
    setStaged(null);
    try {
      let promptToUse = modelPrompt.trim();
      if (!promptToUse) {
        const assistedPrompt = await runAssist();
        promptToUse = (assistedPrompt || '').trim() || plain;
      }
      const res = await fetch('/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: plain,
          modelPrompt: promptToUse,
          provider,
          mode,
          aspectRatio,
          durationSeconds: assisted?.durationSeconds || 5,
          negativePrompt: assisted?.negativePrompt,
          referenceImage: mode !== 't2v' && referenceKind === 'image' ? referenceUrl : null,
          referenceVideo: mode === 'v2v' && referenceKind === 'video' ? referenceUrl : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generate failed');
      setJob(data.job);
      pollJob(data.job.jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generate failed');
      setBusyGenerate(false);
    }
  };

  const discardPreview = () => {
    setPreviewUrl(null);
    setJob(null);
    setStaged(null);
  };

  const stageForPost = async () => {
    if (!previewUrl) return;
    setError(null);
    try {
      const res = await fetch('/api/video/stage-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: previewUrl,
          caption,
          platform: 'tiktok',
          script: modelPrompt || plain,
          provider,
          includeAiDisclosure,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not stage for approval');
      setStaged({
        id: data.staged.id,
        toolName: data.staged.toolName,
        summary: data.staged.summary,
        status: data.staged.status,
        payload: data.staged.payload,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Stage failed');
    }
  };

  const onApproveStaged = async (id: number) => {
    setStageBusy(id);
    try {
      const res = await fetch(`/api/agents/consultant/staged/${id}/approve`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Approve failed');
      setStaged((prev) =>
        prev
          ? {
              ...prev,
              status: data.staged?.status || 'executed',
              summary: data.staged?.resultSummary || data.execution?.summary || prev.summary,
            }
          : prev
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
      setStaged((prev) => (prev ? { ...prev, status: 'dismissed' } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dismiss failed');
    } finally {
      setStageBusy(null);
    }
  };

  return (
    <Tabs defaultValue="generate" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="generate" className="gap-1.5">
          <Clapperboard className="h-3.5 w-3.5" />
          Generate
        </TabsTrigger>
        <TabsTrigger value="clip" className="gap-1.5">
          <Scissors className="h-3.5 w-3.5" />
          Clip a long video
        </TabsTrigger>
      </TabsList>

      <TabsContent value="generate">
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
      <div className="xl:col-span-3 space-y-5">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Clapperboard className="h-5 w-5" />
            Video studio
          </h2>
          <p className="text-sm text-muted-foreground">
            Describe a clip in plain words — no analysis step required. Wan (open model via
            managed API) generates; posting stays behind the human gate.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Provider" />
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
            <Label>Aspect</Label>
            <Select
              value={aspectRatio}
              onValueChange={(v) => setAspectRatio(v as (typeof ASPECTS)[number])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASPECTS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                    {a === '9:16' ? ' · Reels/TikTok' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Your description</Label>
          <Textarea
            value={plain}
            onChange={(e) => setPlain(e.target.value)}
            rows={3}
            placeholder="30-sec clip on our housing plan, upbeat, city backdrop"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Reference asset (optional)</Label>
            <div className="flex gap-1">
              {availableModes.map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={mode === m ? 'default' : 'outline'}
                  onClick={() => setMode(m)}
                  className="h-7 text-xs uppercase"
                >
                  {m}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Mode options come from this provider&apos;s capabilities
            {selectedCaps?.notes ? ` — ${selectedCaps.notes}` : '.'}
          </p>
          <div className="flex flex-wrap gap-2">
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
              Upload photo or clip
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,video/mp4"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
              }}
            />
            {referenceUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setReferenceUrl(null);
                  setReferenceKind(null);
                  setMode('t2v');
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear reference
              </Button>
            )}
          </div>
          {referenceUrl && (
            <div className="rounded-md border border-border p-2 flex items-center gap-3">
              {referenceKind === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={referenceUrl}
                  alt="Reference"
                  className="h-16 w-16 object-cover rounded"
                />
              ) : (
                <video src={referenceUrl} className="h-16 w-24 rounded bg-black" muted />
              )}
              <div className="text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Using as {mode} input</p>
                <p className="truncate max-w-xs">{referenceUrl}</p>
              </div>
            </div>
          )}
          {assets.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <ImagePlus className="h-3.5 w-3.5" />
                Shared asset pool
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {assets.slice(0, 12).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setReferenceUrl(a.url);
                      setReferenceKind(a.type);
                      if (a.type === 'video' && availableModes.includes('v2v')) setMode('v2v');
                      if (a.type === 'image' && availableModes.includes('i2v')) setMode('i2v');
                    }}
                    className={cn(
                      'shrink-0 rounded border border-border overflow-hidden h-14 w-14',
                      referenceUrl === a.url && 'ring-2 ring-primary'
                    )}
                    title={a.name}
                  >
                    {a.type === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full bg-muted flex items-center justify-center">
                        <Film className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={busyAssist} onClick={() => void runAssist()}>
            {busyAssist ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Expand prompt
          </Button>
          <Button type="button" disabled={busyGenerate || !plain.trim()} onClick={() => void runGenerate()}>
            {busyGenerate ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Film className="h-4 w-4" />
            )}
            Generate
          </Button>
        </div>

        {assisted && (
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <p className="text-sm font-medium">Prompt assist</p>
            <p className="text-xs text-muted-foreground">{assisted.explanation}</p>
            {assisted.referenceGuidance && (
              <p className="text-xs">
                <Badge variant="outline" className="mr-1">
                  Reference
                </Badge>
                {assisted.referenceGuidance}
              </p>
            )}
            <Label className="text-xs">Model prompt (editable)</Label>
            <Textarea
              value={modelPrompt}
              onChange={(e) => setModelPrompt(e.target.value)}
              rows={4}
              className="text-sm"
            />
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="xl:col-span-2 space-y-4">
        <div className="rounded-lg border border-border p-4 space-y-3 min-h-[320px] flex flex-col">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Preview</p>
            {job && (
              <Badge variant="secondary" className="capitalize">
                {job.status}
              </Badge>
            )}
          </div>
          {busyGenerate && (
            <div className="space-y-2">
              <Progress value={job?.progress || 15} />
              <p className="text-xs text-muted-foreground">
                Generating with {provider}… this can take a minute.
              </p>
            </div>
          )}
          {previewUrl ? (
            <video
              key={previewUrl}
              src={previewUrl}
              controls
              playsInline
              className="w-full max-h-[420px] rounded-md bg-black"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground border border-dashed border-border rounded-md">
              Generate to preview here
            </div>
          )}

          {previewUrl && (
            <div className="space-y-2 pt-2 border-t border-border">
              <Label className="text-xs">Caption for post review</Label>
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={2}
                className="text-sm"
              />
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
                <Button type="button" variant="ghost" size="sm" onClick={discardPreview}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Discard
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busyGenerate}
                  onClick={() => void runGenerate()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Regenerate
                </Button>
                <Button type="button" size="sm" onClick={() => void stageForPost()}>
                  <Check className="h-3.5 w-3.5" />
                  Approve for post
                </Button>
              </div>
            </div>
          )}
        </div>

        {staged && (
          <StagedActionCard
            action={staged}
            onApprove={onApproveStaged}
            onDismiss={onDismissStaged}
            busyId={stageBusy}
          />
        )}

        <p className="text-xs text-muted-foreground">
          Approve stages <code className="text-[11px]">generate_and_post_video</code> for
          review — same &quot;review before it goes out&quot; language as Auto-Post. Nothing
          publishes until you confirm on the card.{' '}
          <Link href="/agents/campaign-consultant" className="underline underline-offset-2">
            Open consultant
          </Link>
        </p>
      </div>
    </div>
      </TabsContent>

      <TabsContent value="clip">
        <ClipStudioPanel />
      </TabsContent>
    </Tabs>
  );
}
