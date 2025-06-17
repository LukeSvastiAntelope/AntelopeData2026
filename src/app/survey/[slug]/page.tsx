/* eslint-disable react/no-unescaped-entities */
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { 
  Users, 
  Send,
  CheckCircle,
  AlertCircle,
  Brain,
  Loader2
} from "lucide-react"
import { useParams } from 'next/navigation'
import { ResponderInfoModal } from '@/components/ResponderInfoModal'

interface SurveyQuestion {
  id: number
  type: string
  prompt: string
  options?: string[]
  is_required: boolean
  question_order: number
}

interface Survey {
  id: number
  title: string
  description: string
  questions: SurveyQuestion[]
}

interface Answer {
  questionId: number
  value: string | string[]
}

interface Demographics {
  name: string
  email: string
  age: string
  location: string
  occupation: string
  politicalViews: string
  socialMedia: {
    twitter: string
    linkedin: string
    instagram: string
  }
  interests: string
  education: string
  income: string
}

const SurveyPage = () => {
  const params = useParams()
  const slug = params.slug as string
  
  const [survey, setSurvey] = useState<Survey | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agentToken, setAgentToken] = useState<string | null>(null)
  
  const [demographics, setDemographics] = useState<Demographics>({
    name: '',
    email: '',
    age: '',
    location: '',
    occupation: '',
    politicalViews: '',
    socialMedia: {
      twitter: '',
      linkedin: '',
      instagram: ''
    },
    interests: '',
    education: '',
    income: ''
  })
  
  const [answers, setAnswers] = useState<Answer[]>([])
  const [modalOpen, setModalOpen] = useState<boolean>(true)

  useEffect(() => {
    const fetchSurvey = async () => {
      try {
        const response = await fetch(`/api/public/surveys/${slug}`)
        if (response.ok) {
          const data = await response.json()
          setSurvey(data.survey)
          // Initialize answers array
          if (data.survey && data.survey.questions) {
            setAnswers(data.survey.questions.map((q: SurveyQuestion) => ({
              questionId: q.id,
              value: q.type === 'multiple-choice' ? [] : ''
            })))
          }
        } else {
          setError('Survey not found')
        }
      } catch (error) {
        console.error('Error fetching survey:', error)
        setError('Failed to load survey')
      } finally {
        setLoading(false)
      }
    }

    if (slug) {
      fetchSurvey()
    }
  }, [slug])

  const updateAnswer = (questionId: number, value: string | string[]) => {
    setAnswers(prev => prev.map(answer => 
      answer.questionId === questionId ? { ...answer, value } : answer
    ))
  }

  const handleModalOpenChange = (open: boolean) => {
    if (open) {
      setModalOpen(true)
    } else {
      if (demographics.name.trim() && demographics.email.trim()) {
        setModalOpen(false)
      } else {
        setModalOpen(true)
      }
    }
  }

  const updateDemographics = useCallback((field: keyof Demographics | string, value: string) => {
    if (field.startsWith('socialMedia.')) {
      const socialField = field.split('.')[1] as keyof Demographics['socialMedia']
      setDemographics(prev => ({
        ...prev,
        socialMedia: {
          ...prev.socialMedia,
          [socialField]: value,
        },
      }))
    } else {
      setDemographics(prev => ({ ...prev, [field as keyof Demographics]: value }))
    }
  }, [])

  const validateForm = () => {
    // Check required demographics
    if (!demographics.name.trim()) {
      setError('Name is required')
      return false
    }
    
    if (!demographics.email.trim()) {
      setError('Email is required')
      return false
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(demographics.email)) {
      setError('Please enter a valid email address')
      return false
    }
    
    if (!demographics.age.trim()) {
      setError('Age is required')
      return false
    }

    // Check required questions
    const requiredQuestions = survey?.questions.filter(q => q.is_required) || []
    for (const question of requiredQuestions) {
      const answer = answers.find(a => a.questionId === question.id)
      if (!answer?.value || (Array.isArray(answer.value) && answer.value.length === 0)) {
        setError(`Please answer: ${question.prompt}`)
        return false
      }
    }

    return true
  }

  const submitSurvey = async () => {
    if (!validateForm()) return

    setSubmitting(true)
    setError(null)

    try {
      // Clean up answers to ensure no undefined values
      const cleanedAnswers = answers.map(answer => ({
        questionId: answer.questionId,
        value: answer.value === undefined || answer.value === null ? '' : answer.value
      }))

      const response = await fetch(`/api/public/surveys/${slug}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          surveyId: survey?.id,
          demographics,
          answers: cleanedAnswers
        })
      })

      if (response.ok) {
        const result = await response.json()
        setAgentToken(result.agentToken)
        setSubmitted(true)
      } else {
        const error = await response.json()
        setError(error.message || 'Failed to submit survey')
      }
    } catch (err) {
      setError('Failed to submit survey')
    } finally {
      setSubmitting(false)
    }
  }

  const handleMultipleChoiceChange = (questionId: number, option: string, checked: boolean) => {
    const currentAnswer = answers.find(a => a.questionId === questionId)
    const currentValues = Array.isArray(currentAnswer?.value) ? currentAnswer.value : []
    
    let newValues: string[]
    if (checked) {
      newValues = [...currentValues, option]
    } else {
      newValues = currentValues.filter(v => v !== option)
    }
    
    updateAnswer(questionId, newValues)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading survey...</p>
        </div>
      </div>
    )
  }

  if (error && !survey) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Survey Not Found</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Prepare responder modal once demographics available
  const responderModal = (
    <ResponderInfoModal
      open={modalOpen}
      onOpenChange={handleModalOpenChange}
      demographics={{ name: demographics.name, email: demographics.email }}
      updateDemographics={updateDemographics}
    />
  )

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        {responderModal}
        <Card className="w-full max-w-2xl">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-6" />
            <h2 className="text-2xl font-bold mb-4">Thank You!</h2>
            <p className="text-muted-foreground mb-6">
              Your survey response has been submitted successfully.
            </p>
            
            <div className="bg-blue-50 dark:bg-blue-950/20 p-6 rounded-lg mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="h-5 w-5 text-blue-600" />
                <span className="font-medium text-blue-900 dark:text-blue-100">Digital Twin Created</span>
              </div>
              <p className="text-sm text-blue-700 dark:text-blue-300 mb-4">
                Your responses have been used to create a digital twin agent that represents your perspectives and opinions.
              </p>
              {agentToken && (
                <div className="space-y-4">
                  <div className="bg-white dark:bg-gray-800 p-3 rounded border">
                    <Label className="text-xs font-medium text-muted-foreground">Your Digital Twin Token:</Label>
                    <code className="block text-sm font-mono mt-1 break-all">{agentToken}</code>
                    <p className="text-xs text-muted-foreground mt-2">
                      Save this token for future reference.
                    </p>
                  </div>
                  <Button asChild>
                    <a href={`/digital-twin/${agentToken}`} target="_blank" rel="noopener noreferrer">
                      View &amp; Complete Your Digital Twin Profile
                    </a>
                  </Button>
                </div>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              Your digital twin will be used for research and insights while keeping your personal information private.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background py-8">
      {responderModal}
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Survey Header */}
        <Card className="mb-8">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Users className="h-8 w-8 text-primary" />
              <Badge variant="secondary">Survey</Badge>
            </div>
            <CardTitle className="text-3xl mb-2">{survey?.title}</CardTitle>
            <CardDescription className="text-lg">
              {survey?.description}
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Demographics Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              About You
            </CardTitle>
            <CardDescription>
              This information helps create a more accurate digital twin
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Required Fields */}
            <div>
              <h4 className="font-medium mb-3 text-sm text-muted-foreground">Required Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    placeholder="Your full name"
                    value={demographics.name}
                    onChange={(e) => updateDemographics('name', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your.email@example.com"
                    value={demographics.email}
                    onChange={(e) => updateDemographics('email', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="age">Age *</Label>
                  <Input
                    id="age"
                    type="number"
                    placeholder="25"
                    value={demographics.age}
                    onChange={(e) => updateDemographics('age', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Optional Personal Information */}
            <div>
              <h4 className="font-medium mb-3 text-sm text-muted-foreground">Personal Information (Optional)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    placeholder="City, Country"
                    value={demographics.location}
                    onChange={(e) => updateDemographics('location', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="occupation">Occupation</Label>
                  <Input
                    id="occupation"
                    placeholder="Your job/profession"
                    value={demographics.occupation}
                    onChange={(e) => updateDemographics('occupation', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="education">Education Level</Label>
                  <select
                    id="education"
                    value={demographics.education}
                    onChange={(e) => updateDemographics('education', e.target.value)}
                    className="w-full px-3 py-2 border border-input bg-background rounded-md"
                  >
                    <option value="">Select education level</option>
                    <option value="high-school">High School</option>
                    <option value="some-college">Some College</option>
                    <option value="bachelors">Bachelor&apos;s Degree</option>
                    <option value="masters">Master&apos;s Degree</option>
                    <option value="phd">PhD/Doctorate</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="income">Income Range</Label>
                  <select
                    id="income"
                    value={demographics.income}
                    onChange={(e) => updateDemographics('income', e.target.value)}
                    className="w-full px-3 py-2 border border-input bg-background rounded-md"
                  >
                    <option value="">Select income range</option>
                    <option value="under-25k">Under $25,000</option>
                    <option value="25k-50k">$25,000 - $50,000</option>
                    <option value="50k-75k">$50,000 - $75,000</option>
                    <option value="75k-100k">$75,000 - $100,000</option>
                    <option value="100k-150k">$100,000 - $150,000</option>
                    <option value="over-150k">Over $150,000</option>
                    <option value="prefer-not-to-say">Prefer not to say</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Interests and Views */}
            <div>
              <h4 className="font-medium mb-3 text-sm text-muted-foreground">Interests & Views (Optional)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="interests">Interests & Hobbies</Label>
                  <Textarea
                    id="interests"
                    placeholder="e.g., Technology, Sports, Reading, Travel..."
                    value={demographics.interests}
                    onChange={(e) => updateDemographics('interests', e.target.value)}
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="politicalViews">Political Views</Label>
                  <select
                    id="politicalViews"
                    value={demographics.politicalViews}
                    onChange={(e) => updateDemographics('politicalViews', e.target.value)}
                    className="w-full px-3 py-2 border border-input bg-background rounded-md"
                  >
                    <option value="">Select political leaning</option>
                    <option value="very-liberal">Very Liberal</option>
                    <option value="liberal">Liberal</option>
                    <option value="moderate">Moderate</option>
                    <option value="conservative">Conservative</option>
                    <option value="very-conservative">Very Conservative</option>
                    <option value="libertarian">Libertarian</option>
                    <option value="other">Other</option>
                    <option value="prefer-not-to-say">Prefer not to say</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Social Media */}
            <div>
              <h4 className="font-medium mb-3 text-sm text-muted-foreground">Social Media (Optional)</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="twitter">Twitter/X Handle</Label>
                  <Input
                    id="twitter"
                    placeholder="@username"
                    value={demographics.socialMedia.twitter}
                    onChange={(e) => updateDemographics('socialMedia.twitter', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="linkedin">LinkedIn Profile</Label>
                  <Input
                    id="linkedin"
                    placeholder="linkedin.com/in/username"
                    value={demographics.socialMedia.linkedin}
                    onChange={(e) => updateDemographics('socialMedia.linkedin', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="instagram">Instagram Handle</Label>
                  <Input
                    id="instagram"
                    placeholder="@username"
                    value={demographics.socialMedia.instagram}
                    onChange={(e) => updateDemographics('socialMedia.instagram', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Questions */}
        <div className="space-y-6">
          {survey?.questions?.map((question, index) => {
            const answer = answers.find(a => a.questionId === question.id)
            
            return (
              <Card key={question.id}>
                <CardContent className="pt-6">
                  <div className="mb-4">
                    <Label className="text-lg font-medium">
                      {index + 1}. {question.prompt}
                      {question.is_required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                  </div>

                  {question.type === 'text' && (
                    <Textarea
                      placeholder="Your answer..."
                      value={answer?.value as string || ''}
                      onChange={(e) => updateAnswer(question.id, e.target.value)}
                      className="min-h-[100px]"
                    />
                  )}

                  {question.type === 'single-choice' && (
                    <RadioGroup
                      value={answer?.value as string || ''}
                      onValueChange={(value) => updateAnswer(question.id, value)}
                    >
                      {question.options?.map((option, optionIndex) => (
                        <RadioGroupItem 
                          key={optionIndex}
                          value={option} 
                          label={option}
                          id={`${question.id}-${optionIndex}`} 
                        />
                      ))}
                    </RadioGroup>
                  )}

                  {question.type === 'multiple-choice' && (
                    <div className="space-y-2">
                      {question.options?.map((option, optionIndex) => (
                        <div key={optionIndex} className="flex items-center space-x-2">
                          <Checkbox
                            id={`${question.id}-${optionIndex}`}
                            checked={(answer?.value as string[] || []).includes(option)}
                            onCheckedChange={(checked) => 
                              handleMultipleChoiceChange(question.id, option, checked as boolean)
                            }
                          />
                          <Label htmlFor={`${question.id}-${optionIndex}`}>{option}</Label>
                        </div>
                      ))}
                    </div>
                  )}

                  {question.type === 'rating' && (
                    <RadioGroup
                      value={answer?.value as string || ''}
                      onValueChange={(value) => updateAnswer(question.id, value)}
                    >
                      <div className="flex items-center space-x-6">
                        {[1, 2, 3, 4, 5].map(rating => (
                          <RadioGroupItem 
                            key={rating}
                            value={rating.toString()} 
                            label={rating.toString()}
                            id={`${question.id}-${rating}`} 
                          />
                        ))}
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-2">
                        <span>Poor</span>
                        <span>Excellent</span>
                      </div>
                    </RadioGroup>
                  )}

                  {question.type === 'yes-no' && (
                    <RadioGroup
                      value={answer?.value as string || ''}
                      onValueChange={(value) => updateAnswer(question.id, value)}
                    >
                      <div className="flex items-center space-x-6">
                        <RadioGroupItem value="Yes" label="Yes" id={`${question.id}-yes`} />
                        <RadioGroupItem value="No" label="No" id={`${question.id}-no`} />
                      </div>
                    </RadioGroup>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Error Display */}
        {error && (
          <Card className="mt-6 border-destructive">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submit Button */}
        <Card className="mt-8">
          <CardContent className="pt-6">
            <div className="text-center">
              <Button 
                onClick={submitSurvey} 
                disabled={submitting}
                size="lg"
                className="w-full md:w-auto"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating Digital Twin...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Submit Survey
                  </>
                )}
              </Button>
              <p className="text-sm text-muted-foreground mt-4">
                By submitting, you agree to have your responses used to create a digital twin for research purposes.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default SurveyPage 