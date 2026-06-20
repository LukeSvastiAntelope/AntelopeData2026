'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Badge } from '@/components/ui/badge'

import { 
  Loader2, 
  ArrowLeft, 
  Users, 
  Brain,
  Calendar,
  MapPin,
  Briefcase,
  GraduationCap,
  BarChart3,
  Edit,
  Play,
  Square,
  Clock,
  TrendingUp
} from 'lucide-react'

// Charts
import { AreaChart, Area, BarChart, Bar, PieChart as RechartsPieChart, Pie, Cell, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend, LabelList } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SurveyAnalyticsDashboard } from '@/components/SurveyAnalyticsDashboard'
import { SurveyRespondentsTablePaginated } from '@/components/SurveyRespondentsTablePaginated'
import SurveyQuestionCharts from '@/components/SurveyQuestionCharts'
import { ViewQuestionsDialog } from '@/components/ViewQuestionsDialog'



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

interface SurveyAnalyticsApiResponse {
  survey: {
    id: number
    title: string
    description: string
    created_at: string
    status: string
    is_public: boolean
    response_count: number
  }
  responses: SurveyResponse[]
}

// Neutral theme color palette
const COLORS = [
  'var(--neutral-600)',
  'var(--neutral-500)',
  'var(--neutral-400)',
  'var(--neutral-700)',
  'var(--neutral-300)',
  'var(--neutral-800)'
]

