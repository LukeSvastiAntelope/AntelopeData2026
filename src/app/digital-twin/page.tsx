'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, Mail, CheckCircle2 } from 'lucide-react'

export default function DigitalTwinLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error' | 'checking'>("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const sendLink = async () => {
    if (!email) return
    setStatus('loading')
    setErrorMsg(null)
    try {
      const res = await fetch('/api/digital-twin/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const json = await res.json()
      if (json.status) {
        setStatus('sent')
      } else {
        setStatus('error')
        setErrorMsg(json.message || 'Failed to send link')
      }
    } catch (e) {
      setStatus('error')
      setErrorMsg('Network error')
    }
  }

  const checkAndOpen = async () => {
    if (!email) return
    setStatus('checking')
    setErrorMsg(null)
    try {
      const res = await fetch('/api/digital-twin/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const json = await res.json()
      if (json.status && json.agentToken) {
        router.push(`/digital-twin/${json.agentToken}`)
      } else {
        setStatus('error')
        setErrorMsg(json.message || 'No Voter Profile found for this email')
      }
    } catch (e) {
      setStatus('error')
      setErrorMsg('Network error')
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-32 h-96 w-96 rounded-full bg-gradient-to-br from-fuchsia-500/30 via-pink-500/20 to-orange-400/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-32 h-96 w-96 rounded-full bg-gradient-to-br from-sky-400/20 via-indigo-500/20 to-purple-500/25 blur-3xl" />
      </div>
      <div className="max-w-md mx-auto">
        <Card className="border-white/20 bg-white/60 dark:bg-white/5 backdrop-blur-xl">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2 text-xl">
              <Mail className="h-5 w-5" /> Access your Voter Profile
            </CardTitle>
            <CardDescription>Enter the email you used for the survey to get a secure link.</CardDescription>
          </CardHeader>
          <CardContent>
            {status === 'sent' ? (
              <div className="text-center space-y-3">
                <CheckCircle2 className="h-6 w-6 mx-auto text-green-600" />
                <p className="text-sm">If a twin exists for <span className="font-medium">{email}</span>, we\'ve emailed you a magic link.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  disabled={status === 'loading' || status === 'checking'}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {errorMsg && <p className="text-destructive text-sm text-center">{errorMsg}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button onClick={sendLink} disabled={!email || status==='loading' || status==='checking'}>
                    {status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Magic Link'}
                  </Button>
                  <Button variant="outline" onClick={checkAndOpen} disabled={!email || status==='loading' || status==='checking'}>
                    {status === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Open Now (if found)'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 