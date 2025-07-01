'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  CheckCircle, 
  ArrowRight, 
  Users, 
  Mail,
  ExternalLink
} from 'lucide-react'

interface Survey {
  id: number
  title: string
  slug: string
}

interface CompletedSurvey {
  id: number
  title: string
  description: string
  stopped_at: string
  stop_reason?: string
  response_count: number
}

export default function SurveyCompletedPage() {
  const params = useParams()
  const slug = params.slug as string
  
  const [survey, setSurvey] = useState<CompletedSurvey | null>(null)
  const [activeSurveys, setActiveSurveys] = useState<Survey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get the completed survey details
        const surveyRes = await fetch(`/api/public/surveys/${slug}/status`)
        const surveyData = await surveyRes.json()
        
        if (!surveyData.status) {
          setError('Survey not found')
          return
        }
        
        if (surveyData.survey.status !== 'stopped') {
          // Redirect to the actual survey if it's not stopped
          window.location.href = `/survey/${slug}`
          return
        }
        
        setSurvey(surveyData.survey)

        // Get active surveys for recommendations
        const activeRes = await fetch('/api/public/surveys')
        const activeData = await activeRes.json()
        
        if (activeData.status) {
          setActiveSurveys(activeData.surveys.slice(0, 6)) // Show up to 6 alternatives
        }

      } catch (err) {
        setError('Failed to load survey information')
      } finally {
        setLoading(false)
      }
    }

    if (slug) fetchData()
  }, [slug])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (error || !survey) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-semibold mb-2">Survey Not Found</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => window.location.href = '/'}>
              Return Home
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        
        {/* Main Completion Message */}
        <Card className="mb-8 text-center">
          <CardContent className="pt-8 pb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            
            <h1 className="text-2xl font-bold mb-2">Survey Campaign Completed</h1>
            <h2 className="text-xl text-muted-foreground mb-4">{survey.title}</h2>
            
            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground mb-6">
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                <span>{survey.response_count} participants</span>
              </div>
              <div>
                Ended {formatDate(survey.stopped_at)}
              </div>
            </div>

            {survey.stop_reason && (
              <p className="text-sm text-muted-foreground mb-6">
                {survey.stop_reason}
              </p>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-blue-900 mb-2">Thank You to All Participants!</h3>
              <p className="text-blue-800 text-sm">
                This survey has successfully collected valuable insights from {survey.response_count} participants. 
                The data will help researchers and organizations make better informed decisions.
              </p>
            </div>

            <div className="space-y-3">
              <Button 
                onClick={() => window.location.href = 'mailto:hello@getantelope.com?subject=Become a Survey Tester'}
                className="gap-2"
              >
                <Mail className="w-4 h-4" />
                Become a Survey Tester
              </Button>
              
              <p className="text-xs text-muted-foreground">
                Get early access to new surveys and help shape research
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Active Surveys Recommendations */}
        {activeSurveys.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                Other Surveys You Can Join
              </CardTitle>
              <CardDescription>
                Continue contributing to research by participating in these active surveys
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {activeSurveys.map((activeSurvey) => (
                  <Card key={activeSurvey.id} className="border border-border hover:border-primary/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <h4 className="font-medium text-sm leading-tight pr-2">
                          {activeSurvey.title}
                        </h4>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          Active
                        </Badge>
                      </div>
                      
                      <p className="text-xs text-muted-foreground mb-3">
                        Share your perspective and contribute to research
                      </p>
                      
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="w-full gap-1"
                        onClick={() => window.location.href = `/survey/${activeSurvey.slug}`}
                      >
                        Participate
                        <ArrowRight className="w-3 h-3" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {activeSurveys.length >= 6 && (
                <div className="text-center mt-6">
                  <Button 
                    variant="ghost" 
                    onClick={() => window.location.href = '/surveys'}
                    className="gap-1"
                  >
                    View All Surveys
                    <ExternalLink className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-muted-foreground">
          <p>
            Powered by{' '}
            <a 
              href="https://getantelope.com" 
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Antelope
            </a>
            {' '}• Building the future of survey research
          </p>
        </div>
      </div>
    </div>
  )
} 