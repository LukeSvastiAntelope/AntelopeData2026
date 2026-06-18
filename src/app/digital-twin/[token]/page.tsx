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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

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
  const [tab, setTab] = useState<'mine' | 'available'>('mine')

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch voter profile data
        const twinRes = await fetch(`/api/digital-twin/${token}`)
        const twinJson = await twinRes.json()
        
        if (!twinJson.status) {
          setError(twinJson.message || 'Voter Profile not found')
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
        setError('Failed to load Voter Profile data')
      } finally {
        setLoading(false)
      }
    }

    if (token) fetchData()
  }, [token])

  // Pick default tab once data arrives
  useEffect(() => {
    if (completedSurveys.length === 0 && activeSurveys.length > 0) {
      setTab('available')
    } else if (completedSurveys.length > 0) {
      setTab('mine')
    }
  }, [completedSurveys.length, activeSurveys.length])

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
            <h2 className="text-xl font-semibold mb-2">{error || 'Voter Profile not found'}</h2>
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
    <div className="flex-1 w-full relative overflow-hidden">
      {/* Colorful background gradients */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-24 h-80 w-80 rounded-full bg-gradient-to-br from-fuchsia-500/30 via-pink-500/20 to-orange-400/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-gradient-to-br from-sky-400/20 via-indigo-500/20 to-purple-500/25 blur-3xl" />
      </div>

      <div className="p-2">
        <div className="mx-auto max-w-6xl">
          {/* Hero / Profile header with glass effect */}
          <div className="rounded-2xl border border-white/20 bg-white/60 dark:bg-white/5 backdrop-blur-xl shadow-xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="relative">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-purple-500/30 to-blue-500/30 flex items-center justify-center ring-2 ring-white/40">
                  <User className="w-10 h-10 text-white drop-shadow" />
                </div>
                <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1 border-2 border-white/70">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold truncate">{demographics.name || 'Anonymous'}</h2>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-1">
                      {demographics.age && (
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{demographics.age}</span>
                      )}
                      {demographics.location && (
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{demographics.location}</span>
                      )}
                      {demographics.occupation && (
                        <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{demographics.occupation}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {completionScore < 70 && (
                      <Button size="sm" onClick={handleEditProfile} className="gap-2"><Edit3 className="w-3 h-3" />Edit Profile</Button>
                    )}
                    <Button size="sm" variant="outline" onClick={handleBrowseAllSurveys} className="gap-2"><Users className="w-3 h-3" />Browse Surveys</Button>
                  </div>
                </div>
                <div className="mt-3 max-w-md">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Profile complete</span>
                    <span className="font-medium">{completionScore}%</span>
                  </div>
                  <Progress value={completionScore} />
                </div>
              </div>
            </div>
          </div>

          {/* Persona Summary & Capabilities */}
          {(persona.summary || persona.worldview || capabilities.topics) && (
            <div className="grid gap-4 md:grid-cols-2 mt-6">
              {(persona.summary || persona.worldview) && (
                <Card className="border-white/20 bg-white/60 dark:bg-white/5 backdrop-blur-xl">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Persona Summary</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{persona.summary || persona.worldview}</p>
                  </CardContent>
                </Card>
              )}
              {Array.isArray(capabilities.topics) && capabilities.topics.length > 0 && (
                <Card className="border-white/20 bg-white/60 dark:bg-white/5 backdrop-blur-xl">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Capabilities</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1">
                      {capabilities.topics.slice(0, 10).map((t: string, i: number) => (
                        <Badge key={`${t}-${i}`} variant="secondary" className="text-xs">{t}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Surveys Tabs */}
          <Card className="mt-6 border-white/20 bg-white/60 dark:bg-white/5 backdrop-blur-xl">
            <CardContent className="pt-6">
              <Tabs value={tab} onValueChange={(v) => setTab(v as 'mine' | 'available')} className="w-full">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <TabsList className="h-10 bg-white/40 dark:bg-white/10 backdrop-blur">
                    <TabsTrigger value="mine">My Surveys</TabsTrigger>
                    <TabsTrigger value="available">Available Surveys</TabsTrigger>
                  </TabsList>
                  <div className="text-xs text-muted-foreground">
                    <span className="mr-3">Completed: {completedSurveys.length}</span>
                    <span>Available: {activeSurveys.length}</span>
                  </div>
                </div>

                <TabsContent value="mine" className="mt-4">
                  {completedSurveys.length === 0 ? (
                    <div className="text-center py-10">
                      <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">No surveys completed yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Complete surveys to enhance your voter profile</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {completedSurveys.map((survey) => (
                        <div key={survey.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                          <div>
                            <h4 className="font-medium text-sm">{survey.title}</h4>
                            {survey.submitted_at && (
                              <p className="text-xs text-muted-foreground">Completed {new Date(survey.submitted_at).toLocaleDateString()}</p>
                            )}
                          </div>
                          <Badge variant="secondary" className="text-xs"><CheckCircle className="w-3 h-3 mr-1" />Done</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="available" className="mt-4">
                  {activeSurveys.length === 0 ? (
                    <div className="text-center py-10">
                      <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">No active surveys available</p>
                      <p className="text-xs text-muted-foreground mt-1">Check back later for new opportunities</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activeSurveys.map((survey) => (
                        <div key={survey.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                          <div className="flex-1">
                            <h4 className="font-medium text-sm">{survey.title}</h4>
                            <p className="text-xs text-muted-foreground">Contribute to research and enhance your voter profile</p>
                          </div>
                          <Button size="sm" variant="outline" className="ml-3" onClick={() => handleTakeSurvey(survey.slug)}>
                            <ArrowRight className="w-3 h-3 mr-1" />
                            Take Survey
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Technical Details */}
          <Card className="mt-6 bg-muted/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Voter Profile ID:</span>
                <Badge variant="secondary" className="font-mono text-xs">{twin.agent_token.slice(0, 8)}...{twin.agent_token.slice(-8)}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
} 