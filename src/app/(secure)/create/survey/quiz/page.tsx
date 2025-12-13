'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  ArrowLeft, Cpu, MessageSquare, Wand2, Loader2, Edit3, Plus, GripVertical, ChevronUp, ChevronDown, Trash2, Info, Shield
} from 'lucide-react'
import { GPT_MODELS } from '@/app/utils/const'

type QuestionType = 'single-choice' | 'multiple-choice' | 'true-false' | 'text'

interface QuizQuestion {
  type: QuestionType
  prompt: string
  options: string[]
  correctOptionIds: number[]
  explanation?: string
  isRequired: boolean
  points?: number
}

interface GeneratedQuiz {
  title: string
  description: string
  questions: QuizQuestion[]
}

type RevealPolicy = 'per_question' | 'end' | 'delayed'

export default function QuizSurveyBuilderPage() {
  const router = useRouter()

  // AI prompt
  const [prompt, setPrompt] = useState('Create a 10-question quiz to assess product knowledge for onboarding sales reps.')
  const [selectedModel, setSelectedModel] = useState('gpt-4o')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string|null>(null)

  // Generated/editable quiz
  const [quiz, setQuiz] = useState<GeneratedQuiz | null>(null)

  // Settings
  const [revealPolicy, setRevealPolicy] = useState<RevealPolicy>('per_question')
  const [shuffleOptions, setShuffleOptions] = useState(true)
  const [showExplanations, setShowExplanations] = useState(true)
  const [timeLimitPerQuestion, setTimeLimitPerQuestion] = useState<string>('')
  const [coverMedia, setCoverMedia] = useState<{url:string; alt:string} | null>({ url: '/assets/images/placeholder-survey.svg', alt: 'Placeholder cover' })
  const [presentationMode, setPresentationMode] = useState<'all_at_once'|'one_by_one'|'sections'>('all_at_once')
  const [sectionChunkSize, setSectionChunkSize] = useState<number>(5)
  const [sections, setSections] = useState<{ id: string; title: string }[]>([])

  useEffect(() => {
    const savedModel = localStorage.getItem('ai-quiz-selected-model')
    if (savedModel) setSelectedModel(savedModel)
  }, [])

  const handleModelChange = (model: string) => {
    setSelectedModel(model)
    localStorage.setItem('ai-quiz-selected-model', model)
  }

  const generateQuiz = async () => {
    if (!prompt.trim()) return
    setIsGenerating(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch('/api/ai/generate-survey', {
        method: 'POST',
        headers,
        body: JSON.stringify({ prompt, model: selectedModel, mode: 'quiz' })
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.message || 'Failed to generate')
      }
      const data = await res.json()
      // Expect data.survey.questions to include correctOptionIds/explanations
      setQuiz(data.survey as GeneratedQuiz)
    } catch (e:any) {
      setError(e.message || 'Failed to generate')
    } finally {
      setIsGenerating(false)
    }
  }

  const updateQuestion = (index: number, patch: Partial<QuizQuestion>) => {
    if (!quiz) return
    const next = { ...quiz }
    next.questions = next.questions.map((q, i) => i === index ? { ...q, ...patch } : q)
    setQuiz(next)
  }

  const addOption = (qIndex: number) => {
    if (!quiz) return
    const options = [...quiz.questions[qIndex].options, '']
    updateQuestion(qIndex, { options })
  }

  const removeOption = (qIndex: number, optIndex: number) => {
    if (!quiz) return
    const options = quiz.questions[qIndex].options.filter((_, i) => i !== optIndex)
    let correct = quiz.questions[qIndex].correctOptionIds.filter(id => id !== optIndex)
    // reindex correct ids beyond removed index
    correct = correct.map(id => id > optIndex ? id - 1 : id)
    updateQuestion(qIndex, { options, correctOptionIds: correct })
  }

  const toggleCorrect = (qIndex: number, optIndex: number) => {
    if (!quiz) return
    const q = quiz.questions[qIndex]
    const exists = q.correctOptionIds.includes(optIndex)
    const correct = exists ? q.correctOptionIds.filter(i => i !== optIndex) : [...q.correctOptionIds, optIndex]
    updateQuestion(qIndex, { correctOptionIds: correct })
  }

  const addQuestion = () => {
    if (!quiz) return
    const next: QuizQuestion = { type: 'single-choice', prompt: '', options: [], correctOptionIds: [], isRequired: true, points: 1 }
    setQuiz({ ...quiz, questions: [...quiz.questions, next] })
  }

  const moveQuestion = (index: number, dir: 'up'|'down') => {
    if (!quiz) return
    const to = dir === 'up' ? index - 1 : index + 1
    if (to < 0 || to >= quiz.questions.length) return
    const arr = [...quiz.questions]
    ;[arr[index], arr[to]] = [arr[to], arr[index]]
    setQuiz({ ...quiz, questions: arr })
  }

  const deleteQuestion = (index: number) => {
    if (!quiz) return
    setQuiz({ ...quiz, questions: quiz.questions.filter((_, i) => i !== index) })
  }

  const saveQuiz = async () => {
    if (!quiz) return
    const questions = quiz.questions.map((q, i) => ({
      type: q.type === 'true-false' ? 'single-choice' : q.type,
      prompt: q.prompt,
      options: q.options,
      isRequired: q.isRequired,
      order: i + 1,
      // Persist quiz extensions in options metadata for now (backward compatible)
      meta: { correctOptionIds: q.correctOptionIds, explanation: q.explanation, points: q.points ?? 1 }
    }))

    const token = localStorage.getItem('token')
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetch('/api/surveys', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: quiz.title,
        description: quiz.description,
        isPublic: true,
        questions,
        source: 'native',
        sourceMetadata: { type: 'quiz', settings: { revealPolicy, shuffleOptions, showExplanations, timeLimitPerQuestion, presentation: { mode: presentationMode, sections: presentationMode==='sections' ? (()=>{ const orders = questions.map((_,i)=>i+1); const size=Math.max(1,sectionChunkSize); const chunks: Array<{title:string;questionOrders:number[]}>=[]; for(let i=0;i<orders.length;i+=size){ chunks.push({ title:`Section ${chunks.length+1}`, questionOrders: orders.slice(i,i+size) }); } return chunks; })() : [] } }, media: { cover: coverMedia } }
      })
    })
    if (res.ok) {
      const data = await res.json()
      router.push(`/surveys/${data.id}/edit`)
    }
  }

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <h1 className="text-base font-medium text-card-foreground">Quiz Survey Builder</h1>
              <Badge className="ml-3" variant="secondary">Quiz</Badge>
            </div>
            <Button variant="outline" onClick={() => router.push('/create')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Create
            </Button>
          </div>
        </div>
        <div className="border-b border-border" />

        <div className="p-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Describe Your Quiz
              </CardTitle>
              <CardDescription>Tell the AI what topic and difficulty you want. It will generate questions with correct answers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <Label>Quiz Description</Label>
                  <Textarea value={prompt} onChange={e=>setPrompt(e.target.value)} className="mt-1 min-h-[100px]" />
                </div>
                <div>
                  <Label>AI Model</Label>
                  <Select value={selectedModel} onValueChange={handleModelChange}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select AI model" /></SelectTrigger>
                    <SelectContent>
                      {GPT_MODELS.map(m => (
                        <SelectItem key={m.key} value={m.key}>
                          <div className="flex items-center gap-2"><Cpu className="h-3 w-3" /><span>{m.label}</span></div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="w-full" onClick={generateQuiz} disabled={isGenerating || !prompt.trim()}>
                {isGenerating ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating Quiz...</>) : (<><Wand2 className="h-4 w-4 mr-2" />Generate Quiz with AI</>)}
              </Button>
              {error && <Alert><AlertDescription>{error}</AlertDescription></Alert>}
            </CardContent>
          </Card>

          {quiz && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Edit3 className="h-5 w-5" />Quiz Details & Settings</CardTitle>
                  <CardDescription>Configure feedback policy, explanations, and timing.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
              {/* Cover media */}
              <div>
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Title</Label>
                      <Input value={quiz.title} onChange={e=>setQuiz({...quiz, title: e.target.value})} className="mt-1" />
                    </div>
                    <div>
                      <Label>Reveal Policy</Label>
                      <Select value={revealPolicy} onValueChange={(v:RevealPolicy)=>setRevealPolicy(v)}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="per_question">After each question</SelectItem>
                          <SelectItem value="end">At the end</SelectItem>
                          <SelectItem value="delayed">Later (no immediate reveal)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <Label>Description</Label>
                      <Textarea value={quiz.description} onChange={e=>setQuiz({...quiz, description: e.target.value})} rows={3} className="mt-1" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Presentation Mode</Label>
                      <select value={presentationMode} onChange={e=>setPresentationMode(e.target.value as any)} className="w-full mt-1 px-3 py-2 border border-input bg-background rounded-md">
                        <option value="all_at_once">All questions at once</option>
                        <option value="one_by_one">One question at a time</option>
                        <option value="sections">Sections</option>
                      </select>
                    </div>
                  </div>

                  {presentationMode==='sections' && (
                    <div className="space-y-2">
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

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex items-center gap-2 mt-2">
                      <Checkbox checked={shuffleOptions} onCheckedChange={v=>setShuffleOptions(!!v)} />
                      <Label>Shuffle options</Label>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Checkbox checked={showExplanations} onCheckedChange={v=>setShowExplanations(!!v)} />
                      <Label>Show explanations when revealed</Label>
                    </div>
                    <div>
                      <Label>Time limit per question (seconds, optional)</Label>
                      <Input type="number" value={timeLimitPerQuestion} onChange={e=>setTimeLimitPerQuestion(e.target.value)} className="mt-1" />
                    </div>
                  </div>

                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>Correct answers are evaluated server-side. For delayed reveal, participants won’t see correctness until you share results.</AlertDescription>
                  </Alert>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Questions</CardTitle>
                  <CardDescription>Edit questions, mark correct answers, and add explanations.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {quiz.questions.map((q, i) => (
                    <Card key={i} className="border-2">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Question {i+1}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" disabled={i===0} onClick={()=>moveQuestion(i,'up')} className="h-8 w-8 p-0"><ChevronUp className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" disabled={i===quiz.questions.length-1} onClick={()=>moveQuestion(i,'down')} className="h-8 w-8 p-0"><ChevronDown className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" onClick={()=>deleteQuestion(i)} className="h-8 w-8 p-0 text-red-600"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <Label>Type</Label>
                            <select value={q.type} onChange={e=>updateQuestion(i,{ type: e.target.value as QuestionType })} className="w-full mt-1 px-3 py-2 border border-input bg-background rounded-md">
                              <option value="single-choice">Single Choice</option>
                              <option value="multiple-choice">Multiple Choice</option>
                              <option value="true-false">True / False</option>
                              <option value="text">Text (manual grade)</option>
                            </select>
                          </div>
                          {presentationMode==='sections' && (
                            <div>
                              <Label>Section</Label>
                              <select value={(q as any).sectionId || ''} onChange={e=>{
                                const val = e.target.value || undefined
                                setQuiz(prev=>{ if(!prev) return prev; const next={...prev}; (next.questions[i] as any).sectionId = val; return next })
                              }} className="w-full mt-1 px-3 py-2 border border-input bg-background rounded-md">
                                <option value="">Unassigned</option>
                                {sections.map(s=> (<option key={s.id} value={s.id}>{s.title}</option>))}
                              </select>
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-6">
                            <Checkbox checked={q.isRequired} onCheckedChange={v=>updateQuestion(i,{ isRequired: !!v })} />
                            <Label>Required</Label>
                          </div>
                          <div>
                            <Label>Points</Label>
                            <Input type="number" value={q.points ?? 1} onChange={e=>updateQuestion(i,{ points: Number(e.target.value||1) })} className="mt-1" />
                          </div>
                        </div>

                        <div>
                          <Label>Question</Label>
                          <Textarea value={q.prompt} onChange={e=>updateQuestion(i,{ prompt: e.target.value })} className="mt-1" rows={2} />
                        </div>

                        {(q.type === 'single-choice' || q.type === 'multiple-choice' || q.type==='true-false') && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <Label>Options</Label>
                              {q.type !== 'true-false' && (
                                <Button variant="outline" size="sm" onClick={()=>addOption(i)}><Plus className="h-4 w-4 mr-1" />Add Option</Button>
                              )}
                            </div>
                            <div className="space-y-2">
                              {(q.type==='true-false' ? (q.options.length? q.options : ['True','False']) : q.options).map((opt, oi) => (
                                <div key={oi} className="flex items-center gap-2">
                                  <Checkbox checked={q.correctOptionIds.includes(oi)} onCheckedChange={()=>toggleCorrect(i, oi)} />
                                  <Input value={opt} onChange={e=>{
                                    const opts = [...(q.type==='true-false'? (q.options.length? q.options : ['True','False']) : q.options)]
                                    opts[oi] = e.target.value
                                    updateQuestion(i,{ options: opts })
                                  }} className="flex-1" />
                                  {q.type!=='true-false' && (
                                    <Button variant="ghost" size="sm" onClick={()=>removeOption(i, oi)} className="text-red-600">Remove</Button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div>
                          <Label>Explanation (shown when answers are revealed)</Label>
                          <Textarea value={q.explanation || ''} onChange={e=>updateQuestion(i,{ explanation: e.target.value })} rows={2} className="mt-1" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  <Card className="border-dashed border-2 border-muted-foreground/25">
                    <CardContent className="pt-6">
                      <Button onClick={addQuestion} variant="ghost" className="w-full h-16">+ Add Question</Button>
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>

              {presentationMode==='sections' && (
                <Card>
                  <CardContent className="pt-6 space-y-2">
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
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">Save your quiz</h3>
                      <p className="text-sm text-muted-foreground">Creates a draft quiz survey you can edit and publish.</p>
                    </div>
                    <Button onClick={saveQuiz}>Save & Continue Editing</Button>
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


