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
  Brain,
  Rocket,
  ListChecks,
  MessageSquareText,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Copy,
  Minimize2,
  Maximize2,
  Sparkles,
  Loader2,
  RefreshCw,
  Phone,
  ExternalLink
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
  const [accessPassword, setAccessPassword] = useState('')
  const [hasAccessPassword, setHasAccessPassword] = useState(false)
  const [anonymityLevel, setAnonymityLevel] = useState<AnonymityLevel>('full')
  const [demographicsRequired, setDemographicsRequired] = useState(true)
  // Opt-in follow-up (ask for phone number on the /optin landing page)
  const [collectPhoneOptIn, setCollectPhoneOptIn] = useState(false)
  const [optInCopied, setOptInCopied] = useState(false)
  // Persist the opt-in preference locally (full backend wiring to distribution: later).
  useEffect(() => {
    if (!surveyId) return
    if (localStorage.getItem(`survey-optin-${surveyId}`) === '1') setCollectPhoneOptIn(true)
  }, [surveyId])
  useEffect(() => {
    if (!surveyId) return
    localStorage.setItem(`survey-optin-${surveyId}`, collectPhoneOptIn ? '1' : '0')
  }, [surveyId, collectPhoneOptIn])
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
  // Phase 2: Twin deployment controls (preview + threshold)
  const [deploying, setDeploying] = useState(false)
  const [threshold, setThreshold] = useState<number>(0.6)

  // Channels
  const [telegramEnabled, setTelegramEnabled] = useState<boolean>(false)
  const [telegramWelcome, setTelegramWelcome] = useState<string>('Welcome! Ready to start the survey?')
  const [previewMatches, setPreviewMatches] = useState<any[]>([])
  const [loadingPreview, setLoadingPreview] = useState(false)

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  
  // Collapsed questions state
  const [collapsedQuestions, setCollapsedQuestions] = useState<Set<number>>(new Set())

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

  const [showGenModal, setShowGenModal] = useState<{ open: boolean; qIndex: number|null; prompt: string }>({ open: false, qIndex: null, prompt: '' })
  const [genLoading, setGenLoading] = useState(false)

  // AI generate-from-prompt (bottom card)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiModel, setAiModel] = useState('gpt-4o-mini')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiSuccess, setAiSuccess] = useState(false)

  const openGenerateFor = (i: number, seed?: string) => {
    const q = questions[i]
    const base = seed || q?.prompt || ''
    const crafted = craftImagePromptFromQuestion(base)
    setShowGenModal({ open: true, qIndex: i, prompt: crafted })
  }

  const handleGenerateImage = async () => {
    if (showGenModal.qIndex == null) return
    setGenLoading(true)
    try {
      const res = await fetch('/api/media/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: showGenModal.prompt, size: '1024x1024' })
      })
      const data = await res.json()
      if (data.status && data.url) {
        const updated = [...questions]
        ;(updated[showGenModal.qIndex] as any).media = { url: data.url, alt: '' }
        setQuestions(updated)
        setShowGenModal({ open: false, qIndex: null, prompt: '' })
      } else {
        setError(data.message || 'Failed to generate image')
      }
    } catch (e:any) {
      setError(e.message || 'Failed to generate image')
    } finally {
      setGenLoading(false)
    }
  }

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return
    setAiGenerating(true)
    setAiError(null)
    setAiSuccess(false)
    try {
      const res = await fetch('/api/ai/generate-survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prompt: aiPrompt.trim(), model: aiModel, mode: 'standard' }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || data.error || 'Generation failed')

      const generated = data.survey || data
      if (generated.title && !title) setTitle(generated.title)
      if (generated.description && !description) setDescription(generated.description)
      if (Array.isArray(generated.questions) && generated.questions.length > 0) {
        const mapped: SurveyQuestion[] = generated.questions.map((q: any, i: number) => ({
          type: q.type || 'text',
          prompt: q.prompt || q.question || '',
          options: q.options || [],
          isRequired: q.isRequired ?? true,
          order: i,
        }))
        setQuestions(prev => [...prev, ...mapped])
      }
      setAiSuccess(true)
      setAiPrompt('')
    } catch (e: any) {
      setAiError(e.message || 'AI generation failed')
    } finally {
      setAiGenerating(false)
    }
  }

  function craftImagePromptFromQuestion(questionText: string): string {
    const text = (questionText || '').trim()
    if (!text) return 'Create a clean, modern, minimal illustration that matches the question topic. Abstract and metaphorical, neutral background, no text, high contrast, 3:2 aspect.'

    // Heuristics to simplify boilerplate and detect scales/spectrums
    const simplified = text
      .replace(/on a scale of\s*\d+\s*(?:to|\-|–)\s*\d+[^,\.]*(,|\.)?/gi, '')
      .replace(/\bwhere\s*\d+\s*=\s*[^,\.]*(,|\.)?/gi, '')
      .replace(/\bin\s*general[,\s]*/gi, '')
      .replace(/^please\s*/i, '')
      .replace(/^overall[,\s]*/i, '')
      .replace(/\s+/g, ' ')
      .trim()

    const isScale = /on a scale|scale of|1\s*[-–]?\s*5|1\s*to\s*5|strongly\s*(agree|disagree)/i.test(text)

    const subject = simplified.slice(0, 240)

    return (
      `Create a clean, modern, minimal illustration that captures the essence of: "${subject}". ` +
      `${isScale ? 'Convey a neutral, balanced spectrum without numbers or text. ' : ''}` +
      'Use abstract, metaphorical shapes and lighting. No text, no faces, no logos. Neutral background, high contrast, soft shadows. 3:2 aspect, web-ready.'
    )
  }

  useEffect(() => {
    if (surveyId) {
      fetchSurvey()
      // Load saved telegram channel config (enabled + welcome message)
      fetch(`/api/surveys/${surveyId}/channels/telegram`, { headers: { 'Content-Type': 'application/json' } })
        .then(r=>r.json())
        .then(data => {
          if (data?.status && data?.channel) {
            setTelegramEnabled((data.channel.status === 'enabled'))
            const cfg = data.channel.config || {}
            if (cfg.welcome) setTelegramWelcome(cfg.welcome)
          }
        })
        .catch(()=>{})
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
        setHasAccessPassword(Boolean((surveyData as any).has_access_password ?? (surveyData as any).access_password))
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

  const handlePreviewTwins = async () => {
    setLoadingPreview(true)
    setError(null)
    try {
      const res = await fetch(`/api/surveys/${surveyId}/twins/preview-matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ topK: 100 })
      })
      const data = await res.json()
      if (!data.status) throw new Error(data.message || 'Failed to preview')
      setPreviewMatches(data.results)
    } catch (e:any) {
      setError(e.message || 'Preview failed')
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleDeployTwins = async () => {
    setDeploying(true)
    setError(null)
    try {
      const eligible = previewMatches.filter(m => (m.readiness ?? 0) >= threshold)
      const res = await fetch(`/api/surveys/${surveyId}/twins/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ threshold, candidates: eligible })
      })
      const data = await res.json()
      if (!data.status) throw new Error(data.message || 'Deploy failed')
      // For dry-run, just reflect summary in UI
      setPreviewMatches(eligible)
    } catch (e:any) {
      setError(e.message || 'Deploy failed')
    } finally {
      setDeploying(false)
    }
  }

  const addQuestion = () => {
    const newQuestion: SurveyQuestion = {
      type: 'text',
      prompt: '',
      isRequired: true,
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
    setQuestions(questions.filter((_, i) => i !== index))
  }

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const newQuestions = [...questions]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    
    if (targetIndex < 0 || targetIndex >= newQuestions.length) return
    
    // Swap questions
    [newQuestions[index], newQuestions[targetIndex]] = [newQuestions[targetIndex], newQuestions[index]]
    
    setQuestions(newQuestions)
  }

  const duplicateQuestion = (index: number) => {
    const questionToDuplicate = questions[index]
    const duplicatedQuestion: SurveyQuestion = {
      ...questionToDuplicate,
      prompt: `${questionToDuplicate.prompt} (Copy)`,
      id: undefined // Remove ID so it creates a new question
    }
    const newQuestions = [...questions]
    newQuestions.splice(index + 1, 0, duplicatedQuestion)
    setQuestions(newQuestions)
  }

  const moveQuestionToPosition = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    
    const newQuestions = [...questions]
    const [movedQuestion] = newQuestions.splice(fromIndex, 1)
    newQuestions.splice(toIndex, 0, movedQuestion)
    
    setQuestions(newQuestions)
  }

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5'
    }
  }

  const handleDragEnd = (e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) {
      setDragOverIndex(null)
    }
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
      moveQuestionToPosition(draggedIndex, dropIndex)
    }
    
    setDraggedIndex(null)
    setDragOverIndex(null)
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
          accessPassword: isPublic ? null : (accessPassword || undefined),
          anonymityLevel,
          demographicsRequired,
          startAt: startAt || null,
          endAt: endAt || null,
          questions: questions.map((q, index) => ({
            ...q,
            order: index + 1,
            media: (q as any).media || undefined,
            optionMedia: (q as any).optionMedia || undefined
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
          accessPassword: isPublic ? null : (accessPassword || undefined),
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
          {/* Channels Tab (minimal first version) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ListChecks className="h-4 w-4" /> Channels</CardTitle>
              <CardDescription>Enable distribution channels for this survey. Telegram uses private chat with your bot.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3 bg-muted/30">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    <MessageSquareText className="h-4 w-4" />
                    Content messaging
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Upload a CSV of emails/phones, generate short bespoke messages/polls with AI, and send via configured channels.
                  </div>
                </div>
                <Button variant="outline" asChild>
                  <a href={`/surveys/${surveyId}/content-messaging`}>Open</a>
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Telegram</div>
                  <div className="text-xs text-muted-foreground">Private 1:1 chat via deep link</div>
                </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm">Enable</label>
                    <input
                      type="checkbox"
                      checked={telegramEnabled}
                      onChange={async (e)=>{
                        const checked = e.target.checked
                        setTelegramEnabled(checked)
                        try {
                          const url = `/api/surveys/${surveyId}/channels/telegram/enable`
                          const res = await fetch(url, { method: checked ? 'POST' : 'DELETE' })
                          const data = await res.json().catch(()=>({}))
                          if (!res.ok || data?.status === false) {
                            throw new Error(data?.message || 'Failed to update channel')
                          }
                        } catch (err) {
                          // revert on error
                          setTelegramEnabled(!checked)
                          console.error(err)
                        }
                      }}
                    />
                  </div>
              </div>
              {telegramEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="twelcome">Welcome message</Label>
                  <Textarea id="twelcome" value={telegramWelcome} onChange={e=>setTelegramWelcome(e.target.value)} />
                  <div className="text-xs text-muted-foreground">Shown before the first question.</div>
                  <Button size="sm" variant="outline" onClick={async()=>{
                    try {
                      const res = await fetch(`/api/surveys/${surveyId}/channels/telegram/enable`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ config: { welcome: telegramWelcome } })
                      })
                      const data = await res.json()
                      if (!res.ok || !data.status) throw new Error(data.message || 'Failed')
                    } catch (e) {
                      console.error(e)
                    }
                  }}>Save Telegram Settings</Button>
                </div>
              )}
            </CardContent>
          </Card>
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

              {/* Public vs private link */}
              <div className="rounded-lg border border-border p-3 space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="isPublic"
                    checked={isPublic}
                    onCheckedChange={(checked) => setIsPublic(checked as boolean)}
                  />
                  <Label htmlFor="isPublic" className="cursor-pointer">
                    {isPublic ? 'Public link — anyone with the link can respond' : 'Private link — password required to respond'}
                  </Label>
                </div>
                {!isPublic && (
                  <div className="pl-6">
                    <Label htmlFor="accessPassword">Link password</Label>
                    <Input
                      id="accessPassword"
                      type="text"
                      value={accessPassword}
                      onChange={(e) => setAccessPassword(e.target.value)}
                      placeholder={hasAccessPassword ? 'Password set — type to change it' : 'Set a password respondents must enter'}
                      className="mt-1 max-w-sm"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Respondents must enter this password before they can take the survey.
                      {hasAccessPassword ? ' Leave blank to keep the current password.' : ''}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Phase 2: Voter Profile Deployment — not available yet */}
          <Card className="opacity-60">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Rocket className="h-5 w-5" />
                    Deploy Voter Profiles (Preview)
                    <Badge variant="secondary" className="ml-1">Coming soon</Badge>
                  </CardTitle>
                  <CardDescription>Use voter profiles as synthetic responders with a readiness threshold. This feature isn&apos;t available yet.</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" disabled title="Coming soon">
                    <ListChecks className="h-4 w-4 mr-2" />
                    Preview Matches
                  </Button>
                  <Button disabled title="Coming soon">
                    <Rocket className="h-4 w-4 mr-2" />
                    Deploy (Dry-run)
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pointer-events-none select-none">
              <div>
                <Label>Readiness Threshold: {Math.round(threshold * 100)}%</Label>
                <input type="range" min="0" max="1" step="0.05" value={threshold} disabled readOnly className="w-full" />
                <p className="text-xs text-muted-foreground mt-1">Only voter profiles with readiness above this value are eligible.</p>
              </div>

              {previewMatches.length > 0 ? (
                <div className="rounded-lg border overflow-hidden">
                  <div className="grid grid-cols-6 gap-2 p-2 bg-muted text-xs font-medium">
                    <div>Agent</div>
                    <div>Similarity</div>
                    <div>Completion</div>
                    <div>Readiness</div>
                    <div>Survey Title</div>
                    <div>Reasons</div>
                  </div>
                  {previewMatches.map((m, idx) => (
                    <div key={m.agentToken || idx} className="grid grid-cols-6 gap-2 p-2 border-t text-xs items-center">
                      <div className="font-mono truncate" title={m.agentToken}>{m.agentToken?.slice(0,8)}...{m.agentToken?.slice(-6)}</div>
                      <div>{(m.similarity ?? 0).toFixed(2)}</div>
                      <div>{Math.round(m.completionPercentage ?? 0)}%</div>
                      <div className={((m.readiness ?? 0) >= threshold) ? 'text-green-600' : 'text-muted-foreground'}>
                        {Math.round(((m.readiness ?? 0) * 100))}%
                      </div>
                      <div className="truncate" title={m.surveyTitle}>{m.surveyTitle || '—'}</div>
                      <div className="truncate" title={(m.reasons||[]).join('; ')}>{(m.reasons||[]).slice(0,2).join('; ')}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No preview yet. Click "Preview Matches" to see eligible twins.</p>
              )}
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
                          Name, email, age, location, occupation, education, income, political leanings, gender, race, and interests (each field can be skipped)
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="semi_anonymous">
                      <div className="space-y-1">
                        <div className="font-medium">Semi-Anonymous</div>
                        <div className="text-xs text-muted-foreground">
                          Just age, location, gender, and race — no names, emails, or addresses
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="anonymous">
                      <div className="space-y-1">
                        <div className="font-medium">Anonymous</div>
                        <div className="text-xs text-muted-foreground">
                          Collects no demographic information at all
                        </div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground mt-2">
                  {getAnonymityLevelDescription(anonymityLevel)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  This only controls the &quot;About You&quot; profile step. You can still ask any demographic question inside the survey itself.
                </p>
              </div>

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
                    Ask for the profile before the questions. Respondents can still skip individual fields or answer &quot;N/A&quot;.
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

          {/* Opt-In Landing Page */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Opt-In Page
              </CardTitle>
              <CardDescription>
                A public landing page that greets respondents, lets them optionally sign up for text
                follow-ups, then sends them into the survey. Distribute this link instead of the raw survey
                link to collect SMS opt-ins.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="collectPhoneOptIn">Ask for a telephone number for future follow-up</Label>
                  <p className="text-sm text-muted-foreground">
                    Shows an optional mobile-number + consent step on the opt-in page. Respondents can always
                    skip it (&quot;No thanks — just take me to the survey&quot;).
                  </p>
                </div>
                <Checkbox
                  id="collectPhoneOptIn"
                  checked={collectPhoneOptIn}
                  onCheckedChange={(checked) => setCollectPhoneOptIn(checked as boolean)}
                />
              </div>

              {survey?.slug && (
                <div className="rounded-lg bg-muted/50 p-3 space-y-3">
                  <div className="text-xs text-muted-foreground break-all">
                    {typeof window !== 'undefined' ? window.location.origin : 'https://antelopedata.org'}
                    /optin?survey={survey.slug}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/optin?survey=${survey.slug}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open Opt-In Page
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const url = `${window.location.origin}/optin?survey=${survey.slug}`
                          await navigator.clipboard.writeText(url)
                          setOptInCopied(true)
                          setTimeout(() => setOptInCopied(false), 2000)
                        } catch { /* ignore */ }
                      }}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      {optInCopied ? 'Copied!' : 'Copy Opt-In Link'}
                    </Button>
                  </div>
                </div>
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

          {/* AI Generate from Prompt */}
          <Card className="border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Create with AI
              </CardTitle>
              <CardDescription>
                Describe your survey in plain English and AI will generate questions for you. New questions are appended below any existing ones.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Prompt</Label>
                <Textarea
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  placeholder='e.g. "A 10-question survey about community satisfaction with local parks, covering safety, cleanliness, facilities, and overall enjoyment. Mix of rating, yes/no, and open-ended."'
                  className="min-h-[100px]"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                <div className="flex-1 space-y-2">
                  <Label>AI Model</Label>
                  <Select value={aiModel} onValueChange={setAiModel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {getAllModels().map(m => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                          <span className="ml-2 text-xs text-muted-foreground">{m.provider}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleAiGenerate}
                  disabled={aiGenerating || !aiPrompt.trim()}
                  className="shrink-0"
                >
                  {aiGenerating
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</>
                    : <><Sparkles className="h-4 w-4 mr-2" />Generate Questions</>}
                </Button>
              </div>

              {aiError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{aiError}</AlertDescription>
                </Alert>
              )}
              {aiSuccess && (
                <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
                  <RefreshCw className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-700 dark:text-green-400">
                    Questions generated and added below. Review them and save when ready.
                  </AlertDescription>
                </Alert>
              )}
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
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={()=>{
                        // Batch generate modal uses first question prompt as seed; user can edit before run
                        const seed = (questions[0]?.prompt || '').slice(0, 500)
                        setShowGenModal({ open: true, qIndex: -1, prompt: seed })
                      }}>Generate images for all</Button>
                      <Button onClick={addQuestion}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Question
                      </Button>
                    </div>
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
                    <Card 
                      key={questionIndex} 
                      className={`border-2 transition-all ${
                        dragOverIndex === questionIndex ? 'border-primary border-dashed bg-primary/5' : ''
                      } ${draggedIndex === questionIndex ? 'opacity-50' : ''}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, questionIndex)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleDragOver(e, questionIndex)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, questionIndex)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div title="Drag to reorder">
                              <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                            </div>
                            <span className="text-sm font-medium text-muted-foreground">
                              Question {questionIndex + 1}
                            </span>
                            <Badge variant="outline">
                              {getQuestionTypeLabel(question.type)}
                            </Badge>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setCollapsedQuestions(prev => {
                                  const newSet = new Set(prev)
                                  if (newSet.has(questionIndex)) {
                                    newSet.delete(questionIndex)
                                  } else {
                                    newSet.add(questionIndex)
                                  }
                                  return newSet
                                })
                              }}
                              className="h-8 w-8 p-0"
                              title={collapsedQuestions.has(questionIndex) ? "Expand question" : "Collapse question"}
                            >
                              {collapsedQuestions.has(questionIndex) ? (
                                <Maximize2 className="h-4 w-4" />
                              ) : (
                                <Minimize2 className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => duplicateQuestion(questionIndex)}
                              className="h-8 w-8 p-0"
                              title="Duplicate question"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => moveQuestion(questionIndex, 'up')}
                              disabled={questionIndex === 0}
                              className="h-8 w-8 p-0"
                              title="Move up"
                            >
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => moveQuestion(questionIndex, 'down')}
                              disabled={questionIndex === questions.length - 1}
                              className="h-8 w-8 p-0"
                              title="Move down"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={()=> openGenerateFor(questionIndex)} title="Generate image with AI">
                              Generate image
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeQuestion(questionIndex)}
                              className="text-red-600 hover:text-red-700 h-8 w-8 p-0"
                              title="Remove question"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      {!collapsedQuestions.has(questionIndex) && (
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

                        {/* Question media upload */}
                        <div className="pt-1">
                          <Label>Question Media (optional)</Label>
                          <div className="mt-2 flex items-center gap-2">
                            <img src={(question as any).media?.url || '/assets/images/placeholder-survey.svg'} alt={(question as any).media?.alt || 'Question media'} className="h-12 w-12 rounded object-cover ring-1 ring-border" />
                            <Button type="button" variant="outline" size="sm" onClick={async ()=>{
                              const input = document.createElement('input'); input.type='file'; input.accept='image/png,image/jpeg,image/webp,image/gif';
                              input.onchange = async ()=>{ const f=input.files?.[0]; if(!f) return; const fd=new FormData(); fd.append('file',f); const res=await fetch('/api/media/upload',{method:'POST',body:fd}); const data=await res.json(); if(data.status){ const updated=[...questions]; (updated[questionIndex] as any).media = { url:data.url, alt:'' }; setQuestions(updated); } };
                              input.click();
                            }}>Upload</Button>
                            <Button type="button" variant="ghost" size="sm" onClick={()=>{ const updated=[...questions]; (updated[questionIndex] as any).media = undefined; setQuestions(updated); }}>Remove</Button>
                          </div>
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
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={async ()=>{
                                      const input = document.createElement('input'); input.type='file'; input.accept='image/png,image/jpeg,image/webp,image/gif';
                                      input.onchange = async ()=>{ const f=input.files?.[0]; if(!f) return; const fd=new FormData(); fd.append('file',f); const res=await fetch('/api/media/upload',{method:'POST',body:fd}); const data=await res.json(); if(data.status){ const updated=[...questions]; const q:any = updated[questionIndex]; q.optionMedia = q.optionMedia || []; q.optionMedia[optionIndex] = { url:data.url, alt:'' }; setQuestions(updated); } };
                                      input.click();
                                    }}
                                  >Img</Button>
                                  {((questions[questionIndex] as any).optionMedia?.[optionIndex]?.url) && (
                                    <img src={(questions[questionIndex] as any).optionMedia?.[optionIndex]?.url || ''} alt="" className="h-8 w-8 rounded object-cover ring-1 ring-border" />
                                  )}
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
                      )}
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

        {/* Generate Image Modal */}
        {showGenModal.open && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
            <div className="bg-card text-card-foreground rounded-lg shadow-lg w-full max-w-lg p-4">
              <div className="mb-3">
                <h3 className="text-lg font-medium">Generate image</h3>
                <p className="text-xs text-muted-foreground">Enter a description for the image. By default we use the question prompt.</p>
              </div>
              <div className="space-y-3">
                <Label>Prompt</Label>
                <Textarea rows={4} value={showGenModal.prompt} onChange={e=> setShowGenModal(prev=> ({ ...prev, prompt: e.target.value }))} />
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={()=> setShowGenModal({ open:false, qIndex:null, prompt:'' })}>Cancel</Button>
                <Button onClick={async()=>{
                  if (showGenModal.qIndex === -1) {
                    // Batch: iterate through questions
                    setGenLoading(true)
                    try {
                      for (let i=0;i<questions.length;i++){
                        const base = `${questions[i]?.prompt || ''}`.trim() || showGenModal.prompt
                        const prompt = craftImagePromptFromQuestion(base)
                        if (!prompt) continue
                        const res = await fetch('/api/media/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prompt, size: '1024x1024' }) })
                        const data = await res.json()
                        if (data?.status && data?.url){
                          setQuestions(prev=>{ const arr=[...prev]; (arr[i] as any).media = { url: data.url, alt: '' }; return arr })
                        }
                      }
                      setShowGenModal({ open:false, qIndex:null, prompt:'' })
                    } catch (e:any){ setError(e.message || 'Batch generation failed') } finally { setGenLoading(false) }
                  } else {
                    await handleGenerateImage()
                  }
                }} disabled={genLoading}>{genLoading ? 'Generating…' : (showGenModal.qIndex===-1 ? 'Generate All' : 'Generate')}</Button>
              </div>
            </div>
          </div>
        )}
    </div>
  )
}

export default EditSurveyPage 