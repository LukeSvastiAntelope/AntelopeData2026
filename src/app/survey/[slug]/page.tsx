/* eslint-disable react/no-unescaped-entities */
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
  Loader2,
  Shield,
  Lock,
  ArrowRight
} from "lucide-react"
import { useParams } from 'next/navigation'
import { ResponderInfoModal } from '@/components/ResponderInfoModal'
import { ANONYMITY_CONFIGURATIONS, DEMOGRAPHICS_FORM_CONFIGS, shouldCollectField } from '@/app/utils/anonymity-config'
import { AnonymityLevel } from '@/app/utils/interface'

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
  anonymity_level: AnonymityLevel
  questions: SurveyQuestion[]
  source_metadata?: any
}

interface Answer {
  questionId: number
  value: string | string[]
}

interface Demographics {
  name: string
  email: string
  age: string
  gender?: string
  ethnicity?: string
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

// Digital-twin profile/token UI is sunset for now — respondents shouldn't be
// prompted to create Antelope accounts. Flip back on when the digital-twin
// system is properly reintroduced.
const ENABLE_DIGITAL_TWIN_UI = false

const SurveyPage = () => {
  const params = useParams()
  const slug = params.slug as string

  const [survey, setSurvey] = useState<Survey | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agentToken, setAgentToken] = useState<string | null>(null)
  const [isExistingTwin, setIsExistingTwin] = useState(false)
  const [shareEmail, setShareEmail] = useState(false)
  const [otherSurveys, setOtherSurveys] = useState<{ id: number; title: string; slug: string }[]>([])

  // Progressive disclosure step: 'demographics' | 'questions'
  const [currentStep, setCurrentStep] = useState<'demographics' | 'questions'>('demographics')
  const [demographicsCompleted, setDemographicsCompleted] = useState(false)

  // Private-link password gate
  const [needsPassword, setNeedsPassword] = useState(false)
  const [passwordVerified, setPasswordVerified] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [verifyingPassword, setVerifyingPassword] = useState(false)
  
