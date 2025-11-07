'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { GPT_MODELS } from '@/app/utils/const'
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
  Info
} from "lucide-react"
import { AnonymityLevel } from '@/app/utils/interface'
import { 
  ANONYMITY_CONFIGURATIONS, 
  getAnonymityLevelDescription, 
  getPrivacyNotice,
  getRecommendedAnonymityLevel 
} from '@/app/utils/anonymity-config'

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

const AISurveyBuilderPage = () => {
  const router = useRouter()
  
  const [prompt, setPrompt] = useState('')
  const [selectedModel, setSelectedModel] = useState('gpt-4o')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedSurvey, setGeneratedSurvey] = useState<GeneratedSurvey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [modelUsed, setModelUsed] = useState<string | null>(null)

  const [editableTitle, setEditableTitle] = useState('')
  const [editableDescription, setEditableDescription] = useState('')
  const [editableQuestions, setEditableQuestions] = useState<GeneratedQuestion[]>([])
  type Media = { url: string; alt: string }
  const [questionMedia, setQuestionMedia] = useState<Array<{ media?: Media; optionMedia?: (Media|null)[] }>>([])

  // Anonymity state
  const [anonymityLevel, setAnonymityLevel] = useState<AnonymityLevel>('full')
  const [demographicsRequired, setDemographicsRequired] = useState(true)

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

  // Load saved model preference on mount
  useEffect(() => {
    const savedModel = localStorage.getItem('ai-survey-selected-model');
    if (savedModel) {
      setSelectedModel(savedModel);
    }
  }, []);
  
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
      const response = await fetch('/api/ai/generate-survey', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ prompt, model: selectedModel })
      })

      if (response.ok) {
        const data = await response.json()
        
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
        }
      } else {
        const errorData = await response.json()
        setError(errorData.message || 'Failed to generate survey. Please try again with a more detailed prompt.')
      }
    } catch (error) {
      console.error('Error generating survey:', error)
      setError(
        'Failed to generate survey. This could be due to:\n' +
        '• Network connection issues\n' +
        '• AI service temporarily unavailable\n' +
        '• Prompt being too vague or complex\n\n' +
        'Please try again with a clear, specific prompt.'
      )
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

      const response = await fetch('/api/surveys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          title: editableTitle,
          description: editableDescription,
          isPublic: true,
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
        router.push(`/surveys/${data.id}/edit`)
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

        <div className="p-6 space-y-6">
          {/* Introduction */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Brain className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-2">AI-Powered Survey Generation</h3>
                  <p className="text-muted-foreground text-sm">
                    Describe what kind of survey you want to create, and our AI will generate relevant questions, 
                    answer options, and survey structure. You can then edit, reorder, and add new questions manually.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cover media */}
          <Card>
            <CardHeader>
              <CardTitle>Cover Media</CardTitle>
              <CardDescription>Shown in listings and at the top of your survey. Replace the placeholder with your own image.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-4">
                <img src={coverMedia?.url || '/assets/images/placeholder-survey.svg'} alt={coverMedia?.alt || 'Cover'} className="h-24 w-24 rounded object-cover ring-1 ring-border" />
                <div className="space-y-2">
                  <div>
                    <Label>Alt text</Label>
                    <Input value={coverMedia?.alt || ''} onChange={e=>setCoverMedia(prev=>({ ...(prev||{url:'/assets/images/placeholder-survey.svg',type:'image',alt:''}), alt: e.target.value }))} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={async ()=>{
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
                    <Button type="button" variant="ghost" onClick={()=>setCoverMedia({ url: '/assets/images/placeholder-survey.svg', alt: 'Placeholder cover', type: 'image' })}>Reset</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Presentation settings */}
          <Card>
            <CardHeader>
              <CardTitle>Presentation</CardTitle>
              <CardDescription>Choose how questions are presented to respondents.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>Mode</Label>
                  <select value={presentationMode} onChange={e=>setPresentationMode(e.target.value as any)} className="w-full mt-1 px-3 py-2 border border-input bg-background rounded-md">
                    <option value="all_at_once">All questions at once</option>
                    <option value="one_by_one">One question at a time</option>
                    <option value="sections">Sections</option>
                  </select>
                </div>
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
            </CardContent>
          </Card>

          {/* Prompt Input */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Describe Your Survey
              </CardTitle>
              <CardDescription>
                Tell the AI what kind of survey you want to create. Be as specific as possible.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="prompt">Survey Description</Label>
                  <Textarea
                    id="prompt"
                    placeholder="Example: Create a customer satisfaction survey for a coffee shop that asks about service quality, product satisfaction, and likelihood to recommend..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="mt-1 min-h-[100px]"
                  />
                </div>
                <div>
                  <Label htmlFor="model">AI Model</Label>
                  <Select value={selectedModel} onValueChange={handleModelChange}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select AI model" />
                    </SelectTrigger>
                    <SelectContent>
                      {GPT_MODELS.map((model) => (
                        <SelectItem key={model.key} value={model.key}>
                          <div className="flex items-center gap-2">
                            <Cpu className="h-3 w-3" />
                            <span>{model.label}</span>
                            <Badge variant="outline" className="text-xs">
                              {model.type}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Choose which AI model to generate your survey
                  </p>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-muted-foreground">Example Prompts:</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                  {examplePrompts.map((example, index) => (
                    <Button
                      key={index}
                      variant="ghost"
                      size="sm"
                      className="justify-start text-left h-auto p-2 text-xs"
                      onClick={() => setPrompt(example)}
                    >
                      <Lightbulb className="h-3 w-3 mr-2 flex-shrink-0" />
                      <span className="truncate">{example}</span>
                    </Button>
                  ))}
                </div>
              </div>

              <Button 
                onClick={generateSurvey} 
                disabled={isGenerating || !prompt.trim()}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating Survey...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Generate Survey with AI
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

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

                  {/* Anonymity Level Section */}
                  <div className="border-t pt-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-primary" />
                      <Label className="text-sm font-medium">Privacy & Anonymity</Label>
                    </div>
                    
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

                    {editableTitle && editableDescription && (
                      <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg">
                        <div className="flex items-start gap-2">
                          <Brain className="h-4 w-4 text-blue-600 mt-0.5" />
                          <div className="text-xs text-blue-700 dark:text-blue-300">
                            <p className="font-medium mb-1">AI Recommendation</p>
                            <p>
                              Based on your survey content, we recommend: <strong>
                                {getRecommendedAnonymityLevel(editableTitle, editableDescription)}
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
                    <div className="text-center py-8 text-muted-foreground">
                      <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No questions yet. Generate with AI or add manually.</p>
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

export default AISurveyBuilderPage 