const SurveyResultsPage = () => {
  const params = useParams()
  const surveyId = params.id as string
  const router = useRouter()

  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Campaign management functions
  const [campaignLoading, setCampaignLoading] = useState(false)

  const handleCampaignAction = async (action: 'start' | 'stop' | 'schedule', actionData?: any) => {
    if (!summary?.survey) return
    
    setCampaignLoading(true)
    try {
      const response = await fetch(`/api/surveys/${summary.survey.id}/campaign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          ...actionData
        }),
      })

      const result = await response.json()
      
      if (!result.status) {
        throw new Error(result.message || 'Failed to update campaign')
      }

      // Update local state
      const newStatus = action === 'start' ? 'active' : action === 'stop' ? 'stopped' : 'scheduled'
      setSummary({
        ...summary,
        survey: {
          ...summary.survey,
          status: newStatus
        }
      })

    } catch (err) {
      console.error('Campaign action failed:', err)
    } finally {
      setCampaignLoading(false)
    }
  }


  useEffect(() => {
    if (!surveyId) return

    const fetchSummary = async () => {
      try {
        // Try the new stats endpoint first (for surveys with pre-computed stats)
        let res = await fetch(`/api/surveys/${surveyId}/stats`)
        
        if (res.status === 202 || !res.ok) {
          // Fall back to legacy summary if stats not ready or failed
          console.log('Pre-computed stats not available, falling back to legacy summary')
          res = await fetch(`/api/surveys/${surveyId}/summary`)
        }
        
        if (res.ok) {
          const json = await res.json()
          setSummary(json)
        }
      } catch (err) {
        console.error('Failed to fetch survey summary', err)
      } finally {
        setLoading(false)
      }
    }

    fetchSummary()
  }, [surveyId])

  // Analytics calculations
  const analytics = useMemo(() => {
    if (!summary) return null

    const { ageData, locationData, educationData, timeline } = summary

    return {
      totalResponses: summary.survey.response_count,
      ageData,
      locationData,
      educationData,
      timeline
    }
  }, [summary])



  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
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
            <p className="text-muted-foreground">Loading survey results...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="flex-1 p-2 w-full bg-background">
        <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
          <div className="p-6 text-center">
            <p className="text-muted-foreground">Failed to load survey results</p>
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
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="/surveys">Surveys</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{summary?.survey?.title || 'Results'}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="flex gap-2">
              <ViewQuestionsDialog surveyId={surveyId} />
              <Link href={`/surveys/${surveyId}/edit`}>
                <Button size="sm" variant="outline">
                  <Edit className="h-3 w-3 mr-1.5" />
                  Edit Survey
                </Button>
              </Link>
              <Link href={`/surveys/${surveyId}/analytics`}>
                <Button size="sm" variant="outline">
                  Analytics
                </Button>
              </Link>
              <Link href={`/surveys/${surveyId}/twins`}>
                <Button size="sm" variant="outline">
                  Deploy Twins
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="border-b border-border" />

        <div className="p-6 space-y-6">
          {/* Survey Overview */}
          {summary.survey && (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      {summary.survey.title}
                    </CardTitle>
                    <CardDescription>
                      {summary.survey.description}
                    </CardDescription>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        Created {formatDate(summary.survey.created_at)}
                      </div>
                      <Badge variant={summary.survey.status === 'active' ? 'default' : 'secondary'}>
                        {summary.survey.status}
                      </Badge>
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {summary.survey.response_count} Responses
                      </div>
                      <div className="flex items-center gap-1">
                        <Brain className="h-4 w-4" />
                        {summary.survey.response_count} Voter Profiles
                      </div>
                      {summary.survey.is_public && (
                        <div className="flex items-center gap-1 text-green-600">
                          <span className="inline-block h-2 w-2 rounded-full bg-green-600" />
                          Public
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Campaign Actions */}
                  {['draft', 'scheduled', 'active', 'stopped'].includes(summary.survey.status) && (
                    <div className="flex gap-2">
                      {['draft', 'scheduled', 'stopped'].includes(summary.survey.status) && (
                        <Button
                          size="sm"
                          onClick={() => handleCampaignAction('start')}
                          disabled={campaignLoading}
                        >
                          <Play className="h-3 w-3 mr-1.5" />
                          Start Campaign
                        </Button>
                      )}
                      
                      {summary.survey.status === 'active' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCampaignAction('stop', { reason: 'Manually stopped' })}
                          disabled={campaignLoading}
                        >
                          <Square className="h-3 w-3 mr-1.5" />
                          Stop Campaign
                        </Button>
                      )}
                      
                      {['draft', 'stopped'].includes(summary.survey.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const startAt = prompt('Enter start date/time (YYYY-MM-DD HH:MM):')
                            if (startAt) {
                              handleCampaignAction('schedule', { campaignStartAt: startAt })
                            }
                          }}
                          disabled={campaignLoading}
                        >
                          <Clock className="h-3 w-3 mr-1.5" />
                          Schedule
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>
            </Card>
          )}



          {/* Analytics Tabs */}
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="advanced" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Advanced Analytics
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              {analytics && (
                <>
                  {/* Stats Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center">
                          <Users className="h-6 w-6 text-blue-600" />
                          <div className="ml-3">
                            <p className="text-sm font-medium text-muted-foreground">Total Responses</p>
                            <p className="text-2xl font-bold">{analytics.totalResponses}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center">
                          <MapPin className="h-6 w-6 text-green-600" />
                          <div className="ml-3">
                            <p className="text-sm font-medium text-muted-foreground">Locations</p>
                            <p className="text-2xl font-bold">{analytics.locationData.length}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center">
                          <GraduationCap className="h-6 w-6 text-purple-600" />
                          <div className="ml-3">
                            <p className="text-sm font-medium text-muted-foreground">Education Levels</p>
                            <p className="text-2xl font-bold">{analytics.educationData.length}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center">
                          <Calendar className="h-6 w-6 text-orange-600" />
                          <div className="ml-3">
                            <p className="text-sm font-medium text-muted-foreground">Days Active</p>
                            <p className="text-2xl font-bold">{analytics.timeline.length}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Compact Charts Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {/* Age Distribution */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Age Distribution</CardTitle>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <ChartContainer 
                          config={{ count: { label: "Responses", color: "var(--neutral-600)" } }} 
                          className="aspect-auto h-[160px] w-full"
                        >
                          <BarChart data={analytics.ageData} margin={{ left: -20, right: 20, top: 12, bottom: 12 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--muted)" />
                            <XAxis dataKey="range" tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={10} />
                            <YAxis tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={10} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Bar dataKey="count" fill="var(--neutral-600)" radius={2} />
                          </BarChart>
                        </ChartContainer>
                      </CardContent>
                    </Card>

                    {/* Location Distribution */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Top Locations</CardTitle>
                      </CardHeader>
                      <CardContent className="pb-4 flex items-center gap-4">
                        <div className="flex-shrink-0">
                          <ChartContainer 
                            config={{ count: { label: "Responses", color: "var(--neutral-600)" } }} 
                            className="aspect-square h-[140px] w-[140px]"
                          >
                            <RechartsPieChart>
                              <Pie
                                data={analytics.locationData.filter(d => d.location !== 'Not specified').map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                outerRadius={60}
                                innerRadius={20}
                                paddingAngle={2}
                                dataKey="count"
                              >
                                {analytics.locationData.filter(d => d.location !== 'Not specified').map((_, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                              </Pie>
                              <ChartTooltip content={<ChartTooltipContent />} />
                            </RechartsPieChart>
                          </ChartContainer>
                        </div>
                        {/* Legend */}
                        <div className="flex-1 flex flex-col gap-2 text-xs">
                          {analytics.locationData.filter(d => d.location !== 'Not specified').map((d, i) => (
                            <div key={d.location} className="flex items-center gap-1">
                              <span
                                className="inline-block h-2 w-2 rounded-sm"
                                style={{ backgroundColor: COLORS[i % COLORS.length] }}
                              />
                              <span className="text-muted-foreground truncate">{d.location} ({d.count})</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Education Distribution */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Education Levels</CardTitle>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <ChartContainer 
                          config={{ 
                            count: { label: "Responses", color: "var(--neutral-600)" },
                            label: { color: "var(--background)" }
                          }} 
                          className="aspect-auto h-[160px] w-full"
                        >
                          <BarChart 
                            data={analytics.educationData} 
                            accessibilityLayer
                            layout="vertical"
                            margin={{ right: 16 }}
                          >
                            <CartesianGrid horizontal={false} />
                            <YAxis 
                              dataKey="education"
                              type="category"
                              tickLine={false} 
                              tickMargin={10}
                              axisLine={false} 
                              tickFormatter={(value) => value.length > 20 ? value.slice(0, 20) + "..." : value}
                              hide
                            />
                            <XAxis dataKey="count" type="number" hide />
                            <ChartTooltip
                              cursor={false}
                              content={<ChartTooltipContent indicator="line" />}
                            />
                            <Bar
                              dataKey="count"
                              layout="vertical"
                              fill="var(--neutral-600)"
                              radius={4}
                            >
                              <LabelList
                                dataKey="education"
                                position="insideLeft"
                                offset={8}
                                className="fill-white"
                                fontSize={10}
                              />
                              <LabelList
                                dataKey="count"
                                position="right"
                                offset={8}
                                className="fill-foreground"
                                fontSize={10}
                              />
                            </Bar>
                          </BarChart>
                        </ChartContainer>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Per-question statistics with multiple graph types */}
                  {(summary?.survey.response_count || 0) > 0 && (
                    <SurveyQuestionCharts surveyId={parseInt(surveyId)} />
                  )}

                  {/* Survey Responses Table */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold">Survey Responses</h3>
                      <p className="text-sm text-muted-foreground">All survey responses ({summary?.survey.response_count || 0} total)</p>
                    </div>
                    {(summary?.survey.response_count || 0) === 0 ? (
                      <p className="text-center text-muted-foreground py-8">No responses yet.</p>
                    ) : (
                      <SurveyRespondentsTablePaginated surveyId={surveyId} />
                    )}
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="advanced" className="space-y-6">
              <SurveyAnalyticsDashboard surveyId={parseInt(surveyId)} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}

export default SurveyResultsPage 