  const [demographics, setDemographics] = useState<Demographics>({
    name: '',
    email: '',
    age: '',
    gender: '',
    ethnicity: '',
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
  // Qualitative chat state
  const [isQualitative, setIsQualitative] = useState<boolean>(false)
  const [chatMessages, setChatMessages] = useState<{ role: 'agent'|'user'; content: string }[]>([])
  const [chatInput, setChatInput] = useState<string>('')
  const [chatLoading, setChatLoading] = useState<boolean>(false)
  const [modalOpen, setModalOpen] = useState<boolean>(true) // Start with modal open
  const [shouldCheckExistingTwin, setShouldCheckExistingTwin] = useState<boolean>(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Check if we should skip demographics for anonymous surveys
  const shouldSkipDemographics = survey?.anonymity_level === 'anonymous'

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages, chatLoading])

  useEffect(() => {
    const fetchSurvey = async () => {
      try {
        const response = await fetch(`/api/public/surveys/${slug}`)
        if (response.ok) {
          const data = await response.json()
          
          // Check if survey is stopped - redirect to completed page
          if (data.survey && data.survey.status === 'stopped') {
            window.location.href = `/survey/${slug}/completed`
            return
          }
          
          setSurvey(data.survey)
          // Gate private surveys behind the link password.
          if (data.survey?.requires_password) {
            setNeedsPassword(true)
          }
          setIsQualitative(Boolean(data.survey?.source_metadata?.type === 'qualitative'))
          // Initialize answers array
          if (data.survey && data.survey.questions) {
            setAnswers(data.survey.questions.map((q: SurveyQuestion) => ({
              questionId: q.id,
              value: q.type === 'multiple-choice' ? [] : ''
            })))
          }
          
          // For anonymous surveys, skip demographics and go straight to questions (non-qualitative)
          if (data.survey?.anonymity_level === 'anonymous') {
            setCurrentStep('questions')
            setDemographicsCompleted(true)
            setModalOpen(false) // Don't show the modal for anonymous surveys
          }

          // Initialize qualitative chat session
          if (data.survey?.source_metadata?.type === 'qualitative') {
            try {
              const startRes = await fetch(`/api/public/surveys/${slug}/qual/start`, { method: 'POST' })
              if (startRes.ok) {
                const sdata = await startRes.json()
                if (sdata.firstMessage) {
                  setChatMessages([{ role: 'agent', content: sdata.firstMessage }])
                }
              }
            } catch (e) {
              console.warn('Failed to start qualitative session', e)
            }
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

  const verifyPassword = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!passwordInput.trim()) return
    setVerifyingPassword(true)
    setPasswordError(null)
    try {
      const res = await fetch(`/api/public/surveys/${slug}/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        setPasswordVerified(true)
      } else {
        setPasswordError('Incorrect password. Please try again.')
      }
    } catch {
      setPasswordError('Could not verify the password. Please try again.')
    } finally {
      setVerifyingPassword(false)
    }
  }

  const updateAnswer = (questionId: number, value: string | string[]) => {
    setAnswers(prev => prev.map(answer => 
      answer.questionId === questionId ? { ...answer, value } : answer
    ))
  }

  const handleModalOpenChange = (open: boolean) => {
    setModalOpen(open)
    if (!open) {
      setShouldCheckExistingTwin(true) // Mark that we've checked
    }
  }

  const handleExistingTwinFound = (existingDemographics: any) => {
    // Pre-fill all the demographics from the existing voter profile
    setDemographics(prev => ({
      ...prev,
      ...existingDemographics
    }))
    setIsExistingTwin(true)
    setShouldCheckExistingTwin(true)
    setModalOpen(false)
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
    // Validate demographics (should already be done, but double-check)
    if (!validateDemographics()) {
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
      let cleanedAnswers = answers.map(answer => ({
        questionId: answer.questionId,
        value: answer.value === undefined || answer.value === null ? '' : answer.value
      }))

      // If qualitative, pack transcript into the single hidden question answer
      if (isQualitative && survey?.questions?.length === 1) {
        const transcriptPayload = {
          transcript: chatMessages,
          summary: '',
          insights: [],
        }
        cleanedAnswers = [{ questionId: survey.questions[0].id, value: JSON.stringify(transcriptPayload) }]
      }

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
        setIsExistingTwin(result.isExistingTwin || false)
        setSubmitted(true)
        fetch('/api/public/surveys')
          .then((r) => r.json())
          .then((data) => {
            if (data.status) {
              setOtherSurveys(data.surveys.filter((s: any) => s.slug !== slug).slice(0, 4))
            }
          })
          .catch(() => {})
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

  // Qualitative chat handlers
  const sendQualMessage = async () => {
    if (!chatInput.trim()) return
    const userMessage = chatInput
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setChatLoading(true)
    try {
      const res = await fetch(`/api/public/surveys/${slug}/qual/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...chatMessages, { role: 'user', content: userMessage }] })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.reply) setChatMessages(prev => [...prev, { role: 'agent', content: data.reply }])
        if (data.done) {
          // Auto-scroll user to demographics/submit if needed
        }
      }
    } catch (e) {
      console.warn('Qual step failed', e)
    } finally {
      setChatLoading(false)
    }
  }

  // Fields the respondent MUST fill. Normally taken from the anonymity config
  // (most are optional). When the creator turns on "Require Demographics" for a
  // FULL-demographics survey, every collected field becomes mandatory.
  const getRequiredFields = (): string[] => {
    if (!survey) return []
    if ((survey as any).demographics_required && survey.anonymity_level === 'full') {
      return ANONYMITY_CONFIGURATIONS['full'].fieldsToCollect.filter((f) => f !== 'socialMedia')
    }
    return DEMOGRAPHICS_FORM_CONFIGS[survey.anonymity_level].requiredFields
  }

  const FIELD_LABELS: Record<string, string> = {
    name: 'Name', email: 'Email', age: 'Age', location: 'Location',
    occupation: 'Occupation', education: 'Education level', income: 'Income range',
    politicalViews: 'Political views', gender: 'Gender', ethnicity: 'Race / ethnicity',
    interests: 'Interests',
  }

  const validateDemographics = () => {
    if (!survey) return false

    for (const field of getRequiredFields()) {
      if (field === 'socialMedia') continue
      const val = (demographics as any)[field]
      if (typeof val !== 'string' || !val.trim()) {
        setError(`${FIELD_LABELS[field] || field} is required`)
        return false
      }
      if (field === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(demographics.email)) {
          setError('Please enter a valid email address')
          return false
        }
      }
    }

    return true
  }

  const proceedToQuestions = () => {
    if (!validateDemographics()) {
      return
    }
    
    setError(null)
    setDemographicsCompleted(true)
    setCurrentStep('questions')
  }

