'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { toast } from 'react-hot-toast'
import { ArrowLeft, MessageCircle, Settings, Save, Shield } from 'lucide-react'
import { AnonymityLevel } from '@/app/utils/interface'
import { getAllModels } from '@/app/utils/models'

type QualStrategy = 'socratic' | 'reflective' | 'open-ended'

export default function CreateQualitativeSurveyPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [anonymityLevel, setAnonymityLevel] = useState<AnonymityLevel>('semi_anonymous')
  const [demographicsRequired, setDemographicsRequired] = useState<boolean>(true)

  const [goals, setGoals] = useState('')
  const [themes, setThemes] = useState('')
  const [redLines, setRedLines] = useState('')
  const [persona, setPersona] = useState('')
  const [strategy, setStrategy] = useState<QualStrategy>('open-ended')
  const [maxTurns, setMaxTurns] = useState<number>(12)
  const [maxMinutes, setMaxMinutes] = useState<number>(15)
  const [model, setModel] = useState<string>('gpt-4o-mini')
  const [temperature, setTemperature] = useState<number>(0.3)
  const [intro, setIntro] = useState<string>('To start, please share a specific experience related to this topic (time, place, context).')
  const [closing, setClosing] = useState<string>('Before we wrap up: Is there anything important we didn\'t cover? What\'s the one takeaway you want us to remember?')
  const [consent, setConsent] = useState('This session is an interview-style conversation. Your responses may be analyzed to extract themes and quotes. Do not share sensitive personal information.')

  const [saving, setSaving] = useState(false)

  const saveSurvey = async () => {
    if (!title.trim()) {
      toast.error('Please enter a title')
      return
    }

    // Compose a single hidden transcript question to store the chat result
    const hiddenTranscriptQuestion = {
      id: `q_${Date.now()}`,
      type: 'text',
      prompt: 'Conversation transcript (system)',
      options: [],
      isRequired: false,
      order: 1
    }

    const payload = {
      title,
      description,
      isPublic,
      anonymityLevel,
      demographicsRequired: anonymityLevel !== 'anonymous' ? demographicsRequired : false,
      questions: [hiddenTranscriptQuestion],
      source: 'native',
      sourceMetadata: {
        type: 'qualitative',
        settings: {
          qualitative: {
            goals,
            themes,
            redLines,
            persona,
            strategy,
            limits: { maxTurns, maxMinutes },
            model,
            temperature,
            intro,
            closing,
            consent
          }
        }
      }
    }

    try {
      setSaving(true)
      const res = await fetch('/api/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to create survey' }))
        throw new Error(err.message || 'Failed to create survey')
      }

      toast.success('Qualitative survey created')
      router.push('/surveys')
    } catch (e:any) {
      toast.error(e.message || 'Failed to create survey')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        {/* Header */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <Button variant="ghost" size="sm" asChild className="mr-2">
                <Link href="/create" className="flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Link>
              </Button>
              <h1 className="text-base font-medium text-card-foreground">Create Qualitative Survey</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={saveSurvey} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </div>

        <div className="border-b border-border" />

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-primary" />
                <CardTitle>Overview</CardTitle>
              </div>
              <CardDescription>Define the study and how the agent should conduct the interview</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Title</Label>
                <Input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="e.g., Product Discovery Interviews" />
              </div>
              <div>
                <Label>Public</Label>
                <div className="flex items-center h-10">
                  <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                </div>
              </div>
              <div className="md:col-span-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={(e)=>setDescription(e.target.value)} placeholder="Short description shown to participants" />
              </div>
              <div className="md:col-span-2 border-t pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2"><Shield className="h-4 w-4 text-primary"/><span className="text-sm font-medium">Anonymity Level</span></div>
                  <select className="w-full px-3 py-2 border border-input bg-background rounded-md" value={anonymityLevel} onChange={(e)=>setAnonymityLevel(e.target.value as AnonymityLevel)}>
                    <option value="full">Full Demographics</option>
                    <option value="semi_anonymous">Semi-Anonymous</option>
                    <option value="anonymous">Anonymous</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <div className="w-full">
                    <Label>Require Demographics</Label>
                    <div className="flex items-center h-10">
                      <Switch checked={demographicsRequired} onCheckedChange={setDemographicsRequired} disabled={anonymityLevel==='anonymous'} />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                <CardTitle>Research Intent</CardTitle>
              </div>
              <CardDescription>What are you trying to understand?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Goals / Hypotheses</Label>
                <Textarea value={goals} onChange={(e)=>setGoals(e.target.value)} placeholder="What you want to learn; hypotheses to test" />
              </div>
              <div>
                <Label>Themes to Explore</Label>
                <Textarea value={themes} onChange={(e)=>setThemes(e.target.value)} placeholder="Topics, sub-areas, angles" />
              </div>
              <div>
                <Label>Red Lines (avoid)</Label>
                <Textarea value={redLines} onChange={(e)=>setRedLines(e.target.value)} placeholder="Leading questions, sensitive areas to avoid" />
              </div>
              <div>
                <Label>Target Persona (optional)</Label>
                <Input value={persona} onChange={(e)=>setPersona(e.target.value)} placeholder="e.g., power users of mobile app" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                <CardTitle>Conversation Style</CardTitle>
              </div>
              <CardDescription>How should the agent ask and adapt?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Opening Question</Label>
                <Textarea value={intro} onChange={(e)=>setIntro(e.target.value)} placeholder="Targeted first question to kick off the interview" />
                <p className="text-xs text-muted-foreground mt-1">Used as the very first message.</p>
              </div>
              <div>
                <Label>Strategy</Label>
                <Select value={strategy} onValueChange={(v:QualStrategy)=>setStrategy(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open-ended">Open-ended</SelectItem>
                    <SelectItem value="socratic">Socratic (probing)</SelectItem>
                    <SelectItem value="reflective">Reflective listening</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Max Turns</Label>
                  <Input type="number" min={4} max={40} value={maxTurns} onChange={(e)=>setMaxTurns(Number(e.target.value))} />
                </div>
                <div>
                  <Label>Max Minutes</Label>
                  <Input type="number" min={5} max={60} value={maxMinutes} onChange={(e)=>setMaxMinutes(Number(e.target.value))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Model</Label>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {getAllModels().map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Temperature</Label>
                  <Input type="number" step={0.1} min={0} max={1} value={temperature} onChange={(e)=>setTemperature(Number(e.target.value))} />
                </div>
              </div>
              <div>
                <Label>Closing Prompt</Label>
                <Textarea value={closing} onChange={(e)=>setClosing(e.target.value)} placeholder="How the interview should wrap up" />
                <p className="text-xs text-muted-foreground mt-1">Used for the final question or wrap-up when the interview is ending.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                <CardTitle>Consent</CardTitle>
              </div>
              <CardDescription>Inform participants how their responses are used</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea value={consent} onChange={(e)=>setConsent(e.target.value)} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}


