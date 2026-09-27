'use client'

/**
 * Volunteer V4 — private friends & family contacts + AI relational outreach.
 * Contacts stay private to this volunteer; never merged into the voter file.
 */

import { useCallback, useEffect, useState } from 'react'
import { PortalShell } from '@/app/components/portal/portal-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/sonner'
import {
  Loader2,
  Plus,
  Upload,
  Sparkles,
  Send,
  UserPlus,
  Trash2,
} from 'lucide-react'

type Contact = {
  id: number
  displayName: string
  email: string | null
  phone: string | null
  relationshipNote: string | null
  outreachStatus?: string | null
  outreachId?: number | null
  outcome?: string | null
}

type Outreach = {
  id: number
  contactId: number
  contactName?: string
  channel: string
  scriptText: string
  status: string
  outcome: string | null
  stagedActionId: number | null
  convertedAt: string | null
  contactEmail?: string | null
}

const OUTCOME_BTNS: Array<{ id: string; label: string }> = [
  { id: 'reached', label: 'Reached' },
  { id: 'left_message', label: 'Left msg' },
  { id: 'no_answer', label: 'No answer' },
  { id: 'will_help', label: 'Will help' },
  { id: 'wants_to_volunteer', label: 'Wants to vol.' },
  { id: 'not_interested', label: 'No thanks' },
]