  const backToDemographics = () => {
    setCurrentStep('demographics')
    setError(null)
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

  // Helper function to check if a field should be shown based on anonymity level
  const shouldShowField = (field: string) => {
    if (!survey) return false
    return shouldCollectField(field, survey.anonymity_level)
  }

  // Helper function to check if a field is required (see getRequiredFields)
  const isFieldRequired = (field: string) => {
    if (!survey) return false
    return getRequiredFields().includes(field)
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

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="pt-6">
            <div className="text-center mb-6">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">Thank You!</h2>
              <p className="text-muted-foreground">
                Your survey response has been submitted successfully.
              </p>
            </div>
            
            {/* Email Sharing Checkbox */}
            {!isExistingTwin && demographics.email && (
              <div className="mb-6 p-4 border rounded-lg bg-muted/50">
                <div className="flex items-start gap-3">
                  <Checkbox 
                    id="share-email" 
                    checked={shareEmail}
                    onCheckedChange={(checked) => setShareEmail(checked === true)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <label 
                      htmlFor="share-email" 
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      Share my email with the survey creator
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Allow the person who created this survey to contact you at {demographics.email} for follow-up or related opportunities.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Token Display — sunset until the digital-twin system is properly reintroduced */}
            {ENABLE_DIGITAL_TWIN_UI && agentToken && (
              <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Your Response Token
                  </span>
                </div>
                <code className="block text-xs font-mono p-2 bg-white dark:bg-gray-800 rounded border break-all">
                  {agentToken}
                </code>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
                  Save this token to access your profile and claim rewards.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              {/* View Profile Button — sunset alongside the token display above */}
              {ENABLE_DIGITAL_TWIN_UI && agentToken && (
                <Button asChild className="w-full" size="lg">
                  <a href={`/digital-twin/${agentToken}`}>
                    View My Profile
                  </a>
                </Button>
              )}

              {/* Other public surveys — no account creation prompt */}
              {otherSurveys.length > 0 && (
                <div className="p-4 border rounded-lg bg-muted/30">
                  <p className="text-sm font-medium mb-3 text-center">
                    Other surveys you can take
                  </p>
                  <div className="space-y-2">
                    {otherSurveys.map((s) => (
                      <a
                        key={s.id}
                        href={`/survey/${s.slug}`}
                        className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted transition-colors"
                      >
                        <span className="truncate pr-2">{s.title}</span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground text-center mt-6">
              {isExistingTwin 
                ? 'Continue taking surveys to earn more tokens and contribute to research insights.'
                : 'Your responses help create valuable research insights while keeping your information private.'
              }
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Private-link password gate — shown before any survey content.
  if (needsPassword && !passwordVerified) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center mb-5">
              <Lock className="h-10 w-10 text-primary mx-auto mb-3" />
              <h2 className="text-xl font-semibold">{survey?.title || 'Private survey'}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                This survey is private. Enter the password to continue.
              </p>
            </div>
            <form onSubmit={verifyPassword} className="space-y-3">
              <Input
                type="password"
                autoFocus
                value={passwordInput}
                onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(null) }}
                placeholder="Survey password"
              />
              {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
              <Button type="submit" className="w-full" disabled={verifyingPassword || !passwordInput.trim()}>
                {verifyingPassword ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Checking…</> : 'Continue'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 max-w-4xl pb-28">
        {/* Survey Header */}
        <Card className="mb-8">
          <CardHeader className="text-center">
            {/* Cover media if available */}
            <div className="mb-4">
              <img
                src={survey?.source_metadata?.media?.cover?.url || '/assets/images/placeholder-survey.svg'}
                alt={survey?.source_metadata?.media?.cover?.alt || 'Survey cover'}
                className="mx-auto h-40 w-full max-w-3xl rounded object-cover ring-1 ring-border"
              />
            </div>
            <div className="flex items-center justify-center gap-2 mb-4">
              <Users className="h-8 w-8 text-primary" />
              <Badge variant="secondary">Survey</Badge>
            </div>
            <CardTitle className="text-3xl mb-2">{survey?.title}</CardTitle>
            <CardDescription className="text-lg">
              {survey?.description}
            </CardDescription>
            
            {/* Progress Indicator */}
            {!shouldSkipDemographics && (
              <div className="mt-6 flex items-center justify-center gap-4">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    currentStep === 'demographics' ? 'bg-primary text-primary-foreground' : 
                    demographicsCompleted ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'
                  }`}>
                    {demographicsCompleted ? <CheckCircle className="h-4 w-4" /> : '1'}
                  </div>
                  <span className={`text-sm ${currentStep === 'demographics' ? 'font-medium' : 'text-muted-foreground'}`}>
                    About You
                  </span>
                </div>
                <div className={`w-8 h-0.5 ${demographicsCompleted ? 'bg-green-500' : 'bg-muted'}`} />
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    currentStep === 'questions' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    2
                  </div>
                  <span className={`text-sm ${currentStep === 'questions' ? 'font-medium' : 'text-muted-foreground'}`}>
                    Survey Questions
                  </span>
                </div>
              </div>
            )}
          </CardHeader>
        </Card>

        {/* Error Display */}
        {error && (
          <Card className="mb-6 border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm font-medium">{error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 1: Demographics Section */}
        {currentStep === 'demographics' && survey && !shouldSkipDemographics && (
          <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              About You
            </CardTitle>
            <CardDescription>
              {survey.anonymity_level === 'semi_anonymous'
                ? 'This survey collects general demographic information without personal identifiers.'
                : 'This information helps create a more accurate voter profile'
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Required Fields */}
            {(shouldShowField('name') || shouldShowField('email') || shouldShowField('age')) && (
              <div>
                <h4 className="font-medium mb-3 text-sm text-muted-foreground">Required Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {shouldShowField('name') && (
                    <div>
                      <Label htmlFor="name">Name {isFieldRequired('name') ? '*' : ''}</Label>
                      <Input
                        id="name"
                        placeholder="Your full name"
                        value={demographics.name}
                        onChange={(e) => updateDemographics('name', e.target.value)}
                      />
                    </div>
                  )}
                  {shouldShowField('email') && (
                    <div>
                      <Label htmlFor="email">Email {isFieldRequired('email') ? '*' : ''}</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="your.email@example.com"
                        value={demographics.email}
                        onChange={(e) => updateDemographics('email', e.target.value)}
                      />
                    </div>
                  )}
                  {shouldShowField('age') && (
                    <div>
                      <Label htmlFor="age">Age {isFieldRequired('age') ? '*' : ''}</Label>
                      <Input
                        id="age"
                        type="number"
                        placeholder="25"
                        value={demographics.age}
                        onChange={(e) => updateDemographics('age', e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Optional Personal Information */}
            {(shouldShowField('location') || shouldShowField('gender') || shouldShowField('ethnicity') || shouldShowField('occupation') || shouldShowField('education') || shouldShowField('income')) && (
              <div>
                <h4 className="font-medium mb-3 text-sm text-muted-foreground">Personal Information (Optional)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {shouldShowField('location') && (
                    <div>
                      <Label htmlFor="location">Location</Label>
                      <Input
                        id="location"
                        placeholder="City, Country"
                        value={demographics.location}
                        onChange={(e) => updateDemographics('location', e.target.value)}
                      />
                    </div>
                  )}
                  {shouldShowField('gender') && (
                    <div>
                      <Label htmlFor="gender">Gender / Sex</Label>
                      <select
                        id="gender"
                        value={demographics.gender}
                        onChange={(e) => updateDemographics('gender', e.target.value)}
                        className="w-full px-3 py-2 border border-input bg-background rounded-md"
                      >
                        <option value="">Prefer not to say</option>
                        <option value="female">Female</option>
                        <option value="male">Male</option>
                        <option value="non-binary">Non-binary</option>
                        <option value="other">Other / Self-describe</option>
                      </select>
                    </div>
                  )}
                  {shouldShowField('ethnicity') && (
                    <div>
                      <Label htmlFor="ethnicity">Race / Ethnicity</Label>
                      <select
                        id="ethnicity"
                        value={demographics.ethnicity}
                        onChange={(e) => updateDemographics('ethnicity', e.target.value)}
                        className="w-full px-3 py-2 border border-input bg-background rounded-md"
                      >
                        <option value="">Prefer not to say</option>
                        <option value="white">White</option>
                        <option value="black">Black or African American</option>
                        <option value="hispanic">Hispanic or Latino</option>
                        <option value="asian">Asian</option>
                        <option value="native-american">Native American or Alaska Native</option>
                        <option value="pacific-islander">Native Hawaiian or Pacific Islander</option>
                        <option value="multiracial">Two or more races</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  )}
                  {shouldShowField('occupation') && (
                    <div>
                      <Label htmlFor="occupation">Occupation</Label>
                      <Input
                        id="occupation"
                        placeholder="Your job/profession"
                        value={demographics.occupation}
                        onChange={(e) => updateDemographics('occupation', e.target.value)}
                      />
                    </div>
                  )}
                  {shouldShowField('education') && (
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
                  )}
                  {shouldShowField('income') && (
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
                  )}
                </div>
              </div>
            )}

            {/* Interests and Views */}
            {(shouldShowField('interests') || shouldShowField('politicalViews')) && (
              <div>
                <h4 className="font-medium mb-3 text-sm text-muted-foreground">Interests & Views (Optional)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {shouldShowField('interests') && (
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
                  )}
                  {shouldShowField('politicalViews') && (
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
                  )}
                </div>
              </div>
            )}

            {/* Social Media */}
            {shouldShowField('socialMedia') && (
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
            )}
          </CardContent>
          <CardContent className="pt-0">
            <div className="flex justify-end">
              <Button onClick={proceedToQuestions} size="lg">
                Continue to Survey Questions
              </Button>
            </div>
          </CardContent>
        </Card>
        )}

        {/* Step 2: Questions Section or Qualitative Chat */}
        {currentStep === 'questions' && !isQualitative && (
          <>
            {/* Demographics Summary */}
            {!shouldSkipDemographics && (
              <Card className="mb-6">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-sm text-muted-foreground mb-1">Your Information</h3>
                      <p className="text-sm">
                        {demographics.name} • {demographics.email} • Age {demographics.age}
                        {demographics.location && ` • ${demographics.location}`}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={backToDemographics}>
                      Edit Info
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Anonymous Survey Notice */}
            {shouldSkipDemographics && (
              <Card className="mb-6">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                    <Shield className="h-4 w-4" />
                    <span className="text-sm font-medium">Anonymous Survey</span>
                  </div>
                  <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                    This survey is completely anonymous. No personal or demographic information is being collected.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Questions */}
        <div className="space-y-6">
          {survey?.questions?.map((question, index) => {
            const answer = answers.find(a => a.questionId === question.id)
            
            return (
              <Card key={question.id}>
                <CardContent className="pt-6">
                  <div className="mb-4 space-y-3">
                    {/* Per-question media */}
                    {(question as any)?.media?.url && (
                      <img src={(question as any).media.url} alt={(question as any).media.alt || 'Question media'} className="w-full max-h-64 object-cover rounded ring-1 ring-border" />
                    )}
                    <Label className="text-lg font-medium">
                      {index + 1}. {question.prompt}
                      {Boolean(question.is_required) && <span className="text-destructive ml-1">*</span>}
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
                        <div key={optionIndex} className="flex items-center gap-3 py-1">
                          {(question as any)?.optionMedia?.[optionIndex]?.url && (
                            <img src={(question as any)?.optionMedia?.[optionIndex]?.url || ''} alt={(question as any)?.optionMedia?.[optionIndex]?.alt || ''} className="h-10 w-10 rounded object-cover ring-1 ring-border" />
                          )}
                          <RadioGroupItem 
                            value={option} 
                            label={option}
                            id={`${question.id}-${optionIndex}`} 
                          />
                        </div>
                      ))}
                    </RadioGroup>
                  )}

                  {question.type === 'multiple-choice' && (
                    <div className="space-y-2">
                      {question.options?.map((option, optionIndex) => (
                        <div key={optionIndex} className="flex items-center gap-3">
                          {(question as any)?.optionMedia?.[optionIndex]?.url && (
                            <img src={(question as any)?.optionMedia?.[optionIndex]?.url || ''} alt={(question as any)?.optionMedia?.[optionIndex]?.alt || ''} className="h-10 w-10 rounded object-cover ring-1 ring-border" />
                          )}
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`${question.id}-${optionIndex}`}
                              checked={(answer?.value as string[] || []).includes(option)}
                              onCheckedChange={(checked) => 
                                handleMultipleChoiceChange(question.id, option, checked as boolean)
                              }
                            />
                            <Label htmlFor={`${question.id}-${optionIndex}`}>{option}</Label>
                          </div>
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
                        {((question.options && question.options.length > 0)
                          ? question.options
                          : ['1','2','3','4','5']
                        ).map((opt, idx) => (
                          <RadioGroupItem 
                            key={idx}
                            value={(typeof opt === 'string' ? opt : String(opt))}
                            label={(typeof opt === 'string' ? opt : String(opt))}
                            id={`${question.id}-${idx}`} 
                          />
                        ))}
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
                        Creating Voter Profile...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Submit Survey
                      </>
                    )}
                  </Button>
                  <p className="text-sm text-muted-foreground mt-4">
                    By submitting, you agree to have your responses used to create a voter profile for research purposes.
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {currentStep === 'questions' && isQualitative && (
          <>
            {/* Full-screen chat interface */}
            <div className="fixed inset-0 bg-background z-50 flex flex-col">
              {/* Clean header */}
              <div className="flex-shrink-0 bg-background">
                <div className="flex items-center justify-between p-4">
                  <div className="flex-1" />
                  <div className="flex items-center gap-2">
                    <h1 className="font-medium">{survey?.title}</h1>
                    <Badge variant="secondary" className="text-xs">Interview</Badge>
                  </div>
                  <div className="flex-1 flex justify-end">
                    <Button 
                      onClick={submitSurvey}
                      disabled={submitting}
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Ending…
                        </>
                      ) : (
                        'End Interview'
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Messages container */}
              <div className="flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto">
                  <div className="p-4 space-y-6 pb-32 max-w-4xl mx-auto">
                    {chatMessages.map((m, i) => (
                      <div 
                        key={i} 
                        className="animate-in fade-in-50 duration-500"
                        style={{ 
                          animationDelay: `${Math.min(i * 50, 500)}ms`,
                          animationFillMode: 'both'
                        }}
                      >
                        <div className={`max-w-[80%] ${
                          m.role === 'user' ? 'ml-auto' : 'mr-auto'
                        }`}>
                          <div className={`rounded-2xl px-4 py-3 text-sm ${
                            m.role === 'user' 
                              ? 'bg-primary text-primary-foreground' 
                              : 'bg-muted text-foreground'
                          }`}>
                            {m.content}
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {chatMessages.length === 0 && (
                      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                          <Brain className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <h3 className="font-semibold text-base mb-2">Ready to begin</h3>
                        <p className="text-sm text-muted-foreground max-w-sm">
                          Share your thoughts and experiences. The conversation will adapt based on your responses.
                        </p>
                      </div>
                    )}
                    
                    {chatLoading && (
                      <div className="animate-in fade-in-50 duration-500">
                        <div className="max-w-[80%] mr-auto">
                          <div className="bg-muted text-muted-foreground rounded-2xl px-4 py-3 text-sm">
                            <div className="flex items-center gap-2">
                              <div className="flex space-x-1">
                                <div className="w-2 h-2 bg-current rounded-full animate-pulse" />
                                <div className="w-2 h-2 bg-current rounded-full animate-pulse [animation-delay:0.2s]" />
                                <div className="w-2 h-2 bg-current rounded-full animate-pulse [animation-delay:0.4s]" />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </div>
              </div>

              {/* Clean floating input */}
              <div className="absolute bottom-0 left-0 right-0 bg-background/80 backdrop-blur">
                <div className="p-4">
                  <div className="relative max-w-4xl mx-auto">
                    <div className="relative border border-border rounded-xl bg-background/50 backdrop-blur">
                      <Textarea
                        placeholder="Share your thoughts..."
                        value={chatInput}
                        onChange={(e)=>setChatInput(e.target.value)}
                        onKeyDown={(e)=>{ 
                          if (e.key==='Enter' && !e.shiftKey){ 
                            e.preventDefault(); 
                            sendQualMessage(); 
                          } 
                        }}
                        className="min-h-[60px] pr-12 resize-none border-0 bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                        disabled={chatLoading}
                        rows={2}
                      />
                      <Button 
                        onClick={sendQualMessage} 
                        disabled={chatLoading || !chatInput.trim()}
                        size="sm"
                        className="absolute bottom-2 right-2 h-8 w-8 p-0"
                      >
                        <Send className="h-4 w-4"/>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal should always be available, regardless of current step */}
      {survey && (
        <ResponderInfoModal
          open={modalOpen}
          onOpenChange={handleModalOpenChange}
          demographics={demographics}
          updateDemographics={updateDemographics}
          onExistingTwinFound={handleExistingTwinFound}
          anonymityLevel={survey.anonymity_level}
        />
      )}
    </div>
  )
}

export default SurveyPage 