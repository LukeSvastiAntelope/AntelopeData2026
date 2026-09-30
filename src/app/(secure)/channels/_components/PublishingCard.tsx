'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Webhook, Loader2, Send, Trash2, Plus } from 'lucide-react';

type ContentType = 'video' | 'text';

type WebhookPublic = {
  id: number;
  label: string;
  urlMasked: string;
  secretMasked: string;
  contentTypes: ContentType[];
  enabled: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
};

type Draft = {
  label: string;
  url: string;
  contentTypes: ContentType[];
};

const EMPTY_DRAFT: Draft = {
  label: '',
  url: '',
  contentTypes: ['video', 'text'],
};

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function PublishingCard() {
  const [webhooks, setWebhooks] = useState<WebhookPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [freshSecret, setFreshSecret] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/channels/publishing', {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.status) {
        throw new Error(data?.message || 'Failed to load destinations');
      }
      setWebhooks(Array.isArray(data.webhooks) ? data.webhooks : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleType = (type: ContentType, on: boolean) => {
    setDraft((prev) => {
      const set = new Set(prev.contentTypes);
      if (on) set.add(type);
      else set.delete(type);
      const next = Array.from(set) as ContentType[];
      return {
        ...prev,
        contentTypes: next.length ? next : prev.contentTypes,
      };
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    setFreshSecret(null);
    try {
      const res = await fetch('/api/channels/publishing', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: draft.label.trim(),
          url: draft.url.trim(),
          contentTypes: draft.contentTypes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.status) {
        throw new Error(data?.message || 'Failed to save');
      }
      if (data.secret) setFreshSecret(String(data.secret));
      setNotice(
        data.message ||
          'Destination saved. Copy the signing secret — it will not be shown again.'
      );
      setDraft(EMPTY_DRAFT);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (wh: WebhookPublic, enabled: boolean) => {
    setTogglingId(wh.id);
    setError(null);
    try {
      const res = await fetch(`/api/channels/publishing/${wh.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.status) {
        throw new Error(data?.message || 'Failed to update');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (wh: WebhookPublic) => {
    if (
      !window.confirm(
        `Remove “${wh.label}”? Approved posts will no longer be sent to this hook.`
      )
    ) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/channels/publishing/${wh.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.status) {
        throw new Error(data?.message || 'Failed to delete');
      }
      setNotice(`Removed “${wh.label}”.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleTest = async (wh: WebhookPublic) => {
    setTestingId(wh.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/channels/publishing/${wh.id}/test`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.status) {
        throw new Error(data?.message || 'Delivery failed');
      }
      setNotice(
        data.message ||
          `Test sent to “${wh.label}” — check Zapier/Make for the sample.`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test send failed');
      await load();
    } finally {
      setTestingId(null);
    }
  };

  const enabledCount = webhooks.filter((w) => w.enabled).length;

  return (
    <Card className="md:col-span-2 lg:col-span-3">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2 gap-4">
        <div className="space-y-1">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Webhook className="h-4 w-4" /> Publishing
          </CardTitle>
          <p className="text-xs text-muted-foreground max-w-2xl">
            Paste a Zapier or Make Catch Hook URL. After you approve a video or
            post in Consultant, Antelope sends it here — your Zap publishes to
            the accounts you already use. Nothing fires on draft or stage.
          </p>
        </div>
        <Badge variant={enabledCount > 0 ? 'default' : 'secondary'}>
          {loading
            ? '…'
            : enabledCount > 0
              ? `${enabledCount} active`
              : 'Not set up'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">
            {error}
          </p>
        )}
        {notice && (
          <p className="text-sm text-muted-foreground bg-muted/50 rounded px-3 py-2">
            {notice}
          </p>
        )}
        {freshSecret && (
          <div className="rounded border border-border bg-muted/30 p-3 space-y-1">
            <p className="text-xs font-medium">Signing secret (copy now)</p>
            <code className="text-xs break-all block select-all">
              {freshSecret}
            </code>
            <p className="text-[11px] text-muted-foreground">
              Verify with headers <code>X-Antelope-Signature</code> and{' '}
              <code>X-Antelope-Timestamp</code> (HMAC-SHA256 of{' '}
              <code>timestamp.body</code>).
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading destinations…
          </div>
        ) : webhooks.length === 0 && !showForm ? (
          <p className="text-sm text-muted-foreground">
            No destinations yet. Add a Catch Hook to start routing approved
            content.
          </p>
        ) : (
          <ul className="space-y-3">
            {webhooks.map((wh) => {
              const lastOk = formatWhen(wh.lastSuccessAt);
              const lastFail = formatWhen(wh.lastFailureAt);
              return (
                <li
                  key={wh.id}
                  className="rounded-md border border-border p-3 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{wh.label}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {wh.urlMasked}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`pub-en-${wh.id}`}
                        className="text-xs text-muted-foreground"
                      >
                        {wh.enabled ? 'Enabled' : 'Disabled'}
                      </Label>
                      <Switch
                        id={`pub-en-${wh.id}`}
                        checked={wh.enabled}
                        disabled={togglingId === wh.id}
                        onCheckedChange={(v) => handleToggleEnabled(wh, v)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <span>
                      Types: {wh.contentTypes.join(', ') || 'none'}
                    </span>
                    <span>·</span>
                    <span>Secret: {wh.secretMasked}</span>
                    {lastOk && (
                      <>
                        <span>·</span>
                        <span>Last success: {lastOk}</span>
                      </>
                    )}
                    {lastFail && (
                      <>
                        <span>·</span>
                        <span>Last failure: {lastFail}</span>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={testingId === wh.id}
                      onClick={() => handleTest(wh)}
                    >
                      {testingId === wh.id ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5 mr-1" />
                      )}
                      Send test
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => handleDelete(wh)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {showForm ? (
          <form onSubmit={handleCreate} className="space-y-3 border-t border-border pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="pub-label">Name</Label>
              <Input
                id="pub-label"
                placeholder='e.g. "TikTok + Reels via Zapier"'
                value={draft.label}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, label: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pub-url">Catch Hook URL</Label>
              <Input
                id="pub-url"
                type="url"
                placeholder="https://hooks.zapier.com/hooks/catch/…"
                value={draft.url}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, url: e.target.value }))
                }
                required
              />
              <p className="text-[11px] text-muted-foreground">
                https only. Stored encrypted — shown masked after save.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Content types</Label>
              <div className="flex flex-wrap gap-4">
                {(['video', 'text'] as ContentType[]).map((type) => (
                  <label
                    key={type}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={draft.contentTypes.includes(type)}
                      onCheckedChange={(v) => toggleType(type, Boolean(v))}
                    />
                    {type === 'video' ? 'Video' : 'Text post'}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : null}
                Save destination
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setDraft(EMPTY_DRAFT);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button
            size="sm"
            onClick={() => setShowForm(true)}
            variant={webhooks.length ? 'outline' : 'default'}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add destination
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
