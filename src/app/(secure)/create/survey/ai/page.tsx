'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { SURVEY_MODELS } from '@/app/utils/const'
import { 
  Sparkles, 
  ArrowLeft, 
  Wand2, 
  Save, 
  Edit3,
  Brain,
  Lightbulb,
  Target,
  Users,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  Loader2,
  Cpu,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Trash2,
  Plus,
  Copy,
  Calendar,
  Clock,
  Shield,
  Info,
  Minimize2,
  Maximize2
} from "lucide-react"
import { AnonymityLevel } from '@/app/utils/interface'
import { 
  ANONYMITY_CONFIGURATIONS, 
  getAnonymityLevelDescription, 
  getPrivacyNotice,
  getRecommendedAnonymityLevel 
} from '@/app/utils/anonymity-config'
import { getTemplateById, POLITICAL_SURVEY_TEMPLATES, type SurveyTemplate } from '@/app/utils/political-survey-templates'
import { toast } from '@/components/ui/sonner'

interface GeneratedQuestion {
  type: 'text' | 'single-choice' | 'multiple-choice' | 'rating' | 'yes-no'
  prompt: string
  options?: string[]
  isRequired: boolean
  reasoning?: string
}

interface GeneratedSurvey {
  title: string
  description: string
  questions: GeneratedQuestion[]
  targetAudience?: string
  purpose?: string
}

// Default to the recommended curated model (latest GPT/Claude shortlist).
const DEFAULT_AI_SURVEY_MODEL =
  SURVEY_MODELS.find((m) => m.recommended)?.key || SURVEY_MODELS[0].key

// Build the AI description prompt for a "Use template" click.
const buildTemplatePrompt = (t: SurveyTemplate): string =>
  `Create a political survey inspired by the "${t.title}" template (${t.category}). ${t.description} ` +
  `Target roughly ${t.questions.length} substantive questions with similar themes; improve wording for clarity where helpful.`

