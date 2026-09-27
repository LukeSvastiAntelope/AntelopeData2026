'use client'

import { useCallback, useEffect, useState } from 'react'
import { PortalShell } from '@/app/components/portal/portal-shell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/sonner'
import { Loader2 } from 'lucide-react'

type Task = {
  id: number
  title: string
  description: string | null
  dueAt: string | null
  status: string
  claimCount: number
  myClaimStatus: string | null
}

export default function PortalTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/portal/tasks')
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Load failed')
      setTasks(data.tasks || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const act = async (taskId: number, action: string) => {
    setBusyId(taskId)
    try {
      const res = await fetch('/api/portal/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, action }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Failed')
      toast.success(action === 'complete' ? 'Marked done' : 'Task claimed')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <PortalShell title="Tasks">
      <div className="space-y-4">
        <p className="text-sm text-zinc-600">
          Lightweight asks from the campaign — claim one, mark done when finished.
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500 py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading tasks…
          </div>
        ) : tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-5 text-sm text-zinc-500">
            No open tasks right now.
          </div>
        ) : (
          <ul className="space-y-3">
            {tasks.map((t) => (
              <li
                key={t.id}
                className="rounded-xl border border-zinc-200 bg-white p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{t.title}</p>
                    {t.dueAt && (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Due {new Date(t.dueAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <Badge variant={t.myClaimStatus ? 'default' : 'outline'}>
                    {t.myClaimStatus || t.status}
                  </Badge>
                </div>
                {t.description && (
                  <p className="text-xs text-zinc-600">{t.description}</p>
                )}
                <div className="flex gap-1.5 pt-1">
                  {!t.myClaimStatus && (
                    <Button
                      size="sm"
                      className="h-8"
                      disabled={busyId === t.id}
                      onClick={() => void act(t.id, 'claim')}
                    >
                      Claim
                    </Button>
                  )}
                  {t.myClaimStatus === 'claimed' && (
                    <Button
                      size="sm"
                      className="h-8"
                      disabled={busyId === t.id}
                      onClick={() => void act(t.id, 'complete')}
                    >
                      Mark done
                    </Button>
                  )}
                  {t.myClaimStatus === 'done' && (
                    <span className="text-xs text-teal-800 font-medium self-center">
                      Done
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PortalShell>
  )
}
