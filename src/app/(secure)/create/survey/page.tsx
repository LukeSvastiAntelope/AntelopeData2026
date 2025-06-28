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
  Clock
} from "lucide-react"
import Link from "next/link"
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'

interface SurveyQuestion {
  id: string
  type: 'text' | 'single-choice' | 'multiple-choice' | 'rating' | 'yes-no'
  prompt: string
  options?: string[]
  isRequired: boolean
  order: number
}

interface Survey {
  title: string
  description: string
  isPublic: boolean
  questions: SurveyQuestion[]
  startAt?: string
  endAt?: string
  autoPublish?: boolean
}

const CreateSurveyPage = () => {
  const router = useRouter()
  const [survey, setSurvey] = useState<Survey>({
    title: '',
    description: '',
    isPublic: true,
    questions: [],
    autoPublish: false
  })
  const [isLoading, setIsLoading] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

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
      order: survey.questions.length + 1
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
      options: [...(survey.questions.find(q => q.id === questionId)?.options || []), '']
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
    updateQuestion(questionId, { options: newOptions })
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
        body: JSON.stringify(survey)
      })

      if (response.ok) {
        const result = await response.json()
        toast.success('Survey created successfully!')
        router.push('/overview') // Redirect to overview dashboard
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
              <Button variant="outline" size="sm" onClick={generateWithAI}>
                <Wand2 className="h-4 w-4 mr-2" />
                AI Generate
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
                            {[1, 2, 3, 4, 5].map(rating => (
                              <div key={rating} className="flex flex-col items-center">
                                <input type="radio" disabled />
                                <Label className="text-xs mt-1">{rating}</Label>
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