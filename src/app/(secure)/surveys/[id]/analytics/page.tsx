/* eslint-disable react/no-unescaped-entities */
'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { 
  Brain, 
  Users,
  MessageCircle,
  Calendar,
  Mail,
  MapPin,
  Briefcase,
  GraduationCap,
  DollarSign,
  Send,
  Loader2,
  ArrowLeft,
  Copy,
  CheckCircle
} from "lucide-react"
import Link from "next/link"

interface SurveyResponse {
  id: number
  submitted_at: string
  demographics: {
    name: string
    email: string
    age: string
    location: string
    occupation: string
    education: string
    income: string
    politicalViews: string
    interests: string
    socialMedia: {
      twitter: string
      linkedin: string
      instagram: string
    }
  }
  agentToken: string
  answers: Array<{
    questionId: number
    questionText: string
    value: string | string[]
  }>
}

interface Survey {
  id: number
  title: string
  description: string
  created_at: string
  status: string
}

const SurveyAnalyticsPage = () => {
  const params = useParams()
  const surveyId = params.id as string
  
  const [survey, setSurvey] = useState<Survey | null>(null)
  const [responses, setResponses] = useState<SurveyResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedResponse, setSelectedResponse] = useState<SurveyResponse | null>(null)
  const [question, setQuestion] = useState('')
  const [twinResponse, setTwinResponse] = useState('')
  const [querying, setQuerying] = useState(false)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  useEffect(() => {
    const fetchSurveyAnalytics = async () => {
      try {
        const response = await fetch(`/api/surveys/${surveyId}/analytics`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        })
        
        if (response.ok) {
          const data = await response.json()
          setSurvey(data.survey)
          setResponses(data.responses)
        }
      } catch (error) {
        console.error('Error fetching survey analytics:', error)
      } finally {
        setLoading(false)
      }
    }

    if (surveyId) {
      fetchSurveyAnalytics()
    }
  }, [surveyId])

  const queryDigitalTwin = async () => {
    if (!selectedResponse || !question.trim()) return
    
    setQuerying(true)
    try {
      const response = await fetch('/api/digital-twins/query', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ 
          agentToken: selectedResponse.agentToken, 
          question 
        })
      })
      
      const data = await response.json()
      if (data.status) {
        setTwinResponse(data.response)
      }
    } catch (error) {
      console.error('Query error:', error)
    } finally {
      setQuerying(false)
    }
  }

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="flex-1 p-2 w-full bg-background">
        <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
          <div className="p-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading survey analytics...</p>
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
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/surveys">Surveys</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{survey?.title || 'Analytics'}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </div>
        
        <div className="border-b border-border" />

        <div className="p-6 space-y-6">
          {/* Survey Info */}
          {survey && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {survey.title}
                </CardTitle>
                <CardDescription>
                  {survey.description}
                </CardDescription>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    Created {formatDate(survey.created_at)}
                  </div>
                  <Badge variant={survey.status === 'published' ? 'default' : 'secondary'}>
                    {survey.status}
                  </Badge>
                  <div className="flex items-center gap-1">
                    <Brain className="h-4 w-4" />
                    {responses.length} Digital Twins Created
                  </div>
                </div>
              </CardHeader>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Responses List */}
            <Card>
              <CardHeader>
                <CardTitle>Survey Responses</CardTitle>
                <CardDescription>
                  Click on a response to view details and interact with their digital twin
                </CardDescription>
              </CardHeader>
              <CardContent>
                {responses.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No responses yet</p>
                    <p className="text-sm">Share your survey to start collecting responses</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {responses.map((response) => (
                      <div
                        key={response.id}
                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                          selectedResponse?.id === response.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                        onClick={() => setSelectedResponse(response)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-medium">{response.demographics.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {response.demographics.age} • {response.demographics.location}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">
                              {formatDate(response.submitted_at)}
                            </p>
                            <Badge variant="outline" className="mt-1">
                              <Brain className="h-3 w-3 mr-1" />
                              Digital Twin
                            </Badge>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Briefcase className="h-3 w-3" />
                          {response.demographics.occupation || 'Not specified'}
                          {response.demographics.education && (
                            <>
                              <span>•</span>
                              <GraduationCap className="h-3 w-3" />
                              {response.demographics.education}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Response Details & Digital Twin Interaction */}
            {selectedResponse && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5" />
                    Digital Twin: {selectedResponse.demographics.name}
                  </CardTitle>
                  <CardDescription>
                    Interact with this respondent&apos;s digital twin
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Demographics Summary */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{selectedResponse.demographics.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedResponse.demographics.location}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedResponse.demographics.occupation}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <GraduationCap className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedResponse.demographics.education}</span>
                    </div>
                  </div>

                  {/* Agent Token */}
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <Label className="text-xs font-medium text-muted-foreground">Digital Twin Token:</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs font-mono flex-1 truncate">
                        {selectedResponse.agentToken}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToken(selectedResponse.agentToken)}
                      >
                        {copiedToken === selectedResponse.agentToken ? (
                          <CheckCircle className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Query Interface */}
                  <div className="space-y-3">
                    <Label htmlFor="question">Ask this digital twin a question:</Label>
                    <Textarea
                      id="question"
                      placeholder="e.g., 'What do you think about remote work?', 'How do you feel about climate change?'"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      rows={3}
                    />
                    <Button 
                      onClick={queryDigitalTwin} 
                      disabled={querying || !question.trim()}
                      className="w-full"
                    >
                      {querying ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Ask Question
                    </Button>
                  </div>

                  {/* Response */}
                  {twinResponse && (
                    <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <MessageCircle className="h-4 w-4 text-blue-600" />
                        <span className="font-medium text-blue-900 dark:text-blue-100">Response:</span>
                      </div>
                      <p className="text-sm text-blue-700 dark:text-blue-300">{twinResponse}</p>
                    </div>
                  )}

                  {/* Survey Answers Preview */}
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">Original Survey Responses:</h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {selectedResponse.answers.map((answer, index) => (
                        <div key={index} className="text-sm">
                          <p className="font-medium text-muted-foreground">{answer.questionText}</p>
                          <p className="mt-1">
                            {Array.isArray(answer.value) ? answer.value.join(', ') : answer.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SurveyAnalyticsPage 