/* eslint-disable react/no-unescaped-entities */
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'

import { 
  Loader2, 
  AlertCircle, 
  User, 
  Brain,
  CheckCircle,
  Edit3,
  Calendar,
  MapPin,
  Briefcase,
  GraduationCap,
  Target,
  FileText,
  TrendingUp,
  Sparkles,
  ArrowRight,
  Users
} from 'lucide-react'

interface TwinData {
  agent_token: string
  baseProfile: any
  created_from_response_id: number
  created_at: string
  principles?: any
  persona_profile?: any
  capability_map?: any
}

interface Survey {
  id: number
  title: string
  submitted_at?: string
}

interface PublicSurvey {
  id: number
  title: string
  slug: string
}

export default function DigitalTwinDashboard() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [twin, setTwin] = useState<TwinData | null>(null)
  const [completedSurveys, setCompletedSurveys] = useState<Survey[]>([])
  const [activeSurveys, setActiveSurveys] = useState<PublicSurvey[]>([])

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch digital twin data
        const twinRes = await fetch(`/api/digital-twin/${token}`)
        const twinJson = await twinRes.json()
        
        if (!twinJson.status) {
          setError(twinJson.message || 'Digital Twin not found')
          return
        }
        
        setTwin(twinJson.twin)

        // Fetch completed surveys
        const surveysRes = await fetch(`/api/digital-twin/${token}/responses`)
        const surveysJson = await surveysRes.json()
        if (surveysJson.status) {
          setCompletedSurveys(surveysJson.surveys || [])
        }

        // Fetch active public surveys
        const activeRes = await fetch('/api/public/surveys')
        const activeJson = await activeRes.json()
        if (activeJson.status) {
          setActiveSurveys(activeJson.surveys || [])
        }

      } catch (err) {
        setError('Failed to load Digital Twin data')
      } finally {
        setLoading(false)
      }
    }

    if (token) fetchData()
  }, [token])

  // Calculate completion score based on available demographic fields
  const calculateCompletionScore = () => {
    if (!twin?.baseProfile?.demographics) return 0
    
    const demographics = twin.baseProfile.demographics
    const totalFields = ['name', 'email', 'age', 'gender', 'ethnicity', 'location', 'occupation', 'education', 'income', 'interests', 'politicalViews']
    const completedFields = totalFields.filter(field => demographics[field] && demographics[field].toString().trim() !== '')
    
    return Math.round((completedFields.length / totalFields.length) * 100)
  }

  // Navigation functions
  const handleEditProfile = () => {
    // Navigate to a dedicated edit page or modal
    router.push(`/digital-twin/${token}/edit`)
  }

  const handleTakeSurvey = (surveySlug: string) => {
    // Navigate to the public survey page
    router.push(`/survey/${surveySlug}`)
  }

  const handleBrowseAllSurveys = () => {
    // Navigate to a surveys listing page
    router.push('/surveys')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !twin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">{error || 'Digital Twin not found'}</h2>
          </CardContent>
        </Card>
      </div>
    )
  }

  const demographics = twin.baseProfile?.demographics || {}
  const persona = (twin as any).persona_profile || {}
  const capabilities = (twin as any).capability_map || {}
  const completionScore = calculateCompletionScore()

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg max-w-6xl">
        {/* Header */}
        <div className="px-6 py-4">
          <h1 className="text-base font-medium text-card-foreground">Digital Twin Dashboard</h1>
        </div>

        <div className="border-b border-border" />

        <div className="p-6">
          {/* Call to Action Section */}
          <Card className="mb-8 bg-gradient-to-br from-primary/5 via-background to-secondary/5 border-primary/20">
            <CardContent className="p-6">
              <div className="text-center space-y-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
                  <Brain className="w-6 h-6 text-primary" />
                </div>
                
                <h3 className="text-lg font-semibold">Enhance Your Digital Twin</h3>
                <p className="text-muted-foreground max-w-2xl mx-auto text-sm">
                  Your digital twin becomes more accurate and insightful as you complete more surveys and update your profile. 
                  Each interaction helps create a richer representation of your perspectives and values.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-2 justify-center mt-4">
                  {completionScore < 70 && (
                    <Button size="sm" className="gap-2" onClick={handleEditProfile}>
                      <Edit3 className="w-3 h-3" />
                      Complete Your Profile
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="gap-2" onClick={handleBrowseAllSurveys}>
                    <Users className="w-3 h-3" />
                    Browse All Surveys
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Profile Section with Completion Score */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
            {/* Profile Card */}
            <Card className="md:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base font-medium">Your Digital Twin</CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleEditProfile} className="gap-1">
                    <Edit3 className="w-3 h-3" />
                    Edit
                  </Button>
                  <Brain className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                      <User className="w-8 h-8 text-primary" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1 border-2 border-background">
                      <Sparkles className="w-3 h-3 text-white" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">{demographics.name || 'Anonymous'}</h3>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                      {demographics.age && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {demographics.age}
                        </span>
                      )}
                      {demographics.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {demographics.location}
                        </span>
                      )}
                    </div>
                    {demographics.occupation && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                        <Briefcase className="w-3 h-3" />
                        {demographics.occupation}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Completion Score */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Profile Complete</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{completionScore}%</div>
                <Progress value={completionScore} className="mt-2" />
                <p className="text-xs text-muted-foreground mt-2">
                  {completionScore < 70 ? 'Complete your profile for better insights' : 'Profile well completed!'}
                </p>
              </CardContent>
            </Card>

            {/* Surveys Completed */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Surveys Completed</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{completedSurveys.length}</div>
                <p className="text-xs text-muted-foreground mt-2">
                  {completedSurveys.length === 0 ? 'No surveys yet' : 'Contributing to your digital twin'}
                </p>
              </CardContent>
            </Card>

            {/* Persona Summary */}
            {(persona.summary || persona.worldview) && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Persona Summary</CardTitle>
                  <Brain className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {persona.summary || persona.worldview}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Completed Surveys */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Your Survey History
                </CardTitle>
                <CardDescription>
                  Surveys you've completed that built your digital twin
                </CardDescription>
              </CardHeader>
              <CardContent>
                {completedSurveys.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No surveys completed yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Complete surveys to enhance your digital twin
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {completedSurveys.slice(0, 5).map((survey) => (
                      <div key={survey.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div>
                          <h4 className="font-medium text-sm">{survey.title}</h4>
                          {survey.submitted_at && (
                            <p className="text-xs text-muted-foreground">
                              Completed {new Date(survey.submitted_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Done
                        </Badge>
                      </div>
                    ))}
                    {completedSurveys.length > 5 && (
                      <p className="text-xs text-muted-foreground text-center pt-2">
                        And {completedSurveys.length - 5} more surveys...
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Active Surveys */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                  Available Surveys
                </CardTitle>
                <CardDescription>
                  Active surveys from organizations using Antelope
                </CardDescription>
              </CardHeader>
              <CardContent>
                {activeSurveys.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No active surveys available</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Check back later for new opportunities
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeSurveys.slice(0, 5).map((survey) => (
                      <div key={survey.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex-1">
                          <h4 className="font-medium text-sm">{survey.title}</h4>
                          <p className="text-xs text-muted-foreground">
                            Contribute to research and enhance your digital twin
                          </p>
                        </div>
                        <Button size="sm" variant="outline" className="ml-3" onClick={() => handleTakeSurvey(survey.slug)}>
                          <ArrowRight className="w-3 h-3 mr-1" />
                          Take Survey
                        </Button>
                      </div>
                    ))}
                    {activeSurveys.length > 5 && (
                      <Button variant="ghost" className="w-full mt-3 text-xs" onClick={handleBrowseAllSurveys}>
                        View all {activeSurveys.length} surveys
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Capabilities */}
            {(capabilities.topics || capabilities.question_type_proficiency) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-blue-600" />
                    Capabilities
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {Array.isArray(capabilities.topics) && capabilities.topics.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs text-muted-foreground mb-1">Topics</div>
                      <div className="flex flex-wrap gap-1">
                        {capabilities.topics.slice(0, 8).map((t: string, i: number) => (
                          <Badge key={`${t}-${i}`} variant="secondary" className="text-xs">{t}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {capabilities.question_type_proficiency && (
                    <div className="text-xs text-muted-foreground">
                      Question-type proficiency captured; improves as more surveys are completed.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>



          {/* Technical Details */}
          <Card className="mt-6 bg-muted/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Digital Twin ID:</span>
                <Badge variant="secondary" className="font-mono text-xs">
                  {twin.agent_token.slice(0, 8)}...{twin.agent_token.slice(-8)}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
} 