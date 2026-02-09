'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Loader2,
  CheckCircle,
  RotateCcw,
  MapPin,
  ChevronRight,
  AlertCircle,
} from 'lucide-react'

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

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
  anonymity_level: string
  questions: SurveyQuestion[]
}

interface Answer {
  questionId: number
  value: string | string[]
}

// -----------------------------------------------------------------------
// Canvassing Mode Page
//
// Mobile-optimized, one-question-at-a-time layout for field canvassers.
// Large touch targets, minimal chrome, GPS capture, quick "next respondent"
// reset flow.
// -----------------------------------------------------------------------

export default function CanvassPage() {
  const params = useParams()
  const slug = params.slug as string

  const [survey, setSurvey] = useState<Survey | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [responseCount, setResponseCount] = useState(0)

  const [geoLocation, setGeoLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [geoStatus, setGeoStatus] = useState<'idle' | 'capturing' | 'done' | 'denied'>('idle')

  // ------------------------------------------------------------------
  // Load survey
  // ------------------------------------------------------------------

  useEffect(() => {
    const fetchSurvey = async () => {
      try {
        const res = await fetch(`/api/public/surveys/${slug}`)
        if (!res.ok) {
          setError('Survey not found')
          return
        }
        const data = await res.json()
        if (data.survey?.status === 'stopped') {
          setError('This survey has ended')
          return
        }
        setSurvey(data.survey)
        initAnswers(data.survey.questions)
      } catch {
        setError('Failed to load survey')
      } finally {
        setLoading(false)
      }
    }

    fetchSurvey()
  }, [slug])

  // ------------------------------------------------------------------
  // GPS (optional, one-time)
  // ------------------------------------------------------------------

  useEffect(() => {
    if (!navigator.geolocation) return
    setGeoStatus('capturing')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGeoStatus('done')
      },
      () => setGeoStatus('denied'),
      { enableHighAccuracy: false, timeout: 5000 }
    )
  }, [])

  // ------------------------------------------------------------------
  // Init / reset answers
  // ------------------------------------------------------------------

  const initAnswers = useCallback((questions: SurveyQuestion[]) => {
    setAnswers(
      questions.map((q) => ({
        questionId: q.id,
        value: q.type === 'multiple-choice' ? [] : '',
      }))
    )
    setCurrentQ(0)
    setSubmitted(false)
  }, [])

  // ------------------------------------------------------------------
  // Answer handlers
  // ------------------------------------------------------------------

  const updateAnswer = useCallback(
    (questionId: number, value: string | string[]) => {
      setAnswers((prev) =>
        prev.map((a) => (a.questionId === questionId ? { ...a, value } : a))
      )
    },
    []
  )

  const toggleMultiChoice = useCallback(
    (questionId: number, option: string) => {
      setAnswers((prev) =>
        prev.map((a) => {
          if (a.questionId !== questionId) return a
          const current = Array.isArray(a.value) ? a.value : []
          const next = current.includes(option)
            ? current.filter((v) => v !== option)
            : [...current, option]
          return { ...a, value: next }
        })
      )
    },
    []
  )

  // ------------------------------------------------------------------
  // Navigation
  // ------------------------------------------------------------------

  const canGoNext = useCallback(() => {
    if (!survey) return false
    const q = survey.questions[currentQ]
    const ans = answers[currentQ]
    if (!q.is_required) return true
    if (Array.isArray(ans.value)) return ans.value.length > 0
    return ans.value.trim() !== ''
  }, [survey, currentQ, answers])

  const goNext = useCallback(() => {
    if (!survey) return
    if (currentQ < survey.questions.length - 1) {
      setCurrentQ((p) => p + 1)
    }
  }, [survey, currentQ])

  const goPrev = useCallback(() => {
    if (currentQ > 0) setCurrentQ((p) => p - 1)
  }, [currentQ])

  // ------------------------------------------------------------------
  // Submit
  // ------------------------------------------------------------------

  const handleSubmit = useCallback(async () => {
    if (!survey) return
    setSubmitting(true)

    try {
      const payload: Record<string, unknown> = {
        answers,
        demographics: {
          location: geoLocation
            ? `${geoLocation.lat.toFixed(5)}, ${geoLocation.lng.toFixed(5)}`
            : '',
        },
        source: 'canvass',
      }

      const res = await fetch(`/api/public/surveys/${slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        setSubmitted(true)
        setResponseCount((c) => c + 1)
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.message || 'Submission failed')
      }
    } catch {
      alert('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }, [survey, answers, slug, geoLocation])

  // ------------------------------------------------------------------
  // Next respondent
  // ------------------------------------------------------------------

  const handleNextRespondent = useCallback(() => {
    if (survey) initAnswers(survey.questions)
  }, [survey, initAnswers])

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !survey) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-3" />
          <p className="text-lg font-medium">{error || 'Survey not found'}</p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 gap-6">
        <CheckCircle className="h-16 w-16 text-green-500" />
        <h2 className="text-2xl font-bold text-center">Response Recorded</h2>
        <p className="text-muted-foreground text-center">
          {responseCount} response{responseCount !== 1 ? 's' : ''} collected this session
        </p>
        <Button size="lg" className="w-full max-w-xs h-14 text-lg" onClick={handleNextRespondent}>
          <RotateCcw className="h-5 w-5 mr-2" />
          Next Respondent
        </Button>
      </div>
    )
  }

  const question = survey.questions[currentQ]
  const answer = answers[currentQ]
  const isLast = currentQ === survey.questions.length - 1

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header bar */}
      <div className="border-b px-4 py-3 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{survey.title}</p>
          <p className="text-xs text-muted-foreground">Canvass Mode</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {geoStatus === 'done' && (
            <span className="flex items-center gap-1 text-green-600">
              <MapPin className="h-3 w-3" /> GPS
            </span>
          )}
          <span>
            {currentQ + 1}/{survey.questions.length}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div
          className="h-1 bg-primary transition-all"
          style={{ width: `${((currentQ + 1) / survey.questions.length) * 100}%` }}
        />
      </div>

      {/* Question area */}
      <div className="flex-1 flex flex-col p-6 gap-6">
        <div>
          <p className="text-lg font-semibold leading-snug">{question.prompt}</p>
          {question.is_required && (
            <p className="text-xs text-muted-foreground mt-1">Required</p>
          )}
        </div>

        <div className="flex-1">
          {/* Single choice */}
          {(question.type === 'single-choice' || question.type === 'rating') &&
            question.options && (
              <RadioGroup
                value={typeof answer.value === 'string' ? answer.value : ''}
                onValueChange={(v) => updateAnswer(question.id, v)}
                className="space-y-3"
              >
                {question.options.map((opt) => (
                  <label
                    key={opt}
                    className="flex items-center gap-3 border rounded-xl p-4 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5 active:scale-[0.98] transition-transform"
                  >
                    <RadioGroupItem value={opt} id={`q${question.id}-${opt}`} />
                    <Label htmlFor={`q${question.id}-${opt}`} className="text-base cursor-pointer flex-1">
                      {opt}
                    </Label>
                  </label>
                ))}
              </RadioGroup>
            )}

          {/* Multiple choice */}
          {question.type === 'multiple-choice' && question.options && (
            <div className="space-y-3">
              {question.options.map((opt) => {
                const checked = Array.isArray(answer.value) && answer.value.includes(opt)
                return (
                  <label
                    key={opt}
                    className={`flex items-center gap-3 border rounded-xl p-4 cursor-pointer active:scale-[0.98] transition-transform ${
                      checked ? 'border-primary bg-primary/5' : ''
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleMultiChoice(question.id, opt)}
                    />
                    <span className="text-base flex-1">{opt}</span>
                  </label>
                )
              })}
            </div>
          )}

          {/* Text / open-ended */}
          {(question.type === 'text' || question.type === 'email' || question.type === 'number') && (
            <Textarea
              value={typeof answer.value === 'string' ? answer.value : ''}
              onChange={(e) => updateAnswer(question.id, e.target.value)}
              placeholder="Type response..."
              className="text-base min-h-[120px]"
            />
          )}
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="border-t p-4 flex gap-3">
        {currentQ > 0 && (
          <Button variant="outline" size="lg" className="h-14" onClick={goPrev}>
            Back
          </Button>
        )}

        {isLast ? (
          <Button
            size="lg"
            className="flex-1 h-14 text-lg"
            disabled={!canGoNext() || submitting}
            onClick={handleSubmit}
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Submitting...
              </>
            ) : (
              'Submit'
            )}
          </Button>
        ) : (
          <Button
            size="lg"
            className="flex-1 h-14 text-lg"
            disabled={!canGoNext()}
            onClick={goNext}
          >
            Next
            <ChevronRight className="h-5 w-5 ml-1" />
          </Button>
        )}
      </div>
    </div>
  )
}
