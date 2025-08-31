'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Plus, 
  Trash2, 
  GripVertical, 
  Users, 
  Eye, 
  Save,
  Wand2,
  ArrowLeft,
  Settings,
  Brain,
  Calendar,
  Clock,
  Shield,
  Info
} from "lucide-react"
import Link from "next/link"
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { AnonymityLevel } from '@/app/utils/interface'
import { 
  ANONYMITY_CONFIGURATIONS, 
  getAnonymityLevelDescription, 
  getPrivacyNotice,
  getRecommendedAnonymityLevel 
} from '@/app/utils/anonymity-config'

interface SurveyQuestion {
  id: string
  type: 'text' | 'single-choice' | 'multiple-choice' | 'rating' | 'yes-no'
  prompt: string
  options?: string[]
  isRequired: boolean
  order: number
  media?: { url: string; alt: string }
  optionMedia?: ({ url: string; alt: string } | null)[]
}

interface Survey {
  title: string
  description: string
  isPublic: boolean
  anonymityLevel: AnonymityLevel
  demographicsRequired: boolean
  questions: SurveyQuestion[]
  startAt?: string
  endAt?: string
  autoPublish?: boolean
  source?: string
  sourceMetadata?: any
}

const CreateSurveyPage = () => {
  const router = useRouter()
  const [survey, setSurvey] = useState<Survey>({
    title: '',
    description: '',
    isPublic: true,
    anonymityLevel: 'full',
    demographicsRequired: true,
    questions: [],
    autoPublish: false
  })
  const [isLoading, setIsLoading] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [coverMedia, setCoverMedia] = useState<{url:string; alt:string} | null>({ url: '/assets/images/placeholder-survey.svg', alt: 'Placeholder cover' })
  const [presentationMode, setPresentationMode] = useState<'all_at_once'|'one_by_one'|'sections'>('all_at_once')
  const [sections, setSections] = useState<Array<{ id: string; title: string }>>([])

  const questionTypes = [
    { value: 'text', label: 'Text Response', description: 'Open-ended text input' },
    { value: 'single-choice', label: 'Single Choice', description: 'Select one option' },
    { value: 'multiple-choice', label: 'Multiple Choice', description: 'Select multiple options' },
    { value: 'rating', label: 'Rating Scale', description: '1-5 or 1-10 scale' },
    { value: 'yes-no', label: 'Yes/No', description: 'Simple binary choice' }
  ]

  const addQuestion = () => {
    const newQuestion: SurveyQuestion = {
      id: `q_${Date.now()}`,
      type: 'text',
      prompt: '',
      options: [],
      isRequired: true,
      order: survey.questions.length + 1,
      // @ts-expect-error sectionId is editor-only
      sectionId: sections[0]?.id || undefined
    }
    setSurvey(prev => ({
      ...prev,
      questions: [...prev.questions, newQuestion]
    }))
  }

  const updateQuestion = (questionId: string, updates: Partial<SurveyQuestion>) => {
    setSurvey(prev => ({
      ...prev,
      questions: prev.questions.map(q => 
        q.id === questionId ? { ...q, ...updates } : q
      )
    }))
  }

  const removeQuestion = (questionId: string) => {
    setSurvey(prev => ({
      ...prev,
      questions: prev.questions.filter(q => q.id !== questionId)
        .map((q, index) => ({ ...q, order: index + 1 }))
    }))
  }

  const addOption = (questionId: string) => {
    updateQuestion(questionId, {
      options: [...(survey.questions.find(q => q.id === questionId)?.options || []), ''],
      optionMedia: [...(survey.questions.find(q => q.id === questionId)?.optionMedia || []), null]
    })
  }

  const updateOption = (questionId: string, optionIndex: number, value: string) => {
    const question = survey.questions.find(q => q.id === questionId)
    if (!question?.options) return
    
    const newOptions = [...question.options]
    newOptions[optionIndex] = value
    updateQuestion(questionId, { options: newOptions })
  }

  const removeOption = (questionId: string, optionIndex: number) => {
    const question = survey.questions.find(q => q.id === questionId)
    if (!question?.options) return
    
    const newOptions = question.options.filter((_, index) => index !== optionIndex)
    const newOptionMedia = (question.optionMedia || []).filter((_, index) => index !== optionIndex)
    updateQuestion(questionId, { options: newOptions, optionMedia: newOptionMedia })
  }

  const saveSurvey = async () => {
    if (!survey.title.trim() || survey.questions.length === 0) {
      alert('Please add a title and at least one question')
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/surveys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          ...survey,
          source: 'native',
          sourceMetadata: { 
            media: { cover: coverMedia },
            settings: {
              presentation: {
                mode: presentationMode,
                sections: presentationMode === 'sections' ? sections.map(s=> ({ title: s.title || 'Section', questionOrders: survey.questions
                  .map((q, idx)=> ({ q, idx }))
                  .filter(({q})=> (q as any).sectionId === s.id)
                  .map(({idx})=> idx+1) })) : []
              }
            }
          }
        })
      })

      if (response.ok) {
        const result = await response.json()
        toast.success('Survey created successfully!')
        router.push('/surveys') // Redirect to surveys dashboard
      } else {
        const error = await response.json()
        toast.error(error.message || 'Failed to create survey')
      }
    } catch (error) {
      toast.error('Failed to create survey')
    } finally {
      setIsLoading(false)
    }
  }

  const generateWithAI = () => {
    // Placeholder for AI-powered survey generation
    alert('AI Survey Generation coming soon! This will help you create surveys automatically based on your research goals.')
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
              <h1 className="text-base font-medium text-card-foreground">Create Survey</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
                <Eye className="h-4 w-4 mr-2" />
                {showPreview ? 'Edit' : 'Preview'}
              </Button>
              <Button onClick={saveSurvey} disabled={isLoading}>
                <Save className="h-4 w-4 mr-2" />
                {isLoading ? 'Saving...' : 'Save Survey'}
              </Button>
            </div>
          </div>
        </div>
        
        <div className="border-b border-border" />

        <div className="p-6">
          {!showPreview ? (
            <>
              {/* Survey Settings */}
              <Card className="mb-6">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    <CardTitle>Survey Settings</CardTitle>
                  </div>
                  <CardDescription>
                    Configure your survey details and digital twin generation
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="title">Survey Title</Label>
                    <Input
                      id="title"
                      placeholder="e.g., Climate Change Opinion Survey"
                      value={survey.title}
                      onChange={(e) => setSurvey(prev => ({ ...prev, title: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Describe what this survey is about and how the data will be used..."
                      value={survey.description}
                      onChange={(e) => setSurvey(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>

                  {/* Cover Media */}
                  <div className="pt-2">
                    <Label>Cover Media</Label>
                    <div className="mt-2 flex items-start gap-3">
                      <img src={coverMedia?.url || '/assets/images/placeholder-survey.svg'} alt={coverMedia?.alt || 'Cover'} className="h-20 w-20 rounded object-cover ring-1 ring-border" />
                      <div className="space-y-2">
                        <Input placeholder="Alt text" value={coverMedia?.alt || ''} onChange={e=>setCoverMedia(prev=>({ ...(prev||{url:'/assets/images/placeholder-survey.svg', alt:''}), alt: e.target.value }))} />
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
                              if (data.status) setCoverMedia({ url: data.url, alt: coverMedia?.alt || '' });
                            }
                            input.click();
                          }}>Upload image</Button>
                          <Button type="button" variant="ghost" onClick={()=>setCoverMedia({ url: '/assets/images/placeholder-survey.svg', alt: 'Placeholder cover' })}>Reset</Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Presentation */}
                  <div className="pt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label>Presentation Mode</Label>
                      <select value={presentationMode} onChange={e=>setPresentationMode(e.target.value as any)} className="w-full mt-1 px-3 py-2 border border-input bg-background rounded-md">
                        <option value="all_at_once">All questions at once</option>
                        <option value="one_by_one">One question at a time</option>
                        <option value="sections">Sections</option>
                      </select>
                    </div>
                  </div>
                  {presentationMode === 'sections' && (
                    <div className="space-y-2 mt-2">
                      <div className="flex items-center justify-between">
                        <Label>Sections</Label>
                        <Button type="button" size="sm" variant="outline" onClick={()=> setSections(prev=> [...prev, { id: `${Date.now()}_${Math.random().toString(36).slice(2,6)}`, title: `Section ${prev.length+1}` }])}>+ Add Section</Button>
                      </div>
                      <div className="space-y-2">
                        {sections.length === 0 && <p className="text-sm text-muted-foreground">No sections yet. Add one and assign questions below.</p>}
                        {sections.map((s, si)=> (
                          <div key={s.id} className="flex items-center gap-2">
                            <Input value={s.title} onChange={e=> setSections(prev=> prev.map((sec, idx)=> idx===si ? ({ ...sec, title: e.target.value }) : sec))} className="flex-1" />
                            <Button variant="ghost" size="sm" onClick={()=> setSections(prev=> prev.filter((_, idx)=> idx!==si))}>Remove</Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Anonymity Level Section */}
                  <div className="border-t pt-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      <h3 className="font-medium">Privacy & Anonymity</h3>
                    </div>
                    
                    <div>
                      <Label htmlFor="anonymityLevel">Anonymity Level</Label>
                      <Select
                        value={survey.anonymityLevel}
                        onValueChange={(value: AnonymityLevel) => setSurvey(prev => ({ ...prev, anonymityLevel: value }))}
                      >
                        <SelectTrigger>
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
                        {getAnonymityLevelDescription(survey.anonymityLevel)}
                      </p>
                    </div>

                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        {getPrivacyNotice(survey.anonymityLevel)}
                      </AlertDescription>
                    </Alert>

                    {survey.title && survey.description && (
                      <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg">
                        <div className="flex items-start gap-2">
                          <Brain className="h-4 w-4 text-blue-600 mt-0.5" />
                          <div className="text-xs text-blue-700 dark:text-blue-300">
                            <p className="font-medium mb-1">AI Recommendation</p>
                            <p>
                              Based on your survey content, we recommend: <strong>
                                {getRecommendedAnonymityLevel(survey.title, survey.description)}
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
                      <Switch
                        id="demographicsRequired"
                        checked={survey.demographicsRequired}
                        onCheckedChange={(checked) => setSurvey(prev => ({ ...prev, demographicsRequired: checked }))}
                        disabled={survey.anonymityLevel === 'anonymous'}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="public">Public Survey</Label>
                      <p className="text-sm text-muted-foreground">Allow anyone with the link to respond</p>
                    </div>
                    <Switch
                      id="public"
                      checked={survey.isPublic}
                      onCheckedChange={(checked) => setSurvey(prev => ({ ...prev, isPublic: checked }))}
                    />
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-900 dark:text-blue-100">Digital Twin Generation</span>
                    </div>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      Each survey response will automatically create a digital twin agent that can be queried for insights. 
                      These agents will have the same capabilities as betting agents in the future.
                    </p>
                  </div>

                  {/* Schedule Section */}
                  <div className="border-t pt-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-primary" />
                      <h3 className="font-medium">Schedule & Expiration</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="startAt">Start Date & Time (Optional)</Label>
                        <Input
                          id="startAt"
                          type="datetime-local"
                          value={survey.startAt || ''}
                          onChange={(e) => setSurvey(prev => ({ ...prev, startAt: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Survey will become active at this time
                        </p>
                      </div>
                      
                      <div>
                        <Label htmlFor="endAt">End Date & Time (Optional)</Label>
                        <Input
                          id="endAt"
                          type="datetime-local"
                          value={survey.endAt || ''}
                          onChange={(e) => setSurvey(prev => ({ ...prev, endAt: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Survey will automatically close at this time
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="autoPublish">Auto-publish when start time arrives</Label>
                        <p className="text-sm text-muted-foreground">
                          Automatically activate the survey at the scheduled start time
                        </p>
                      </div>
                      <Switch
                        id="autoPublish"
                        checked={survey.autoPublish}
                        onCheckedChange={(checked) => setSurvey(prev => ({ ...prev, autoPublish: checked }))}
                      />
                    </div>

                    {(survey.startAt || survey.endAt) && (
                      <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg">
                        <div className="flex items-start gap-2">
                          <Clock className="h-4 w-4 text-blue-600 mt-0.5" />
                          <div className="text-xs text-blue-700 dark:text-blue-300">
                            <p className="font-medium mb-1">Scheduled Survey</p>
                            {survey.startAt && (
                              <p>Starts: {new Date(survey.startAt).toLocaleString()}</p>
                            )}
                            {survey.endAt && (
                              <p>Ends: {new Date(survey.endAt).toLocaleString()}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Questions */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      <CardTitle>Survey Questions</CardTitle>
                      <Badge variant="secondary">{survey.questions.length}</Badge>
                    </div>
                    <Button onClick={addQuestion} size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Question
                    </Button>
                  </div>
                  <CardDescription>
                    Create questions that will help build detailed digital twin profiles
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {survey.questions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No questions yet. Add your first question to get started.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {survey.questions.map((question, index) => (
                        <Card key={question.id} className="border-l-4 border-l-primary/20">
                          <CardContent className="pt-4">
                            <div className="flex items-start gap-4">
                              <div className="flex items-center gap-2 mt-2">
                                <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                                <Badge variant="outline">{index + 1}</Badge>
                              </div>
                              
                              <div className="flex-1 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <Label>Question Type</Label>
                                    <Select
                                      value={question.type}
                                      onValueChange={(value: any) => updateQuestion(question.id, { type: value })}
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {questionTypes.map(type => (
                                          <SelectItem key={type.value} value={type.value}>
                                            <div>
                                              <div className="font-medium">{type.label}</div>
                                              <div className="text-xs text-muted-foreground">{type.description}</div>
                                            </div>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <div className="flex items-center space-x-2">
                                      <Switch
                                        id={`required-${question.id}`}
                                        checked={question.isRequired}
                                        onCheckedChange={(checked) => updateQuestion(question.id, { isRequired: checked })}
                                      />
                                      <Label htmlFor={`required-${question.id}`} className="text-sm">Required</Label>
                                    </div>
                                    {presentationMode === 'sections' && (
                                      <div className="flex items-center gap-2">
                                        <Label className="text-sm">Section</Label>
                                        <select value={(question as any).sectionId || ''} onChange={e=> updateQuestion(question.id, { ...(question as any), sectionId: e.target.value || undefined } as any)} className="px-2 py-1 border border-input bg-background rounded-md">
                                          <option value="">Unassigned</option>
                                          {sections.map(s=> (<option key={s.id} value={s.id}>{s.title}</option>))}
                                        </select>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div>
                                  <Label>Question Prompt</Label>
                                  <Textarea
                                    placeholder="Enter your question here..."
                                    value={question.prompt}
                                    onChange={(e) => updateQuestion(question.id, { prompt: e.target.value })}
                                  />
                                </div>

                                {(question.type === 'single-choice' || question.type === 'multiple-choice') && (
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <Label>Answer Options</Label>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => addOption(question.id)}
                                      >
                                        <Plus className="h-3 w-3 mr-1" />
                                        Add Option
                                      </Button>
                                    </div>
                                    <div className="space-y-2">
                                      {question.options?.map((option, optionIndex) => (
                                        <div key={optionIndex} className="flex items-center gap-2">
                                          <Input
                                            placeholder={`Option ${optionIndex + 1}`}
                                            value={option}
                                            onChange={(e) => updateOption(question.id, optionIndex, e.target.value)}
                                          />
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={async ()=>{
                                              const input = document.createElement('input'); input.type='file'; input.accept='image/png,image/jpeg,image/webp,image/gif';
                                              input.onchange = async ()=>{ const file=input.files?.[0]; if(!file) return; const fd=new FormData(); fd.append('file',file); const res=await fetch('/api/media/upload',{method:'POST',body:fd}); const data=await res.json(); if(data.status){
                                                setSurvey(prev=>({ ...prev, questions: prev.questions.map(q=> q.id===question.id ? ({ ...q, optionMedia: (()=>{ const arr=[...(q.optionMedia||[])]; arr[optionIndex]={ url:data.url, alt:''}; return arr; })() }) : q) }))
                                              }}; input.click();
                                            }}
                                          >Img</Button>
                                          {question.optionMedia?.[optionIndex]?.url && (
                                            <img src={question.optionMedia?.[optionIndex]?.url || ''} alt="" className="h-8 w-8 rounded object-cover ring-1 ring-border" />
                                          )}
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => removeOption(question.id, optionIndex)}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      )) || []}
                                    </div>
                                  </div>
                                )}

                                {question.type === 'rating' && (
                                  <div className="bg-muted/50 p-3 rounded-lg">
                                    <p className="text-sm text-muted-foreground">
                                      Rating questions will automatically use a 1-5 scale with labels (Poor, Fair, Good, Very Good, Excellent)
                                    </p>
                                  </div>
                                )}

                                {question.type === 'yes-no' && (
                                  <div className="bg-muted/50 p-3 rounded-lg">
                                    <p className="text-sm text-muted-foreground">
                                      Yes/No questions will automatically provide Yes and No options
                                    </p>
                                  </div>
                                )}

                                {/* Question media */}
                                <div className="pt-1">
                                  <Label>Question Media (optional)</Label>
                                  <div className="mt-2 flex items-center gap-2">
                                    <img src={question.media?.url || '/assets/images/placeholder-survey.svg'} alt={question.media?.alt || 'Question media'} className="h-12 w-12 rounded object-cover ring-1 ring-border" />
                                    <Button type="button" variant="outline" size="sm" onClick={async ()=>{
                                      const input = document.createElement('input'); input.type='file'; input.accept='image/png,image/jpeg,image/webp,image/gif'; input.onchange = async ()=>{ const f=input.files?.[0]; if(!f) return; const fd=new FormData(); fd.append('file',f); const res=await fetch('/api/media/upload',{method:'POST',body:fd}); const data=await res.json(); if(data.status){ setSurvey(prev=>({ ...prev, questions: prev.questions.map(q=> q.id===question.id ? ({ ...q, media: { url:data.url, alt:'' } }) : q) })) } }; input.click();
                                    }}>Upload</Button>
                                    <Button type="button" variant="ghost" size="sm" onClick={()=> setSurvey(prev=>({ ...prev, questions: prev.questions.map(q=> q.id===question.id ? ({ ...q, media: undefined }) : q) }))}>Remove</Button>
                                  </div>
                                </div>
                              </div>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeQuestion(question.id)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  {/* Inline sections manager */}
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
                </CardContent>
              </Card>
            </>
          ) : (
            /* Preview Mode */
            <Card>
              <CardHeader>
                <CardTitle>Survey Preview</CardTitle>
                <CardDescription>This is how your survey will appear to respondents</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-w-2xl mx-auto space-y-6">
                  <div className="text-center">
                    <h2 className="text-2xl font-bold mb-2">{survey.title || 'Untitled Survey'}</h2>
                    <p className="text-muted-foreground">{survey.description || 'No description provided'}</p>
                  </div>

                  {survey.questions.map((question, index) => (
                    <Card key={question.id}>
                      <CardContent className="pt-4">
                        <div className="mb-3">
                          <Label className="text-base font-medium">
                            {index + 1}. {question.prompt || 'Question prompt'}
                            {question.isRequired && <span className="text-destructive ml-1">*</span>}
                          </Label>
                        </div>

                        {question.type === 'text' && (
                          <Textarea placeholder="Your answer here..." disabled />
                        )}

                        {question.type === 'single-choice' && (
                          <div className="space-y-2">
                            {question.options?.map((option, optionIndex) => (
                              <div key={optionIndex} className="flex items-center space-x-2">
                                <input type="radio" disabled />
                                <Label>{option || `Option ${optionIndex + 1}`}</Label>
                              </div>
                            )) || <p className="text-muted-foreground">No options added</p>}
                          </div>
                        )}

                        {question.type === 'multiple-choice' && (
                          <div className="space-y-2">
                            {question.options?.map((option, optionIndex) => (
                              <div key={optionIndex} className="flex items-center space-x-2">
                                <input type="checkbox" disabled />
                                <Label>{option || `Option ${optionIndex + 1}`}</Label>
                              </div>
                            )) || <p className="text-muted-foreground">No options added</p>}
                          </div>
                        )}

                        {question.type === 'rating' && (
                          <div className="flex items-center space-x-4">
                            {((question.options && question.options.length > 0)
                              ? question.options
                              : ['1','2','3','4','5']
                            ).map((opt, idx) => (
                              <div key={idx} className="flex flex-col items-center">
                                <input type="radio" disabled />
                                <Label className="text-xs mt-1">{typeof opt === 'string' ? opt : String(opt)}</Label>
                              </div>
                            ))}
                          </div>
                        )}

                        {question.type === 'yes-no' && (
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <input type="radio" disabled />
                              <Label>Yes</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <input type="radio" disabled />
                              <Label>No</Label>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}

                  <Button className="w-full" disabled>
                    Submit Survey (Preview Mode)
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export default CreateSurveyPage 