const AISurveyBuilderPageInner = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const templatePromptApplied = useRef(false)

  const [prompt, setPrompt] = useState('')
  const [selectedModel, setSelectedModel] = useState(DEFAULT_AI_SURVEY_MODEL)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedSurvey, setGeneratedSurvey] = useState<GeneratedSurvey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [modelUsed, setModelUsed] = useState<string | null>(null)
  // Id of the draft auto-saved right after generation, so the survey always
  // appears in the Surveys list. Re-generating updates this same draft; the
  // explicit "Save" button updates it and navigates to the editor.
  const [savedSurveyId, setSavedSurveyId] = useState<number | null>(null)
  const [autoSaved, setAutoSaved] = useState(false)

  const [editableTitle, setEditableTitle] = useState('')
  const [editableDescription, setEditableDescription] = useState('')
  const [editableQuestions, setEditableQuestions] = useState<GeneratedQuestion[]>([])
  type Media = { url: string; alt: string }
  const [questionMedia, setQuestionMedia] = useState<Array<{ media?: Media; optionMedia?: (Media|null)[] }>>([])

  // Anonymity state
  const [anonymityLevel, setAnonymityLevel] = useState<AnonymityLevel>('full')
  const [demographicsRequired, setDemographicsRequired] = useState(true)
  const [isPublic, setIsPublic] = useState(true)
  const [accessPassword, setAccessPassword] = useState('')
  const [templatesCollapsed, setTemplatesCollapsed] = useState(false)

  // Scheduling state
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [autoPublish, setAutoPublish] = useState(false)
  // Media (cover)
  const [coverMedia, setCoverMedia] = useState<{url:string; alt:string; type:'image'|'video'} | null>({ url: '/assets/images/placeholder-survey.svg', alt: 'Placeholder cover', type: 'image' })
  // Presentation settings
  const [presentationMode, setPresentationMode] = useState<'all_at_once'|'one_by_one'|'sections'>('all_at_once')
  const [sections, setSections] = useState<Array<{ id: string; title: string }>>([])
  const [questionSectionIdByIndex, setQuestionSectionIdByIndex] = useState<Array<string | null>>([])

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  
  // Collapsed questions state
  const [collapsedQuestions, setCollapsedQuestions] = useState<Set<number>>(new Set())

  // Load saved model preference on mount
  useEffect(() => {
    const savedModel = localStorage.getItem('ai-survey-selected-model');
    // Only restore the saved model if it's still in the curated shortlist.
    if (savedModel && SURVEY_MODELS.some((m) => m.key === savedModel)) {
      setSelectedModel(savedModel);
    }
  }, []);

  // Prefill prompt when opened from a template card (deep link ?templateId=...)
  useEffect(() => {
    if (templatePromptApplied.current) return
    const templateId = searchParams.get('templateId')
    if (!templateId) return
    const t = getTemplateById(templateId)
    if (!t) return
    templatePromptApplied.current = true
    setPrompt(buildTemplatePrompt(t))
  }, [searchParams])

  // "Use template" click: fill the description box with the template prompt,
  // then bring the user to the box to review and generate.
  const applyTemplate = (t: SurveyTemplate) => {
    setPrompt(buildTemplatePrompt(t))
    setError(null)
    requestAnimationFrame(() => {
      const el = document.getElementById('prompt') as HTMLTextAreaElement | null
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.focus()
      }
    })
    toast.success(`Loaded the "${t.title}" template — review and generate.`)
  }
  
  // Save model preference when it changes
  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    localStorage.setItem('ai-survey-selected-model', model);
  };

  const examplePrompts = [
    "Create a customer satisfaction survey for a restaurant",
    "Build a market research survey for a new mobile app",
    "Design a employee feedback survey for remote work",
    "Make a survey about climate change awareness",
    "Create a product feedback survey for an e-commerce website",
    "Build a survey about social media usage habits"
  ]

  const validateSurveyResponse = (data: any): { isValid: boolean; errors: string[]; survey: GeneratedSurvey | null } => {
    const errors: string[] = []
    
    // Check if survey object exists
    if (!data || !data.survey) {
      errors.push('No survey data received from AI')
      return { isValid: false, errors, survey: null }
    }

    const survey = data.survey

    // Validate title
    if (!survey.title || typeof survey.title !== 'string' || survey.title.trim().length === 0) {
      errors.push('Survey title is missing or empty')
    }

    // Validate description
    if (!survey.description || typeof survey.description !== 'string' || survey.description.trim().length === 0) {
      errors.push('Survey description is missing or empty')
    }

    // Validate questions array
    if (!Array.isArray(survey.questions)) {
      errors.push('Questions array is missing')
      return { isValid: false, errors, survey: null }
    }

    if (survey.questions.length === 0) {
      errors.push('No questions were generated')
      return { isValid: false, errors, survey: null }
    }

    // Validate each question
    const invalidQuestions: number[] = []
    survey.questions.forEach((q: any, index: number) => {
      const questionErrors: string[] = []
      
      if (!q.prompt || typeof q.prompt !== 'string' || q.prompt.trim().length === 0) {
        questionErrors.push('missing prompt')
      }
      
      if (!q.type || !['text', 'single-choice', 'multiple-choice', 'rating', 'yes-no'].includes(q.type)) {
        questionErrors.push('invalid or missing type')
      }
      
      if ((q.type === 'single-choice' || q.type === 'multiple-choice') && (!Array.isArray(q.options) || q.options.length === 0)) {
        questionErrors.push('missing options')
      }
      
      if (questionErrors.length > 0) {
        invalidQuestions.push(index + 1)
        errors.push(`Question ${index + 1}: ${questionErrors.join(', ')}`)
      }
    })

    // If there are errors but some questions are valid, it's a partial success
    const hasValidQuestions = survey.questions.some((q: any) => 
      q.prompt && q.prompt.trim().length > 0 && q.type
    )

    return {
      isValid: errors.length === 0,
      errors,
      survey: hasValidQuestions ? survey : null
    }
  }

  const sanitizeSurvey = (survey: any): GeneratedSurvey => {
    // Provide fallback values for incomplete data
    return {
      title: survey.title?.trim() || 'Untitled Survey',
      description: survey.description?.trim() || 'Please add a description for your survey.',
      questions: (survey.questions || [])
        .filter((q: any) => q.prompt && q.prompt.trim().length > 0) // Remove completely invalid questions
        .map((q: any) => ({
          type: ['text', 'single-choice', 'multiple-choice', 'rating', 'yes-no'].includes(q.type) ? q.type : 'text',
          prompt: q.prompt?.trim() || 'Question text missing',
          options: (q.type === 'single-choice' || q.type === 'multiple-choice') 
            ? (Array.isArray(q.options) && q.options.length > 0 ? q.options : ['Option 1', 'Option 2', 'Option 3'])
            : undefined,
          isRequired: typeof q.isRequired === 'boolean' ? q.isRequired : false,
          reasoning: q.reasoning || undefined
        })),
      targetAudience: survey.targetAudience,
      purpose: survey.purpose
    }
  }

  const generateSurvey = async () => {
    if (!prompt.trim()) {
      setError('Please enter a description for your survey')
      return
    }

    // Check if prompt is too short
    if (prompt.trim().length < 10) {
      setError('Please provide a more detailed description (at least 10 characters). Example: "Create a customer satisfaction survey for a restaurant with questions about food quality, service, and ambiance."')
      return
    }

    setIsGenerating(true)
    setError(null)

    try {
      const controller = new AbortController()
      const isSlowModel = selectedModel.includes('gpt-5') || selectedModel.includes('o1') || selectedModel.includes('o3') || selectedModel.includes('o4')
      const timeoutMs = isSlowModel ? 300_000 : 120_000
      const timeoutId = window.setTimeout(() => {
        controller.abort(new Error(`Request timeout after ${timeoutMs / 1000} seconds`))
      }, timeoutMs)
      const token = localStorage.getItem('token')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      // Avoid sending `Authorization: Bearer null` in production (we primarily auth via NextAuth cookies).
      if (token) headers.Authorization = `Bearer ${token}`
      const response = await fetch('/api/ai/generate-survey', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ prompt, model: selectedModel }),
        signal: controller.signal
      })
      window.clearTimeout(timeoutId)

      if (response.ok) {
        const data = await response.json()
        
        // Handle edge case where reasoning models return empty content
        if (data.status && !data.survey && data.surveyRaw !== undefined) {
          setError(
            '⚠️ AI model returned empty or unparseable content.\n\n' +
            'This can happen with reasoning models. Please:\n' +
            '• Try again with the same prompt\n' +
            '• Switch to gpt-4o or gpt-4o-mini\n' +
            '• Make your prompt more specific'
          )
          return
        }
        
        // Validate the response
        const validation = validateSurveyResponse(data)
        
        if (!validation.isValid && !validation.survey) {
          // Complete failure - no usable data
          console.error('Survey validation errors:', validation.errors)
          setError(
            `AI generated incomplete survey data. Please try:\n` +
            `• Making your prompt more specific and detailed\n` +
            `• Including what topics you want to cover\n` +
            `• Specifying the survey purpose\n\n` +
            `Errors found:\n${validation.errors.slice(0, 3).map(e => `• ${e}`).join('\n')}`
          )
          return
        }

        if (!validation.isValid && validation.survey) {
          // Partial success - some data is usable but incomplete
          console.warn('Survey validation warnings:', validation.errors)
          
          // Sanitize and use the partial data
          const sanitizedSurvey = sanitizeSurvey(validation.survey)
          
          setGeneratedSurvey(sanitizedSurvey)
          setEditableTitle(sanitizedSurvey.title)
          setEditableDescription(sanitizedSurvey.description)
          setEditableQuestions(sanitizedSurvey.questions)
          setQuestionSectionIdByIndex(sanitizedSurvey.questions.map(() => null))
          setQuestionMedia(sanitizedSurvey.questions.map((q: any) => ({ 
            media: undefined, 
            optionMedia: (q.options || []).map(() => null) 
          })))
          setModelUsed(data.modelUsed)
          void persistGeneratedDraft(sanitizedSurvey)

          // Show warning about incomplete data
          setError(
            `⚠️ Survey generated with warnings:\n${validation.errors.slice(0, 3).map(e => `• ${e}`).join('\n')}\n\n` +
            `The survey has been created with default values where data was missing. Please review and edit as needed.`
          )
        } else {
          // Complete success
          const sanitizedSurvey = sanitizeSurvey(data.survey)
          
          setGeneratedSurvey(sanitizedSurvey)
          setEditableTitle(sanitizedSurvey.title)
          setEditableDescription(sanitizedSurvey.description)
          setEditableQuestions(sanitizedSurvey.questions)
          setQuestionSectionIdByIndex(sanitizedSurvey.questions.map(() => null))
          setQuestionMedia(sanitizedSurvey.questions.map((q: any) => ({
            media: undefined,
            optionMedia: (q.options || []).map(() => null)
          })))
          setModelUsed(data.modelUsed)
          void persistGeneratedDraft(sanitizedSurvey)
        }
      } else {
        let errorData: { message?: string; error?: string } = {}
        try {
          errorData = await response.json()
        } catch {
          // non-JSON error body
        }
        const serverMsg = (errorData.message || errorData.error || '').trim()

        if (response.status === 429) {
          setError(
            serverMsg ||
              '⚠️ Rate limit reached. The AI service is temporarily limiting requests.\n\nPlease wait 30 seconds and try again, or switch to a different model.'
          )
        } else if (response.status === 503 || response.status === 504) {
          setError(
            serverMsg ||
              '⚠️ AI service temporarily unavailable or timed out.\n\nThis usually resolves quickly. Please:\n• Wait a moment and try again\n• Or switch to gpt-4o-mini for faster responses'
          )
        } else if (response.status >= 500) {
          setError(
            serverMsg ||
              '⚠️ AI service error. The provider is experiencing issues.\n\nPlease try again in a few moments.'
          )
        } else {
          setError(serverMsg || 'Failed to generate survey. Please try again with a more detailed prompt.')
        }
      }
    } catch (error: any) {
      console.error('Error generating survey:', error)
      
      // Check if it's an abort/timeout error
      if (error.name === 'AbortError') {
        setError(
          '⏱️ Request timed out after 35 seconds.\n\n' +
          'The AI is taking longer than expected. Please:\n' +
          '• Try again (it may work on retry)\n' +
          '• Switch to gpt-4o-mini for faster generation\n' +
          '• Simplify your prompt slightly'
        )
      } else {
        setError(
          '❌ Network or connection error.\n\n' +
          'Please check your internet connection and try again.'
        )
      }
    } finally {
      setIsGenerating(false)
    }
  }

  const updateQuestion = (index: number, field: keyof GeneratedQuestion, value: any) => {
    const updated = [...editableQuestions]
    updated[index] = { ...updated[index], [field]: value }
    setEditableQuestions(updated)
  }

  const removeQuestion = (index: number) => {
    setEditableQuestions(editableQuestions.filter((_, i) => i !== index))
    setQuestionMedia(prev => prev.filter((_, i) => i !== index))
  }

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const newQuestions = [...editableQuestions]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    
    if (targetIndex < 0 || targetIndex >= newQuestions.length) return
    
    // Swap questions
    [newQuestions[index], newQuestions[targetIndex]] = [newQuestions[targetIndex], newQuestions[index]]
    
    setEditableQuestions(newQuestions)
    setQuestionMedia(prev => {
      const arr = [...prev]
      ;[arr[index], arr[targetIndex]] = [arr[targetIndex], arr[index]]
      return arr
    })
  }

  const addNewQuestion = () => {
    const newQuestion: GeneratedQuestion = {
      type: 'text',
      prompt: '',
      isRequired: false,
      reasoning: 'Manually added question'
    }
    setEditableQuestions([...editableQuestions, newQuestion])
    setQuestionMedia(prev => [...prev, { media: undefined, optionMedia: [] }])
    setQuestionSectionIdByIndex(prev => [...prev, sections[0]?.id || null])
  }

  const duplicateQuestion = (index: number) => {
    const questionToDuplicate = editableQuestions[index]
    const duplicatedQuestion: GeneratedQuestion = {
      ...questionToDuplicate,
      prompt: `${questionToDuplicate.prompt} (Copy)`,
      reasoning: 'Duplicated from existing question'
    }
    const newQuestions = [...editableQuestions]
    newQuestions.splice(index + 1, 0, duplicatedQuestion)
    setEditableQuestions(newQuestions)
  }

  const moveQuestionToPosition = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    
    const newQuestions = [...editableQuestions]
    const [movedQuestion] = newQuestions.splice(fromIndex, 1)
    newQuestions.splice(toIndex, 0, movedQuestion)
    
    setEditableQuestions(newQuestions)
    
    // Also move the media attachments
    setQuestionMedia(prev => {
      const arr = [...prev]
      const [movedMedia] = arr.splice(fromIndex, 1)
      arr.splice(toIndex, 0, movedMedia)
      return arr
    })
    
    // Also move section assignments
    setQuestionSectionIdByIndex(prev => {
      const arr = [...prev]
      const [movedSection] = arr.splice(fromIndex, 1)
      arr.splice(toIndex, 0, movedSection)
      return arr
    })
  }

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    // Add a slight transparency to the dragged element
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
    // Only clear if we're leaving the card entirely
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
    const updated = [...editableQuestions]
    const question = updated[questionIndex]
    question.options = [...(question.options || []), '']
    setEditableQuestions(updated)
    setQuestionMedia(prev => {
      const arr = [...prev]
      const qm = arr[questionIndex] || { media: undefined, optionMedia: [] }
      qm.optionMedia = [...(qm.optionMedia || []), null]
      arr[questionIndex] = qm
      return arr
    })
  }

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    const updated = [...editableQuestions]
    const question = updated[questionIndex]
    if (question.options) {
      question.options[optionIndex] = value
    }
    setEditableQuestions(updated)
  }

  const removeOption = (questionIndex: number, optionIndex: number) => {
    const updated = [...editableQuestions]
    const question = updated[questionIndex]
    if (question.options) {
      question.options = question.options.filter((_, i) => i !== optionIndex)
    }
    setEditableQuestions(updated)
    setQuestionMedia(prev => {
      const arr = [...prev]
      const qm = arr[questionIndex]
      if (qm?.optionMedia) {
        qm.optionMedia = qm.optionMedia.filter((_, i)=> i !== optionIndex)
      }
      return arr
    })
  }

  // Auto-persist the freshly generated survey as a draft so it immediately
  // appears in the Surveys list. POSTs on first generation; PUTs (updates the
  // same draft) on re-generation. Best-effort — failures fall back to the
  // explicit Save button.
  const persistGeneratedDraft = async (survey: GeneratedSurvey) => {
    try {
      const token = localStorage.getItem('token')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      const body = {
        title: survey.title?.trim() || 'Untitled survey',
        description: survey.description || '',
        isPublic,
        accessPassword: isPublic ? null : (accessPassword || undefined),
        anonymityLevel,
        demographicsRequired,
        startAt: null,
        endAt: null,
        autoPublish: false,
        questions: survey.questions.map((q, index) => ({
          type: q.type,
          prompt: q.prompt,
          options: q.options,
          isRequired: q.isRequired,
          order: index + 1,
        })),
        source: 'native',
        sourceMetadata: {
          media: {
            cover: coverMedia,
            questions: survey.questions.map((q: any) => ({
              media: undefined,
              optionMedia: (q.options || []).map(() => null),
            })),
          },
          settings: { presentation: { mode: presentationMode, sections: [] } },
        },
      }

      const isUpdate = savedSurveyId != null
      const res = await fetch(isUpdate ? `/api/surveys/${savedSurveyId}` : '/api/surveys', {
        method: isUpdate ? 'PUT' : 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (!res.ok) return
      const data = await res.json().catch(() => ({} as any))
      if (!isUpdate && data?.id) setSavedSurveyId(data.id)
      setAutoSaved(true)
      toast.success('Saved to your Surveys as a draft.')
    } catch {
      // Best-effort; explicit Save remains the fallback.
    }
  }

  const saveSurvey = async () => {
    if (!editableTitle.trim()) {
      setError('Survey title is required')
      return
    }

    if (editableQuestions.length === 0) {
      setError('At least one question is required')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const questionsToSave = editableQuestions.map((q, index) => ({
        type: q.type,
        prompt: q.prompt,
        options: q.options,
        isRequired: q.isRequired,
        order: index + 1
      }));

      const token = localStorage.getItem('token')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      // If the survey was already auto-saved as a draft, update it (PUT) so we
      // don't create a duplicate; otherwise create it (POST).
      const isUpdate = savedSurveyId != null
      const response = await fetch(isUpdate ? `/api/surveys/${savedSurveyId}` : '/api/surveys', {
        method: isUpdate ? 'PUT' : 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          title: editableTitle,
          description: editableDescription,
          isPublic,
          accessPassword: isPublic ? null : (accessPassword || undefined),
          anonymityLevel,
          demographicsRequired,
          startAt: startAt || null,
          endAt: endAt || null,
          autoPublish,
          questions: questionsToSave,
          source: 'native',
          sourceMetadata: {
            media: { cover: coverMedia, questions: questionMedia },
            settings: {
              presentation: {
                mode: presentationMode,
                sections: presentationMode === 'sections' ? (()=>{
                  const map: Record<string, number[]> = {}
                  editableQuestions.forEach((_, idx)=>{
                    const secId = questionSectionIdByIndex[idx]
                    if (!secId) return
                    map[secId] = map[secId] || []
                    map[secId].push(idx+1)
                  })
                  return sections.map(s=> ({ title: s.title || 'Section', questionOrders: map[s.id] || [] }))
                })() : []
              }
            }
          }
        })
      })

      if (response.ok) {
        const data = await response.json()
        const id = isUpdate ? savedSurveyId : data.id
        router.push(`/surveys/${id}/edit`)
      } else {
        const errorData = await response.json()
        setError(errorData.message || 'Failed to save survey')
      }
    } catch (error) {
      console.error('Error saving survey:', error)
      setError('Failed to save survey')
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

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        {/* Header */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <h1 className="text-base font-medium text-card-foreground">AI Survey Builder</h1>
              <Badge className="ml-3" variant="secondary">
                <Sparkles className="h-3 w-3 mr-1" />
                AI Powered
              </Badge>
            </div>
            <Button variant="outline" onClick={() => router.push('/create')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Create
            </Button>
          </div>
        </div>
        
        <div className="border-b border-border" />

        <div className="p-6 space-y-6 max-w-5xl mx-auto w-full">
          {/* Hero */}
          <div className="flex flex-col gap-4 rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.07] via-primary/[0.03] to-transparent p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
                <Brain className="h-6 w-6 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold tracking-tight">AI-Powered Survey Generation</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Describe your goal and the AI drafts a methodologically sound survey — clear, unbiased questions
                  with a balanced mix of types. Review, edit, and reorder everything before saving.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pl-16">
              {[
                { icon: Target, label: '10–15 questions by default' },
                { icon: MessageSquare, label: 'Mixed question types' },
                { icon: Shield, label: 'Neutral, unbiased wording' },
                { icon: Edit3, label: 'Fully editable' },
              ].map(({ icon: Icon, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground">
                  <Icon className="h-3.5 w-3.5 text-primary" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Start from a Template */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Wand2 className="h-5 w-5 text-primary" />
                    Start from a Template
                  </CardTitle>
                  <CardDescription className="mt-1.5">
                    Pick a pre-built political survey template to pre-fill the prompt below — then review and generate. Or describe your own survey from scratch.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 gap-1 text-muted-foreground"
                  onClick={() => setTemplatesCollapsed((v) => !v)}
                  aria-expanded={!templatesCollapsed}
                >
                  {templatesCollapsed ? <><ChevronDown className="h-4 w-4" /> Show</> : <><ChevronUp className="h-4 w-4" /> Hide</>}
                </Button>
              </div>
            </CardHeader>
            {!templatesCollapsed && (
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {POLITICAL_SURVEY_TEMPLATES.map((t) => (
                  <div key={t.id} className="flex flex-col rounded-lg border border-border p-4 transition hover:border-primary/40 hover:shadow-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="capitalize">{t.category}</Badge>
                      <span className="text-xs text-muted-foreground">{t.estimatedTime}</span>
                    </div>
                    <h3 className="mt-2 font-semibold leading-tight">{t.title}</h3>
                    <p className="mt-1 flex-1 text-sm text-muted-foreground">{t.description}</p>
                    <p className="mt-3 text-xs font-medium text-muted-foreground">{t.questions.length} questions</p>
                    <Button type="button" className="mt-3 w-full" onClick={() => applyTemplate(t)}>
                      Use template
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
            )}
          </Card>

          {/* Privacy & Anonymity — configured upfront, before generating */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Privacy &amp; Anonymity
              </CardTitle>
              <CardDescription>
                Choose what to collect and who can respond. These settings apply to the survey you generate below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="anonymityLevel">Anonymity Level</Label>
                <Select
                  value={anonymityLevel}
                  onValueChange={(value: AnonymityLevel) => setAnonymityLevel(value)}
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

              {prompt.trim().length > 20 && (
                <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Brain className="h-4 w-4 text-blue-600 mt-0.5" />
                    <div className="text-xs text-blue-700 dark:text-blue-300">
                      <p className="font-medium mb-1">AI Recommendation</p>
                      <p>
                        Based on your description, we recommend the <strong>
                          {getRecommendedAnonymityLevel(prompt, '')}
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

              {/* Public vs private link */}
              <div className="rounded-lg border border-border p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label>Link visibility</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isPublic
                        ? 'Anyone with the link can take the survey.'
                        : 'Only people with the link and the password can respond — good for an internal group, organization, or a specific research wave.'}
                    </p>
                  </div>
                  <div className="inline-flex shrink-0 rounded-md border border-input p-0.5">
                    <button
                      type="button"
                      onClick={() => setIsPublic(true)}
                      className={`rounded px-3 py-1.5 text-sm font-medium transition ${isPublic ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Public
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsPublic(false)}
                      className={`rounded px-3 py-1.5 text-sm font-medium transition ${!isPublic ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Private
                    </button>
                  </div>
                </div>
                {!isPublic && (
                  <div>
                    <Label htmlFor="accessPassword">Link password</Label>
                    <Input
                      id="accessPassword"
                      type="text"
                      value={accessPassword}
                      onChange={(e) => setAccessPassword(e.target.value)}
                      placeholder="Set a password respondents must enter"
                      className="mt-1 max-w-sm"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Respondents must enter this password before they can take the survey.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Prompt Input — primary action */}
          <Card className="border-2 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Describe your survey
              </CardTitle>
              <CardDescription>
                Be specific about the topic, audience, and purpose. Mention a number or exact questions to override the default.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label htmlFor="prompt" className="sr-only">Survey description</Label>
                <Textarea
                  id="prompt"
                  placeholder="e.g. Create a customer satisfaction survey for a coffee shop covering service speed, product quality, atmosphere, and likelihood to recommend — for customers aged 18–45."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="min-h-[140px] resize-y text-base"
                />
              </div>

              {/* Example prompts */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Need a starting point?</p>
                <div className="flex flex-wrap gap-2">
                  {examplePrompts.map((example, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setPrompt(example)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-foreground transition hover:border-primary/40 hover:bg-primary/5"
                    >
                      <Lightbulb className="h-3 w-3 text-primary" />
                      <span>{example}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Model + generate row */}
              <div className="flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="w-full sm:max-w-xs">
                  <Label htmlFor="model" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                    <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                    AI model
                  </Label>
                  <Select value={selectedModel} onValueChange={handleModelChange}>
                    <SelectTrigger id="model">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>OpenAI · GPT</SelectLabel>
                        {SURVEY_MODELS.filter((m) => m.provider === 'OpenAI').map((m) => (
                          <SelectItem key={m.key} value={m.key}>
                            <div className="flex items-center gap-2">
                              <span>{m.label}</span>
                              {m.recommended && <Badge variant="secondary" className="text-[10px]">Recommended</Badge>}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Anthropic · Claude</SelectLabel>
                        {SURVEY_MODELS.filter((m) => m.provider === 'Anthropic').map((m) => (
                          <SelectItem key={m.key} value={m.key}>
                            <div className="flex items-center gap-2">
                              <span>{m.label}</span>
                              {m.recommended && <Badge variant="secondary" className="text-[10px]">Recommended</Badge>}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {SURVEY_MODELS.find((m) => m.key === selectedModel)?.blurb || 'Latest GPT and Claude models'}
                  </p>
                </div>

                <Button
                  type="button"
                  size="lg"
                  onClick={() => void generateSurvey()}
                  disabled={isGenerating || !prompt.trim()}
                  className="w-full sm:w-auto"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4 mr-2" />
                      Generate Survey
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>


          {/* Advanced setup (cover + presentation) — collapsed by default */}
          <details className="group rounded-lg border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-medium text-card-foreground [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-muted-foreground" />
                Advanced setup — cover image &amp; presentation
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-6 border-t border-border p-5">
              {/* Cover media */}
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-semibold">Cover media</h4>
                  <p className="text-xs text-muted-foreground">Shown in listings and at the top of your survey.</p>
                </div>
                <div className="flex items-start gap-4">
                  <img src={coverMedia?.url || '/assets/images/placeholder-survey.svg'} alt={coverMedia?.alt || 'Cover'} className="h-24 w-24 rounded object-cover ring-1 ring-border" />
                  <div className="space-y-2">
                    <div>
                      <Label>Alt text</Label>
                      <Input value={coverMedia?.alt || ''} onChange={e=>setCoverMedia(prev=>({ ...(prev||{url:'/assets/images/placeholder-survey.svg',type:'image',alt:''}), alt: e.target.value }))} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={async ()=>{
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/png,image/jpeg,image/webp,image/gif';
                        input.onchange = async ()=>{
                          const file = input.files?.[0];
                          if (!file) return;
                          const fd = new FormData();
                          fd.append('file', file);
                          const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
                          const data = await res.json();
                          if (data.status) setCoverMedia({ url: data.url, alt: coverMedia?.alt || '', type: 'image' });
                        }
                        input.click();
                      }}>Upload image</Button>
                      <Button type="button" variant="ghost" size="sm" onClick={()=>setCoverMedia({ url: '/assets/images/placeholder-survey.svg', alt: 'Placeholder cover', type: 'image' })}>Reset</Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Presentation settings */}
              <div className="space-y-3 border-t border-border pt-5">
                <div>
                  <h4 className="text-sm font-semibold">Presentation</h4>
                  <p className="text-xs text-muted-foreground">Choose how questions are presented to respondents.</p>
                </div>
                <div className="max-w-xs">
                  <Label>Mode</Label>
                  <select value={presentationMode} onChange={e=>setPresentationMode(e.target.value as any)} className="w-full mt-1 px-3 py-2 border border-input bg-background rounded-md text-sm">
                    <option value="all_at_once">All questions at once</option>
                    <option value="one_by_one">One question at a time</option>
                    <option value="sections">Sections</option>
                  </select>
                </div>
                {presentationMode === 'sections' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Sections</Label>
                      <Button type="button" size="sm" variant="outline" onClick={()=> setSections(prev=> [...prev, { id: `${Date.now()}_${Math.random().toString(36).slice(2,6)}`, title: `Section ${prev.length+1}` }])}>+ Add Section</Button>
                    </div>
                    <div className="space-y-2">
                      {sections.length === 0 && (
                        <p className="text-sm text-muted-foreground">No sections yet. Click &quot;+ Add Section&quot; to create one, then assign questions.</p>
                      )}
                      {sections.map((s, si)=>(
                        <div key={s.id} className="flex items-center gap-2">
                          <Input value={s.title} onChange={e=> setSections(prev=> prev.map((sec, idx)=> idx===si ? ({ ...sec, title: e.target.value }) : sec))} className="flex-1" />
                          <Button type="button" variant="ghost" size="sm" onClick={()=> setSections(prev=> prev.filter((_, idx)=> idx!==si))}>Remove</Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </details>

          {/* Error Display */}
          {error && (
            <Card className="border-destructive">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">{error}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Generated Survey */}
          {generatedSurvey && (
            <>
              {/* Survey Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Edit3 className="h-5 w-5" />
                    Survey Details
                    {modelUsed && (
                      <Badge variant="secondary" className="ml-auto">
                        <Cpu className="h-3 w-3 mr-1" />
                        Generated by {modelUsed}
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Review and edit the AI-generated survey details
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="title">Survey Title</Label>
                    <Input
                      id="title"
                      value={editableTitle}
                      onChange={(e) => setEditableTitle(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={editableDescription}
                      onChange={(e) => setEditableDescription(e.target.value)}
                      className="mt-1"
                      rows={3}
                    />
                  </div>


                  {generatedSurvey.purpose && (
                    <div className="p-3 bg-muted rounded-lg">
                      <Label className="text-sm font-medium">AI Analysis:</Label>
                      <p className="text-sm text-muted-foreground mt-1">{generatedSurvey.purpose}</p>
                    </div>
                  )}

                  {/* Scheduling Section */}
                  <div className="border-t pt-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Calendar className="h-4 w-4" />
                      <Label className="text-sm font-medium">Schedule Survey</Label>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="startAt">Start Date & Time</Label>
                        <input
                          id="startAt"
                          type="datetime-local"
                          value={startAt}
                          onChange={(e) => setStartAt(e.target.value)}
                          className="mt-1 w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          When should this survey become available?
                        </p>
                      </div>
                      
                      <div>
                        <Label htmlFor="endAt">End Date & Time</Label>
                        <input
                          id="endAt"
                          type="datetime-local"
                          value={endAt}
                          onChange={(e) => setEndAt(e.target.value)}
                          className="mt-1 w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          When should this survey automatically close?
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 mt-4">
                      <Checkbox
                        id="autoPublish"
                        checked={autoPublish}
                        onCheckedChange={(checked) => setAutoPublish(checked as boolean)}
                      />
                      <Label htmlFor="autoPublish" className="text-sm">
                        Auto-publish at start time
                      </Label>
                      <p className="text-xs text-muted-foreground ml-2">
                        (Survey will automatically become active at the start time)
                      </p>
                    </div>

                    {/* Schedule Preview */}
                    {(startAt || endAt) && (
                      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="h-4 w-4 text-blue-600" />
                          <Label className="text-sm font-medium text-blue-700 dark:text-blue-300">Schedule Preview</Label>
                        </div>
                        <div className="text-sm text-blue-600 dark:text-blue-400 space-y-1">
                          {startAt && (
                            <p>• Survey will {autoPublish ? 'automatically become active' : 'be available to publish'} on {new Date(startAt).toLocaleString()}</p>
                          )}
                          {endAt && (
                            <p>• Survey will automatically close on {new Date(endAt).toLocaleString()}</p>
                          )}
                          {!startAt && !endAt && (
                            <p>• No scheduling configured - survey will be created as draft</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Generated Questions */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Target className="h-5 w-5" />
                        Survey Questions
                      </CardTitle>
                      <CardDescription>
                        Edit, reorder, and add questions. Use the controls to restructure your survey.
                      </CardDescription>
                    </div>
                    <Button onClick={addNewQuestion} variant="outline">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Question
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {editableQuestions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground space-y-4">
                      <Target className="h-12 w-12 mx-auto opacity-50" />
                      <p>No questions yet. Run AI generation again or add questions manually.</p>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void generateSurvey()}
                        disabled={isGenerating || !prompt.trim()}
                      >
                        <Wand2 className="h-4 w-4 mr-2" />
                        Generate Survey with AI
                      </Button>
                      {!prompt.trim() ? (
                        <p className="text-xs max-w-sm mx-auto">Enter a survey description in the box above, then click here or the main generate button.</p>
                      ) : null}
                    </div>
                  ) : (
                    editableQuestions.map((question, questionIndex) => (
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
                              {question.isRequired && (
                                <Badge variant="secondary" className="text-xs">Required</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
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
                                disabled={questionIndex === editableQuestions.length - 1}
                                className="h-8 w-8 p-0"
                                title="Move down"
                              >
                                <ChevronDown className="h-4 w-4" />
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
                            {presentationMode === 'sections' && (
                              <div>
                                <Label>Section</Label>
                                <select value={questionSectionIdByIndex[questionIndex] || ''} onChange={e=>{
                                  const val = e.target.value || null
                                  setQuestionSectionIdByIndex(prev=> prev.map((id, idx)=> idx===questionIndex ? val : id))
                                }} className="w-full mt-1 px-3 py-2 border border-input bg-background rounded-md">
                                  <option value="">Unassigned</option>
                                  {sections.map(s=>(<option key={s.id} value={s.id}>{s.title}</option>))}
                                </select>
                              </div>
                            )}
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
                              className="mt-1"
                              rows={2}
                              placeholder="Enter your question here..."
                            />
                          </div>

                          {question.reasoning && (
                            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                              <Label className="text-xs font-medium text-blue-700 dark:text-blue-300">AI Reasoning:</Label>
                              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">{question.reasoning}</p>
                            </div>
                          )}

                          {(question.type === 'single-choice' || question.type === 'multiple-choice') && (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <Label>Options</Label>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => addOption(questionIndex)}
                                >
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
                                    {/* Per-option image upload */}
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      title="Attach image"
                                      onClick={async ()=>{
                                        const input = document.createElement('input');
                                        input.type = 'file';
                                        input.accept = 'image/png,image/jpeg,image/webp,image/gif';
                                        input.onchange = async ()=>{
                                          const file = input.files?.[0];
                                          if (!file) return;
                                          const fd = new FormData(); fd.append('file', file);
                                          const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
                                          const data = await res.json();
                                          if (data.status) {
                                            setQuestionMedia(prev=>{
                                              const arr=[...prev];
                                              const qm = arr[questionIndex] || { media: undefined, optionMedia: [] };
                                              const om = [...(qm.optionMedia||[])];
                                              om[optionIndex] = { url: data.url, alt: '' };
                                              arr[questionIndex] = { ...qm, optionMedia: om };
                                              return arr;
                                            })
                                          }
                                        }
                                        input.click();
                                      }}
                                    >Img</Button>
                                    {questionMedia[questionIndex]?.optionMedia?.[optionIndex]?.url && (
                                      <img src={questionMedia[questionIndex]?.optionMedia?.[optionIndex]?.url || ''} alt="" className="h-8 w-8 rounded object-cover ring-1 ring-border" />
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeOption(questionIndex, optionIndex)}
                                      className="text-red-600 hover:text-red-700"
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                ))}
                                {(!question.options || question.options.length === 0) && (
                                  <p className="text-sm text-muted-foreground">No options added yet. Click &quot;Add Option&quot; to get started.</p>
                                )}
                              </div>
                            </div>
                          )}
                          {/* Per-question media */}
                          <div className="pt-1">
                            <Label>Question Media (optional)</Label>
                            <div className="mt-2 flex items-center gap-2">
                              <img src={questionMedia[questionIndex]?.media?.url || '/assets/images/placeholder-survey.svg'} alt={questionMedia[questionIndex]?.media?.alt || 'Question media'} className="h-12 w-12 rounded object-cover ring-1 ring-border" />
                              <Button type="button" variant="outline" size="sm" onClick={async ()=>{
                                const input = document.createElement('input');
                                input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp,image/gif';
                                input.onchange = async ()=>{
                                  const f = input.files?.[0]; if (!f) return; const fd=new FormData(); fd.append('file',f);
                                  const res = await fetch('/api/media/upload',{method:'POST',body:fd}); const data = await res.json();
                                  if (data.status) {
                                    setQuestionMedia(prev=>{ const arr=[...prev]; const qm=arr[questionIndex]||{media:undefined,optionMedia:[]}; arr[questionIndex]={...qm, media:{ url:data.url, alt:''}}; return arr; })
                                  }
                                };
                                input.click();
                              }}>Upload</Button>
                              <Button type="button" variant="ghost" size="sm" onClick={()=> setQuestionMedia(prev=>{ const arr=[...prev]; const qm=arr[questionIndex]||{media:undefined,optionMedia:[]}; arr[questionIndex]={...qm, media: undefined}; return arr; })}>Remove</Button>
                            </div>
                          </div>
                        </CardContent>
                        )}
                      </Card>
                    ))
                  )}

                  {/* Add Question Button at the bottom */}
                  {editableQuestions.length > 0 && (
                    <Card className="border-dashed border-2 border-muted-foreground/25 hover:border-primary/50 transition-colors">
                      <CardContent className="pt-6">
                        <Button 
                          onClick={addNewQuestion} 
                          variant="ghost" 
                          className="w-full h-16 border-none text-muted-foreground hover:text-primary"
                        >
                          <Plus className="h-6 w-6 mr-2" />
                          Add Another Question
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {/* Inline sections manager when in sections mode */}
                  {presentationMode==='sections' && (
                    <div className="mt-6 border-t pt-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Sections</Label>
                        <Button type="button" size="sm" variant="outline" onClick={()=> setSections(prev=> [...prev, { id: `${Date.now()}_${Math.random().toString(36).slice(2,6)}`, title: `Section ${prev.length+1}` }])}>+ Add Section</Button>
                      </div>
                      {sections.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No sections yet. Add one and use the per-question Section selector to assign.</p>
                      ) : (
                        <div className="space-y-2">
                          {sections.map((s, si)=> (
                            <div key={s.id} className="flex items-center gap-2">
                              <Input value={s.title} onChange={e=> setSections(prev=> prev.map((sec, idx)=> idx===si ? ({ ...sec, title: e.target.value }) : sec))} className="flex-1" />
                              <Button variant="ghost" size="sm" onClick={()=> setSections(prev=> prev.filter((_, idx)=> idx!==si))}>Remove</Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Save Survey */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">Ready to save your survey?</h3>
                      <p className="text-sm text-muted-foreground">
                        This will create a draft survey that you can further edit and publish.
                      </p>
                    </div>
                    <Button onClick={saveSurvey} disabled={isSaving}>
                      {isSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Save & Continue Editing
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AISurveyBuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-muted-foreground">
          Loading AI survey builder…
        </div>
      }
    >
      <AISurveyBuilderPageInner />
    </Suspense>
  )
}