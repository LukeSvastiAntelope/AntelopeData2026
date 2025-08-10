/* eslint-disable react/no-unescaped-entities */
'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { RadioGroup } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Plus, 
  Trash2, 
  Save, 
  ArrowLeft,
  Eye,
  Settings,
  AlertCircle,
  Shield,
  Info,
  Brain
} from "lucide-react"
import { AnonymityLevel } from '@/app/utils/interface'
import { 
  ANONYMITY_CONFIGURATIONS, 
  getAnonymityLevelDescription, 
  getPrivacyNotice,
  getRecommendedAnonymityLevel,
  canChangeAnonymityLevel
} from '@/app/utils/anonymity-config'
import { getAllModels } from '@/app/utils/models'

interface SurveyQuestion {
  id?: number
  type: 'text' | 'single-choice' | 'multiple-choice' | 'rating' | 'yes-no'
  prompt: string
  options?: string[]
  isRequired: boolean
  order: number
}

interface Survey {
  id: number
  title: string
  description: string
  slug: string
  status: 'draft' | 'published' | 'closed'
  is_public: boolean
  anonymity_level: AnonymityLevel
  demographics_required: boolean
  created_at: string
  start_at?: string
  end_at?: string
  questions: SurveyQuestion[]
  source_metadata?: any
}

