'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, X, Send, CheckCircle2, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface ContactList {
  id: number
  name: string
  contact_count: number
}

interface Survey {
  id: number
  title: string
  slug: string | null
}

interface Props {
  list: ContactList
  onClose: () => void
}

export default function SendSurveyModal({ list, onClose }: Props) {
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [surveysLoading, setSurveysLoading] = useState(true)
  const [selectedSurveyId, setSelectedSurveyId] = useState<string>('')
  const [messageTemplate, setMessageTemplate] = useState(
    "You're invited to take a survey: {{link}}"
  )
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/surveys', { credentials: 'include' })
        const data = await res.json()
        if (data.status) {
          setSurveys(
            (data.surveys || [])
              .filter((s: any) => s.is_editable !== false)
              .map((s: any) => ({ id: s.id, title: s.title, slug: s.slug }))
          )
        }
      } catch {
        toast.error('Failed to load surveys')
      } finally {
        setSurveysLoading(false)
      }
    }
    load()
  }, [])

  const send = async () => {
    if (!selectedSurveyId) { toast.error('Select a survey first'); return }
    setSending(true)
    setResult(null)
    try {
      // Fetch phone numbers from the list
      const listRes = await fetch(`/api/contact-lists/${list.id}?limit=500`, { credentials: 'include' })
      const listData = await listRes.json()
      if (!listRes.ok || !listData.status) throw new Error(listData.message || 'Failed to load contacts')

      const phoneNumbers: string[] = (listData.entries || [])
        .map((e: any) => (e.phone || '').toString().trim())
        .filter(Boolean)

      if (!phoneNumbers.length) throw new Error('No valid phone numbers in this list')

      const smsRes = await fetch(`/api/surveys/${selectedSurveyId}/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phoneNumbers, message: messageTemplate }),
      })
      const smsData = await smsRes.json()

      if (!smsRes.ok || !smsData.status) throw new Error(smsData.message || 'SMS send failed')

      if (smsData.sent === false && smsData.reason === 'twilio_not_configured') {
        toast.error('Twilio is not configured. Go to Channels → New → SMS to add your credentials.')
        return
      }

      const sent = smsData.summary?.sent ?? phoneNumbers.length
      const failed = smsData.summary?.failed ?? 0
      setResult({ sent, failed })
      toast.success(`Sent ${sent} messages${failed ? `, ${failed} failed` : ''}`)
    } catch (e: any) {
      toast.error(e.message || 'Send failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold">Send Survey via SMS</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-md border border-border p-3 text-sm flex items-center gap-2">
            <Badge variant="secondary">{list.contact_count.toLocaleString()} contacts</Badge>
            <span className="text-muted-foreground">{list.name}</span>
          </div>

          <div className="space-y-2">
            <Label>Survey</Label>
            {surveysLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />Loading surveys…
              </div>
            ) : (
              <Select value={selectedSurveyId} onValueChange={setSelectedSurveyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a survey to send" />
                </SelectTrigger>
                <SelectContent>
                  {surveys.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>Message Template</Label>
            <Input
              value={messageTemplate}
              onChange={e => setMessageTemplate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Use <code>{'{{link}}'}</code> where you want the survey link inserted.
            </p>
          </div>

          {result && (
            <div className={`rounded-md border p-3 text-sm flex items-center gap-2 ${result.failed ? 'border-yellow-500 bg-yellow-50 text-yellow-800' : 'border-green-500 bg-green-50 text-green-800'}`}>
              {result.failed
                ? <AlertCircle className="h-4 w-4" />
                : <CheckCircle2 className="h-4 w-4" />}
              Sent {result.sent} · Failed {result.failed}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={send} disabled={sending || !selectedSurveyId}>
            {sending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</>
              : <><Send className="h-4 w-4 mr-2" />Send to {list.contact_count.toLocaleString()} contacts</>}
          </Button>
        </div>
      </div>
    </div>
  )
}
