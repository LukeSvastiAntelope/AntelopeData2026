'use client'

import { useState } from 'react'
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
  Trash2
} from "lucide-react"

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

  const examplePrompts = [
    "Create a customer satisfaction survey for a restaurant",
    "Build a market research survey for a new mobile app",
    "Design a employee feedback survey for remote work",
    "Make a survey about climate change awareness",
    "Create a product feedback survey for an e-commerce website",
    "Build a survey about social media usage habits"
  ]

  const generateSurvey = async () => {
    if (!prompt.trim()) {
      setError('Please enter a description for your survey')
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
        setGeneratedSurvey(data.survey)
        setEditableTitle(data.survey.title)
        setEditableDescription(data.survey.description)
        setEditableQuestions(data.survey.questions)
        setModelUsed(data.modelUsed)
      } else {
        const errorData = await response.json()
        setError(errorData.message || 'Failed to generate survey')
      }
    } catch (error) {
      console.error('Error generating survey:', error)
      setError('Failed to generate survey. Please try again.')
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
  }

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const newQuestions = [...editableQuestions]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    
    if (targetIndex < 0 || targetIndex >= newQuestions.length) return
    
    // Swap questions
    [newQuestions[index], newQuestions[targetIndex]] = [newQuestions[targetIndex], newQuestions[index]]
    
    setEditableQuestions(newQuestions)
  }

  const addOption = (questionIndex: number) => {
    const updated = [...editableQuestions]
    const question = updated[questionIndex]
    question.options = [...(question.options || []), '']
    setEditableQuestions(updated)
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
          questions: editableQuestions.map((q, index) => ({
            type: q.type,
            prompt: q.prompt,
            options: q.options,
            isRequired: q.isRequired,
            order: index + 1
          }))
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
                    answer options, and survey structure. You can then edit and refine everything before saving.
                  </p>
                </div>
              </div>
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
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
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

                  {generatedSurvey.purpose && (
                    <div className="p-3 bg-muted rounded-lg">
                      <Label className="text-sm font-medium">AI Analysis:</Label>
                      <p className="text-sm text-muted-foreground mt-1">{generatedSurvey.purpose}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Generated Questions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Generated Questions
                  </CardTitle>
                  <CardDescription>
                    Review and edit the AI-generated questions. Use the arrow buttons to reorder questions.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {editableQuestions.map((question, questionIndex) => (
                    <Card key={questionIndex} className="border-2">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
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
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
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