const EditSurveyPage = () => {
  const params = useParams()
  const router = useRouter()
  const surveyId = params.id as string

  const [survey, setSurvey] = useState<Survey | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [anonymityLevel, setAnonymityLevel] = useState<AnonymityLevel>('full')
  const [demographicsRequired, setDemographicsRequired] = useState(true)
  const [questions, setQuestions] = useState<SurveyQuestion[]>([])
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  // Qualitative settings
  const [isQualitative, setIsQualitative] = useState<boolean>(false)
  const [qGoals, setQGoals] = useState('')
  const [qThemes, setQThemes] = useState('')
  const [qRedLines, setQRedLines] = useState('')
  const [qPersona, setQPersona] = useState('')
  const [qStrategy, setQStrategy] = useState<'open-ended'|'socratic'|'reflective'>('open-ended')
  const [qMaxTurns, setQMaxTurns] = useState<number>(12)
  const [qMaxMinutes, setQMaxMinutes] = useState<number>(15)
  const [qModel, setQModel] = useState<string>('gpt-4o-mini')
  const [qTemperature, setQTemperature] = useState<number>(0.3)
  const [qIntro, setQIntro] = useState<string>('To start, please share a specific experience related to this topic (time, place, context).')
  const [qClosing, setQClosing] = useState<string>('Before we wrap up: Is there anything important we didn\'t cover? What\'s the one takeaway you want us to remember?')
  const [qConsent, setQConsent] = useState<string>('This session is an interview-style conversation. Your responses may be analyzed to extract themes and quotes. Do not share sensitive personal information.')

  const qualPreviewItems = useMemo(() => {
    const split = (s: string) => (s || '').split(/\n|;|,|•|-/g).map(t => t.trim()).filter(Boolean).slice(0, 4)
    const themes = split(qThemes)
    const goals = split(qGoals)
    const items: string[] = []
    themes.forEach(t => items.push(`Can you walk me through a concrete example related to "${t}"? When did it happen, where, and what led to it?`))
    goals.forEach(g => items.push(`Thinking about "${g}", what was the most recent moment that shaped your view? What happened next?`))
    items.push('What trade-offs or constraints influenced your decisions in this area?')
    items.push('If you could change one thing about your experience, what would it be and why?')
    return items
  }, [qThemes, qGoals])

  useEffect(() => {
    if (surveyId) {
      fetchSurvey()
    }
  }, [surveyId])

  const fetchSurvey = async () => {
    try {
      const response = await fetch(`/api/surveys/${surveyId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        const surveyData = data.survey
        setSurvey(surveyData)
        setTitle(surveyData.title)
        setDescription(surveyData.description || '')
        setIsPublic(surveyData.is_public)
        setAnonymityLevel(surveyData.anonymity_level || 'full')
        setDemographicsRequired(surveyData.demographics_required !== false)
        setQuestions(surveyData.questions || [])
        setStartAt(surveyData.start_at ? new Date(surveyData.start_at).toISOString().slice(0, 16) : '')
        setEndAt(surveyData.end_at ? new Date(surveyData.end_at).toISOString().slice(0, 16) : '')

        // Qualitative metadata
        const sm = (surveyData as any).source_metadata
        const isQual = Boolean(sm?.type === 'qualitative')
        setIsQualitative(isQual)
        const qcfg = sm?.settings?.qualitative || {}
        if (isQual) {
          setQGoals(qcfg.goals || '')
          setQThemes(qcfg.themes || '')
          setQRedLines(qcfg.redLines || '')
          setQPersona(qcfg.persona || '')
          setQStrategy(qcfg.strategy || 'open-ended')
          setQMaxTurns(qcfg.limits?.maxTurns ?? 12)
          setQMaxMinutes(qcfg.limits?.maxMinutes ?? 15)
          setQModel(qcfg.model || 'gpt-4o-mini')
          setQTemperature(typeof qcfg.temperature === 'number' ? qcfg.temperature : 0.3)
          setQIntro(qcfg.intro || 'To start, please share a specific experience related to this topic (time, place, context).')
          setQClosing(qcfg.closing || 'Before we wrap up: Is there anything important we didn\'t cover? What\'s the one takeaway you want us to remember?')
          setQConsent(qcfg.consent || 'This session is an interview-style conversation. Your responses may be analyzed to extract themes and quotes. Do not share sensitive personal information.')
        }
      } else {
        setError('Failed to load survey')
      }
    } catch (error) {
      console.error('Error fetching survey:', error)
      setError('Failed to load survey')
    } finally {
      setIsLoading(false)
    }
  }

  const addQuestion = () => {
    const newQuestion: SurveyQuestion = {
      type: 'text',
      prompt: '',
      isRequired: false,
      order: questions.length + 1
    }
    setQuestions([...questions, newQuestion])
  }

  const updateQuestion = (index: number, field: keyof SurveyQuestion, value: any) => {
    const updatedQuestions = [...questions]
    updatedQuestions[index] = { ...updatedQuestions[index], [field]: value }
    setQuestions(updatedQuestions)
  }

  const removeQuestion = (index: number) => {
    const updatedQuestions = questions.filter((_, i) => i !== index)
    // Update order numbers
    updatedQuestions.forEach((q, i) => q.order = i + 1)
    setQuestions(updatedQuestions)
  }

  const addOption = (questionIndex: number) => {
    const updatedQuestions = [...questions]
    const question = updatedQuestions[questionIndex]
    question.options = [...(question.options || []), '']
    setQuestions(updatedQuestions)
  }

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    const updatedQuestions = [...questions]
    const question = updatedQuestions[questionIndex]
    if (question.options) {
      question.options[optionIndex] = value
    }
    setQuestions(updatedQuestions)
  }

  const removeOption = (questionIndex: number, optionIndex: number) => {
    const updatedQuestions = [...questions]
    const question = updatedQuestions[questionIndex]
    if (question.options) {
      question.options = question.options.filter((_, i) => i !== optionIndex)
    }
    setQuestions(updatedQuestions)
  }

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Survey title is required')
      return
    }

    if (questions.length === 0) {
      setError('At least one question is required')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/surveys/${surveyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          title,
          description,
          isPublic,
          anonymityLevel,
          demographicsRequired,
          startAt: startAt || null,
          endAt: endAt || null,
          questions: questions.map((q, index) => ({
            ...q,
            order: index + 1
          })),
          sourceMetadata: isQualitative ? {
            type: 'qualitative',
            settings: {
              qualitative: {
                goals: qGoals,
                themes: qThemes,
                redLines: qRedLines,
                persona: qPersona,
                strategy: qStrategy,
                limits: { maxTurns: qMaxTurns, maxMinutes: qMaxMinutes },
                model: qModel,
                temperature: qTemperature,
                intro: qIntro,
                closing: qClosing,
                consent: qConsent
              }
            }
          } : undefined
        })
      })

      if (response.ok) {
        router.push('/surveys')
      } else {
        const data = await response.json()
        setError(data.message || 'Failed to save survey')
      }
    } catch (error) {
      console.error('Error saving survey:', error)
      setError('Failed to save survey')
    } finally {
      setIsSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!title.trim()) {
      setError('Survey title is required')
      return
    }

    if (questions.length === 0) {
      setError('At least one question is required')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/surveys/${surveyId}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          title,
          description,
          isPublic,
          anonymityLevel,
          demographicsRequired,
          startAt: startAt || null,
          endAt: endAt || null,
          questions: questions.map((q, index) => ({
            ...q,
            order: index + 1
          })),
          sourceMetadata: isQualitative ? {
            type: 'qualitative',
            settings: {
              qualitative: {
                goals: qGoals,
                themes: qThemes,
                redLines: qRedLines,
                persona: qPersona,
                strategy: qStrategy,
                limits: { maxTurns: qMaxTurns, maxMinutes: qMaxMinutes },
                model: qModel,
                temperature: qTemperature,
                intro: qIntro,
                closing: qClosing,
                consent: qConsent
              }
            }
          } : undefined
        })
      })

      if (response.ok) {
        router.push('/surveys')
      } else {
        const data = await response.json()
        setError(data.message || 'Failed to publish survey')
      }
    } catch (error) {
      console.error('Error publishing survey:', error)
      setError('Failed to publish survey')
    } finally {
      setIsSaving(false)
    }
  }

  const getQuestionTypeLabel = (type: string) => {
    switch (type) {
      case 'text': return 'Text Input'
      case 'single-choice': return 'Single Choice'
      case 'multiple-choice': return 'Multiple Choice'
      case 'rating': return 'Rating Scale'
      case 'yes-no': return 'Yes/No'
      default: return type
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 p-2 w-full bg-background">
        <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
          <div className="p-6">
            <div className="text-center">Loading survey...</div>
          </div>
        </div>
      </div>
    )
  }

  if (error && !survey) {
    return (
      <div className="flex-1 p-2 w-full bg-background">
        <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
          <div className="p-6">
            <div className="text-center text-red-600">{error}</div>
            <div className="text-center mt-4">
              <Button onClick={() => router.push('/surveys')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Surveys
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
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
              <h1 className="text-base font-medium text-card-foreground">Edit Survey</h1>
              {survey && (
                <Badge className="ml-3" variant={survey.status === 'published' ? 'default' : 'secondary'}>
                  {survey.status}
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.push('/surveys')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              {survey?.status === 'published' && (
                <Button variant="outline" asChild>
                  <a href={`/survey/${survey.slug}`} target="_blank">
                    <Eye className="h-4 w-4 mr-2" />
                    Preview
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
        
        <div className="border-b border-border" />

        <div className="p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span className="text-red-600">{error}</span>
            </div>
          )}

          {/* Survey Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Survey Details
              </CardTitle>
              <CardDescription>
                Basic information about your survey
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">Survey Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter survey title"
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this survey is about"
                  className="mt-1"
                  rows={3}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isPublic"
                  checked={isPublic}
                  onCheckedChange={(checked) => setIsPublic(checked as boolean)}
                />
                <Label htmlFor="isPublic">Make this survey publicly accessible</Label>
              </div>
            </CardContent>
          </Card>

          {/* Privacy & Anonymity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Privacy & Anonymity
              </CardTitle>
              <CardDescription>
                Configure data collection and privacy settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="anonymityLevel">Anonymity Level</Label>
                <Select
                  value={anonymityLevel}
                  onValueChange={(value: AnonymityLevel) => {
                    if (survey && !canChangeAnonymityLevel(survey.anonymity_level, value, survey.status === 'published')) {
                      setError('Cannot change anonymity level: this would violate existing respondent privacy agreements')
                      return
                    }
                    setAnonymityLevel(value)
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">
                      <div className="space-y-1">
                        <div className="font-medium">Full Demographics</div>
                        <div className="text-xs text-muted-foreground">
                          Collect name, email, and complete demographic profile
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="semi_anonymous">
                      <div className="space-y-1">
                        <div className="font-medium">Semi-Anonymous</div>
                        <div className="text-xs text-muted-foreground">
                          Collect demographics without personal identification
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="anonymous">
                      <div className="space-y-1">
                        <div className="font-medium">Anonymous</div>
                        <div className="text-xs text-muted-foreground">
                          Minimal data collection for complete privacy
                        </div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground mt-2">
                  {getAnonymityLevelDescription(anonymityLevel)}
                </p>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  {getPrivacyNotice(anonymityLevel)}
                </AlertDescription>
              </Alert>

              {title && description && (
                <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Brain className="h-4 w-4 text-blue-600 mt-0.5" />
                    <div className="text-xs text-blue-700 dark:text-blue-300">
                      <p className="font-medium mb-1">AI Recommendation</p>
                      <p>
                        Based on your survey content, we recommend: <strong>
                          {getRecommendedAnonymityLevel(title, description)}
                        </strong> anonymity level.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="demographicsRequired">Require Demographics</Label>
                  <p className="text-sm text-muted-foreground">
                    Force respondents to complete demographics before survey questions
                  </p>
                </div>
                <Checkbox
                  id="demographicsRequired"
                  checked={demographicsRequired}
                  onCheckedChange={(checked) => setDemographicsRequired(checked as boolean)}
                  disabled={anonymityLevel === 'anonymous'}
                />
              </div>

              {survey?.status === 'published' && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Published Survey:</strong> Privacy settings can only be made more restrictive to protect existing respondents.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Scheduling */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Survey Scheduling
              </CardTitle>
              <CardDescription>
                Set when your survey should be active (optional)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startAt">Start Date & Time</Label>
                  <Input
                    id="startAt"
                    type="datetime-local"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    When the survey should become available
                  </p>
                </div>
                
                <div>
                  <Label htmlFor="endAt">End Date & Time</Label>
                  <Input
                    id="endAt"
                    type="datetime-local"
                    value={endAt}
                    onChange={(e) => setEndAt(e.target.value)}
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    When the survey should close automatically
                  </p>
                </div>
              </div>
              
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  <strong>Scheduling Notes:</strong>
                </p>
                <ul className="text-xs text-blue-600 dark:text-blue-400 mt-1 ml-4 list-disc">
                  <li>Leave both fields empty to publish immediately</li>
                  <li>Set only start time to schedule publication</li>
                  <li>Set both to create a time-limited survey</li>
                  <li>Times are in your local timezone</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Qualitative Settings */}
          {isQualitative && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">Qualitative Interview Settings</CardTitle>
                <CardDescription>Adjust the interview agent prompts and behavior</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Opening Question</Label>
                  <Textarea value={qIntro} onChange={e=>setQIntro(e.target.value)} placeholder="Targeted first question" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Goals / Hypotheses</Label>
                    <Textarea value={qGoals} onChange={e=>setQGoals(e.target.value)} />
                  </div>
                  <div>
                    <Label>Themes</Label>
                    <Textarea value={qThemes} onChange={e=>setQThemes(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Red Lines (avoid)</Label>
                    <Textarea value={qRedLines} onChange={e=>setQRedLines(e.target.value)} />
                  </div>
                  <div>
                    <Label>Participant Persona</Label>
                    <Input value={qPersona} onChange={e=>setQPersona(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Strategy</Label>
                    <Select value={qStrategy} onValueChange={(v)=>setQStrategy(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
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
                      <Input type="number" min={4} max={40} value={qMaxTurns} onChange={e=>setQMaxTurns(Number(e.target.value))} />
                    </div>
                    <div>
                      <Label>Max Minutes</Label>
                      <Input type="number" min={5} max={60} value={qMaxMinutes} onChange={e=>setQMaxMinutes(Number(e.target.value))} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Model</Label>
                    <Select value={qModel} onValueChange={setQModel}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {getAllModels().map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Temperature</Label>
                    <Input type="number" step={0.1} min={0} max={1} value={qTemperature} onChange={e=>setQTemperature(Number(e.target.value))} />
                  </div>
                </div>
                <div>
                  <Label>Closing Prompt</Label>
                  <Textarea value={qClosing} onChange={e=>setQClosing(e.target.value)} />
                </div>
                <div>
                  <Label>Consent</Label>
                  <Textarea value={qConsent} onChange={e=>setQConsent(e.target.value)} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Questions */}
          <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Questions</CardTitle>
                  <CardDescription>
                    Add and configure your survey questions
                  </CardDescription>
                </div>
                  {!isQualitative && (
                    <Button onClick={addQuestion}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Question
                    </Button>
                  )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isQualitative ? (
                <div className="space-y-3">
                  <div className="rounded-lg border p-4 bg-muted/30">
                    <p className="text-sm text-muted-foreground mb-2">This qualitative interview stores a single hidden transcript internally. Instead of editing raw questions, the agent will ask targeted, adaptive questions based on your settings above. Here is a preview of the questioning style:</p>
                    <ol className="space-y-2 list-decimal ml-5">
                      <li className="font-medium">{qIntro || 'To start, please share a specific experience related to this topic (time, place, context).'}</li>
                      {qualPreviewItems.map((q, i) => (<li key={i} className="text-foreground">{q}</li>))}
                      <li className="font-medium">{qClosing || "Before we wrap up: Is there anything important we didn't cover? What's the one takeaway you want us to remember?"}</li>
                    </ol>
                  </div>
                  <p className="text-xs text-muted-foreground">Note: The agent will use short probes (e.g., “What led to that?”, “What happened next?”) and avoid leading questions.</p>
                </div>
              ) : (
                <>
                  {questions.map((question, questionIndex) => (
                    <Card key={questionIndex} className="border-2">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-muted-foreground">
                              Question {questionIndex + 1}
                            </span>
                            <Badge variant="outline">
                              {getQuestionTypeLabel(question.type)}
                            </Badge>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeQuestion(questionIndex)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Question Type</Label>
                            <select
                              value={question.type}
                              onChange={(e) => updateQuestion(questionIndex, 'type', e.target.value)}
                              className="w-full mt-1 px-3 py-2 border border-input bg-background rounded-md"
                            >
                              <option value="text">Text Input</option>
                              <option value="single-choice">Single Choice</option>
                              <option value="multiple-choice">Multiple Choice</option>
                              <option value="rating">Rating Scale</option>
                              <option value="yes-no">Yes/No</option>
                            </select>
                          </div>
                          <div className="flex items-center space-x-2 mt-6">
                            <Checkbox
                              checked={question.isRequired}
                              onCheckedChange={(checked) => updateQuestion(questionIndex, 'isRequired', checked)}
                            />
                            <Label>Required</Label>
                          </div>
                        </div>

                        <div>
                          <Label>Question Text</Label>
                          <Textarea
                            value={question.prompt}
                            onChange={(e) => updateQuestion(questionIndex, 'prompt', e.target.value)}
                            placeholder="Enter your question"
                            className="mt-1"
                            rows={2}
                          />
                        </div>

                        {(question.type === 'single-choice' || question.type === 'multiple-choice') && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <Label>Options</Label>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addOption(questionIndex)}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Add Option
                              </Button>
                            </div>
                            <div className="space-y-2">
                              {(question.options || []).map((option, optionIndex) => (
                                <div key={optionIndex} className="flex items-center gap-2">
                                  <Input
                                    value={option}
                                    onChange={(e) => updateOption(questionIndex, optionIndex, e.target.value)}
                                    placeholder={`Option ${optionIndex + 1}`}
                                    className="flex-1"
                                  />
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeOption(questionIndex, optionIndex)}
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}

                  {(questions.length === 0 && !isQualitative) && (
                    <div className="text-center py-8 text-muted-foreground">
                      No questions added yet. Click &quot;Add Question&quot; to get started.
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-between">
            <div>
              {survey?.status === 'published' && (
                <p className="text-sm text-muted-foreground">
                  This survey is published and collecting responses. Changes will be applied immediately.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleSave} disabled={isSaving}>
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save Draft'}
              </Button>
              {survey?.status === 'draft' ? (
                <>
                  <Button variant="outline" asChild>
                    <a href={`/survey/${survey.slug}`} target="_blank">
                      <Eye className="h-4 w-4 mr-2" />
                      Preview
                    </a>
                  </Button>
                  <Button onClick={handlePublish} disabled={isSaving}>
                    {isSaving ? 'Publishing...' : 'Publish Survey'}
                  </Button>
                </>
              ) : (
                <Button onClick={handleSave} disabled={isSaving}>
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? 'Updating...' : 'Update Published Survey'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default EditSurveyPage 