export default function PortalContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [queue, setQueue] = useState<Outreach[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState<Outreach | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [rel, setRel] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/portal/contacts')
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Load failed')
      setContacts(data.contacts || [])
      setQueue(data.queue || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const addContact = async () => {
    if (!name.trim()) {
      toast.error('Name required')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/portal/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          relationshipNote: rel.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Failed')
      toast.success('Contact saved — private to you')
      setName('')
      setEmail('')
      setPhone('')
      setRel('')
      setShowAdd(false)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const importDevice = async () => {
    // Contact Picker API when available; otherwise prompt for paste JSON/CSV-ish lines
    const nav = navigator as any
    if (nav.contacts?.select) {
      try {
        const picked = await nav.contacts.select(['name', 'email', 'tel'], {
          multiple: true,
        })
        const mapped = (picked || []).map((c: any) => ({
          displayName: Array.isArray(c.name) ? c.name[0] : c.name || '',
          email: Array.isArray(c.email) ? c.email[0] : c.email || null,
          phone: Array.isArray(c.tel) ? c.tel[0] : c.tel || null,
        }))
        await runImport(mapped)
        return
      } catch {
        /* fall through */
      }
    }
    const raw = window.prompt(
      'Paste contacts — one per line: Name, email, phone\n(or JSON array)'
    )
    if (!raw?.trim()) return
    try {
      if (raw.trim().startsWith('[')) {
        await runImport(JSON.parse(raw))
        return
      }
      const lines = raw
        .split(/\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          const parts = line.split(/[,;\t]/).map((p) => p.trim())
          return {
            displayName: parts[0] || '',
            email: parts.find((p) => p.includes('@')) || null,
            phone:
              parts.find((p) => /^[\d+\-\s().]{7,}$/.test(p)) ||
              parts[2] ||
              null,
          }
        })
      await runImport(lines)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed')
    }
  }

  const runImport = async (contactsIn: any[]) => {
    setBusy(true)
    try {
      const res = await fetch('/api/portal/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', contacts: contactsIn }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Failed')
      toast.success(data.message || 'Imported')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  const assignScript = async (contactId: number) => {
    setBusy(true)
    try {
      const res = await fetch('/api/portal/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign', contactId }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Failed')
      setActive(data.outreach)
      toast.success(
        data.usedFallback
          ? 'Script ready (template)'
          : 'AI script ready'
      )
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const outreachAction = async (
    action: string,
    outreachId: number,
    extra?: Record<string, unknown>
  ) => {
    setBusy(true)
    try {
      const res = await fetch('/api/portal/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, outreachId, ...extra }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Failed')
      if (data.outreach) setActive(data.outreach)
      toast.success(data.message || 'Saved')
      if (action === 'log' || action === 'convert') {
        setActive(null)
      }
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const removeContact = async (contactId: number) => {
    if (!confirm('Remove this private contact?')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/portal/contacts?id=${contactId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Failed')
      toast.success('Removed')
      if (active?.contactId === contactId) setActive(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PortalShell title="Contacts">
      <div className="space-y-5">
        <p className="text-sm text-zinc-600 leading-relaxed">
          Reach people you already know. Your list stays private to you — never
          merged into the campaign voter file. Sends go through the approval
          gate.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="h-8"
            onClick={() => setShowAdd((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={busy}
            onClick={() => void importDevice()}
          >
            <Upload className="h-3.5 w-3.5 mr-1" />
            Import
          </Button>
        </div>

        {showAdd && (
          <div className="rounded-xl border border-zinc-200 bg-white p-3 space-y-2">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                className="h-9 mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Rivera"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Email</Label>
                <Input
                  className="h-9 mt-1"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="optional"
                />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input
                  className="h-9 mt-1"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="optional"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">How you know them</Label>
              <Input
                className="h-9 mt-1"
                value={rel}
                onChange={(e) => setRel(e.target.value)}
                placeholder="college roommate"
              />
            </div>
            <Button
              size="sm"
              className="h-8 w-full"
              disabled={busy}
              onClick={() => void addContact()}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                'Save private contact'
              )}
            </Button>
          </div>
        )}

        {active && (
          <section className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-zinc-900">
                  {active.contactName || 'Outreach'}
                </p>
                <p className="text-[11px] text-zinc-500 uppercase tracking-wide">
                  {active.channel} · {active.status}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setActive(null)}
              >
                Close
              </Button>
            </div>
            <p className="text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap">
              {active.scriptText}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(active.channel === 'sms' || active.channel === 'email') &&
                !active.stagedActionId && (
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={busy}
                    onClick={() =>
                      void outreachAction('stage', active.id)
                    }
                  >
                    <Send className="h-3.5 w-3.5 mr-1" />
                    Stage send
                  </Button>
                )}
              {active.stagedActionId && (
                <Badge variant="outline">Queued for approval</Badge>
              )}
              {active.contactEmail && !active.convertedAt && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={busy}
                  onClick={() => void outreachAction('convert', active.id)}
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  Invite as volunteer
                </Button>
              )}
            </div>
            {!active.outcome && (
              <div>
                <p className="text-[11px] text-zinc-500 mb-1.5">
                  Log outcome (2 taps)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {OUTCOME_BTNS.map((o) => (
                    <Button
                      key={o.id}
                      size="sm"
                      variant="secondary"
                      className="h-8 text-xs"
                      disabled={busy}
                      onClick={() =>
                        void outreachAction('log', active.id, {
                          outcome: o.id,
                        })
                      }
                    >
                      {o.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500 py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : contacts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-5 text-sm text-zinc-500">
            No contacts yet. Add someone you know — mom, roommate, teammate —
            and we&apos;ll write a personal script.
          </div>
        ) : (
          <ul className="space-y-2">
            {contacts.map((c) => (
              <li
                key={c.id}
                className="rounded-xl border border-zinc-200 bg-white p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 truncate">
                      {c.displayName}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {[c.relationshipNote, c.email || c.phone]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {c.outcome && (
                      <Badge variant="outline" className="text-[10px]">
                        {c.outcome}
                      </Badge>
                    )}
                    <button
                      type="button"
                      className="p-1 text-zinc-400 hover:text-zinc-700"
                      onClick={() => void removeContact(c.id)}
                      aria-label="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="h-8 w-full"
                  disabled={busy}
                  onClick={() => {
                    if (c.outreachId && queue.find((q) => q.id === c.outreachId)) {
                      const q = queue.find((x) => x.id === c.outreachId)
                      if (q) {
                        setActive(q)
                        return
                      }
                    }
                    void assignScript(c.id)
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  {c.outreachStatus && !c.outcome
                    ? 'Open script'
                    : 'Get AI script'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PortalShell>
  )
}
