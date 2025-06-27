'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { 
  ArrowLeft,
  User,
  MapPin,
  Briefcase,
  Calendar,
  Brain
} from "lucide-react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"

interface SurveyAnswer {
  id: number
  question_id: number
  answer_value: string
  question: {
    id: number
    prompt: string
    type: string
    options?: string[]
  }
}

interface SurveyResponse {
  id: number
  submitted_at: string
  demographics: {
    name?: string
    age?: string
    location?: string
    occupation?: string
    politicalViews?: string
    [key: string]: any
  }
  agent_token?: string
  answers: SurveyAnswer[]
}

interface Survey {
  id: number
  title: string
  description: string
  status: string
  created_at: string
}

const IndividualResponsePage = () => {
  const params = useParams()
  const surveyId = params.id as string
  const responseId = params.responseId as string
  
  const [survey, setSurvey] = useState<Survey | null>(null)
  const [response, setResponse] = useState<SurveyResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadResponseData()
  }, [surveyId, responseId])

  const loadResponseData = async () => {
    setLoading(true)
    try {
      // Load survey details
      const surveyRes = await fetch(`/api/surveys/${surveyId}`, {
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      
      if (surveyRes.ok) {
        const surveyData = await surveyRes.json()
        setSurvey(surveyData.survey)
      }

      // Load individual response
      const responseRes = await fetch(`/api/surveys/${surveyId}/responses/${responseId}`, {
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      
      if (responseRes.ok) {
        const responseData = await responseRes.json()
        if (responseData.status) {
          setResponse(responseData.response)
        }
      }
    } catch (error) {
      console.error('Error loading response data:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatAnswer = (answer: SurveyAnswer) => {
    const { question, answer_value } = answer
    
    switch (question.type) {
      case 'multiple_choice':
      case 'single_choice':
        return answer_value
      case 'text':
      case 'textarea':
        return answer_value
      case 'scale':
        return `${answer_value}/10`
      case 'boolean':
        return answer_value === 'true' ? 'Yes' : 'No'
      default:
        return answer_value
    }
  }

  if (loading) {
    return (
      <div className="flex-1 p-2 w-full bg-background">
        <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
          <div className="px-6 py-4">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <h1 className="text-base font-medium text-card-foreground">Survey Response</h1>
            </div>
          </div>
          <div className="border-b border-border" />
          <div className="p-4 flex items-center justify-center">
            <div className="text-muted-foreground">Loading response...</div>
          </div>
        </div>
      </div>
    )
  }

  if (!response) {
    return (
      <div className="flex-1 p-2 w-full bg-background">
        <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
          <div className="px-6 py-4">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <Link href={`/surveys/${surveyId}/results`} className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div className="h-4 border-l border-border mx-4" />
              <h1 className="text-base font-medium text-card-foreground">Response Not Found</h1>
            </div>
          </div>
          <div className="border-b border-border" />
          <div className="p-4 text-center">
            <div className="text-muted-foreground">This response could not be found.</div>
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
              <Link href={`/surveys/${surveyId}/results`} className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div className="h-4 border-l border-border mx-4" />
              <div>
                <h1 className="text-base font-medium text-card-foreground">
                  Survey Response
                </h1>
                <p className="text-sm text-muted-foreground">
                  {survey?.title}
                </p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="border-b border-border" />

        <div className="p-4 space-y-6">
          {/* Respondent Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Respondent Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Name</div>
                  <div className="text-sm">{response.demographics?.name || 'Anonymous'}</div>
                </div>
                
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Age</div>
                  <div className="text-sm">{response.demographics?.age || '—'}</div>
                </div>
                
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Location
                  </div>
                  <div className="text-sm">{response.demographics?.location || '—'}</div>
                </div>
                
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <Briefcase className="h-3 w-3" />
                    Occupation
                  </div>
                  <div className="text-sm">{response.demographics?.occupation || '—'}</div>
                </div>
                
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Political Views</div>
                  <div className="text-sm">{response.demographics?.politicalViews || '—'}</div>
                </div>
                
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Submitted
                  </div>
                  <div className="text-sm">
                    {formatDistanceToNow(new Date(response.submitted_at), { addSuffix: true })}
                  </div>
                </div>
              </div>
              
              {response.agent_token && (
                <div className="pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-blue-600" />
                    <Badge variant="secondary">Digital Twin Available</Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Survey Answers */}
          <Card>
            <CardHeader>
              <CardTitle>Survey Answers</CardTitle>
              <CardDescription>
                Detailed responses to all survey questions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {response.answers && response.answers.length > 0 ? (
                response.answers.map((answer, index) => (
                  <div key={answer.id} className="space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                        {index + 1}
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="font-medium text-sm">
                          {answer.question.prompt}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Type: {answer.question.type.replace('_', ' ')}
                        </div>
                        <div className="p-3 bg-muted/50 rounded-lg">
                          <div className="text-sm font-medium">
                            {formatAnswer(answer)}
                          </div>
                        </div>
                      </div>
                    </div>
                    {index < response.answers.length - 1 && (
                      <div className="border-b border-border" />
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No answers found for this response.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Additional Demographics */}
          {response.demographics && Object.keys(response.demographics).length > 5 && (
            <Card>
              <CardHeader>
                <CardTitle>Additional Demographics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(response.demographics)
                    .filter(([key]) => !['name', 'age', 'location', 'occupation', 'politicalViews'].includes(key))
                    .map(([key, value]) => (
                      <div key={key} className="space-y-1">
                        <div className="text-sm font-medium text-muted-foreground capitalize">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </div>
                        <div className="text-sm">
                          {typeof value === 'object' && value !== null ? (
                            <div className="space-y-1">
                              {Object.entries(value as Record<string, any>).map(([subKey, subValue]) => (
                                <div key={subKey} className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground capitalize">{subKey}:</span>
                                  <span className="text-xs">{String(subValue) || '—'}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            String(value) || '—'
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export default IndividualResponsePage 