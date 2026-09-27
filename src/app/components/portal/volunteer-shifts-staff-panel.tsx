'use client'

/**
 * Volunteer V3 — staff create shifts/tasks, optional turf bind, stage reminders.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/sonner'
import { CalendarDays, CheckSquare, Loader2, Bell } from 'lucide-react'

type TurfOpt = { id: number; label: string }
type Shift = {
  id: number
  title: string
  startsAt: string
  locationText: string | null
  turfLabel: string | null
  capacity: number | null
  status: string
  claimCount: number
  reminderStagedAt: string | null
  checkinPromptStagedAt: string | null
}
type Task = {
  id: number
  title: string
  dueAt: string | null
  status: string
  claimCount: number
}

export function VolunteerShiftsStaffPanel() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [turfs, setTurfs] = useState<TurfOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [location, setLocation] = useState('')
  const [capacity, setCapacity] = useState('')
  const [turfId, setTurfId] = useState('')
  const [desc, setDesc] = useState('')
  const [reminderHours, setReminderHours] = useState('24')

  const [taskTitle, setTaskTitle] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [taskDesc, setTaskDesc] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sRes, tRes, turfRes] = await Promise.all([
        fetch('/api/dashboard/volunteers/shifts'),
        fetch('/api/dashboard/volunteers/tasks'),
        fetch('/api/dashboard/turfs'),
      ])
      const sData = await sRes.json()
      const tData = await tRes.json()
      const turfData = await turfRes.json()
      if (sRes.ok && sData.status) setShifts(sData.shifts || [])
      if (tRes.ok && tData.status) setTasks(tData.tasks || [])
      if (turfRes.ok && turfData.status) {
        setTurfs(
          (turfData.turfs || []).map((t: any) => ({
            id: t.id,
            label: t.label,
          }))
        )
      }
    } catch {
      toast.error('Failed to load shifts/tasks')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const createShift = async () => {
    if (!title.trim() || !startsAt) {
      toast.error('Title and start time required')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/dashboard/volunteers/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: desc.trim() || null,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          locationText: location.trim() || null,
          capacity: capacity ? Number(capacity) : null,
          turfId: turfId ? Number(turfId) : null,
          reminderHoursBefore: Number(reminderHours) || 24,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Failed')
      toast.success('Shift created')
      setTitle('')
      setStartsAt('')
      setEndsAt('')
      setLocation('')
      setCapacity('')
      setTurfId('')
      setDesc('')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const createTask = async () => {
    if (!taskTitle.trim()) {
      toast.error('Task title required')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/dashboard/volunteers/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskTitle.trim(),
          description: taskDesc.trim() || null,
          dueAt: taskDue ? new Date(taskDue).toISOString() : null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Failed')
      toast.success('Task created')
      setTaskTitle('')
      setTaskDue('')
      setTaskDesc('')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const stageReminder = async (
    shiftId: number,
    kind: 'pre_shift' | 'post_shift_checkin'
  ) => {
    setBusy(true)
    try {
      const res = await fetch('/api/dashboard/volunteers/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stage_reminder', shiftId, kind }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Failed')
      toast.success(data.message || 'Staged for Outbound approval')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          Shifts &amp; tasks
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Post shifts (optionally bound to a MiniVAN turf). Volunteers claim in
          the portal. Reminders stage to{' '}
          <Link href="/outbound" className="underline">
            Outbound
          </Link>{' '}
          — nothing auto-sends.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              New shift
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Saturday canvass — Ward 3"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Starts</Label>
                <Input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ends (optional)</Label>
                <Input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Staging address"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Capacity</Label>
                <Input
                  type="number"
                  min={1}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="Unlimited"
                />
              </div>
              <div className="space-y-1.5">
                <Label>MiniVAN turf (optional)</Label>
                <select
                  className="h-9 w-full rounded-md border border-border bg-background text-sm px-2"
                  value={turfId}
                  onChange={(e) => setTurfId(e.target.value)}
                >
                  <option value="">None</option>
                  {turfs.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Reminder hours before</Label>
                <Input
                  type="number"
                  min={1}
                  value={reminderHours}
                  onChange={(e) => setReminderHours(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Description</Label>
                <Textarea
                  rows={2}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                />
              </div>
            </div>
            <Button size="sm" disabled={busy} onClick={() => void createShift()}>
              Create shift
            </Button>
          </div>

          <ul className="space-y-2">
            {shifts.length === 0 ? (
              <li className="text-xs text-muted-foreground">No shifts yet.</li>
            ) : (
              shifts.map((s) => (
                <li
                  key={s.id}
                  className="rounded-lg border border-border p-3 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.startsAt).toLocaleString()}
                      {s.turfLabel ? ` · turf ${s.turfLabel}` : ''}
                      {` · ${s.claimCount}${s.capacity != null ? `/${s.capacity}` : ''} claimed`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{s.status}</Badge>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs"
                      disabled={busy || Boolean(s.reminderStagedAt)}
                      onClick={() => void stageReminder(s.id, 'pre_shift')}
                    >
                      <Bell className="h-3 w-3 mr-1" />
                      {s.reminderStagedAt ? 'Reminder staged' : 'Stage reminder'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={busy || Boolean(s.checkinPromptStagedAt)}
                      onClick={() =>
                        void stageReminder(s.id, 'post_shift_checkin')
                      }
                    >
                      {s.checkinPromptStagedAt
                        ? 'Check-in staged'
                        : 'Stage check-in'}
                    </Button>
                  </div>
                </li>
              ))
            )}
          </ul>

          <div className="rounded-lg border border-border p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <CheckSquare className="h-3.5 w-3.5" />
              New task
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Title</Label>
                <Input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Call 10 neighbors"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Due (optional)</Label>
                <Input
                  type="datetime-local"
                  value={taskDue}
                  onChange={(e) => setTaskDue(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Description</Label>
                <Textarea
                  rows={2}
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                />
              </div>
            </div>
            <Button size="sm" disabled={busy} onClick={() => void createTask()}>
              Create task
            </Button>
            <ul className="space-y-1.5 pt-2">
              {tasks.map((t) => (
                <li
                  key={t.id}
                  className="text-xs flex justify-between gap-2 border-b border-border/60 py-1.5"
                >
                  <span>
                    {t.title}
                    {t.dueAt
                      ? ` · due ${new Date(t.dueAt).toLocaleDateString()}`
                      : ''}
                  </span>
                  <span className="text-muted-foreground">
                    {t.claimCount} claimed · {t.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  )
}
