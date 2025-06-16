'use client'

import { useState, useEffect } from 'react'
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
import { 
  Plus, 
  Trash2, 
  Save, 
  ArrowLeft,
  Eye,
  Settings,
  AlertCircle
} from "lucide-react"

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
  created_at: string
  questions: SurveyQuestion[]
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
  const [questions, setQuestions] = useState<SurveyQuestion[]>([])

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
        setQuestions(surveyData.questions || [])
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
          questions: questions.map((q, index) => ({
            ...q,
            order: index + 1
          }))
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
          questions: questions.map((q, index) => ({
            ...q,
            order: index + 1
          }))
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
                <Button onClick={addQuestion}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Question
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
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

              {questions.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No questions added yet. Click &quot;Add Question&quot; to get started.
                </div>
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
                <Button onClick={handlePublish} disabled={isSaving}>
                  {isSaving ? 'Publishing...' : 'Publish Survey'}
                </Button>
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