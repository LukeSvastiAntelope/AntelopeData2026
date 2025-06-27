'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, Mail } from 'lucide-react'

export default function DigitalTwinLoginPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>("idle")
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-xl">
            <Mail className="h-5 w-5" /> Access your Digital Twin
          </CardTitle>
          <CardDescription>Enter the email you used for the survey and we&apos;ll send you a secure link.</CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'sent' ? (
            <p className="text-center text-sm">If an account exists for <span className="font-medium">{email}</span>, a login link has been sent. Please check your inbox.</p>
          ) : (
            <div className="space-y-4">
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                disabled={status === 'loading'}
                onChange={(e) => setEmail(e.target.value)}
              />
              {errorMsg && <p className="text-destructive text-sm text-center">{errorMsg}</p>}
              <Button className="w-full" onClick={sendLink} disabled={status==='loading' || !email}>
                {status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Magic Link'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 