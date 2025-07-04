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

// ShadCN zinc theme color palette
const COLORS = [
  'hsl(var(--zinc-600))',
  'hsl(var(--zinc-500))', 
  'hsl(var(--zinc-400))',
  'hsl(var(--zinc-700))',
  'hsl(var(--zinc-300))',
  'hsl(var(--zinc-800))'
]

const SurveyResultsPage = () => {
  const params = useParams()
  const surveyId = params.id as string
  const router = useRouter()

  const [data, setData] = useState<SurveyAnalyticsApiResponse | null>(null)
  const [loading, setLoading] = useState(true)

  // Campaign management functions
  const [campaignLoading, setCampaignLoading] = useState(false)

  const handleCampaignAction = async (action: 'start' | 'stop' | 'schedule', actionData?: any) => {
    if (!data?.survey) return
    
    setCampaignLoading(true)
    try {
      const response = await fetch(`/api/surveys/${data.survey.id}/campaign`, {
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
      setData({
        ...data,
        survey: {
          ...data.survey,
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

    const fetchResults = async () => {
      try {
        const res = await fetch(`/api/surveys/${surveyId}/analytics`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}` || ''
          }
        })
        if (res.ok) {
          const json: SurveyAnalyticsApiResponse = await res.json()
          setData(json)
        }
      } catch (err) {
        console.error('Failed to fetch survey results', err)
      } finally {
        setLoading(false)
      }
    }

    fetchResults()
  }, [surveyId])

  // Analytics calculations
  const analytics = useMemo(() => {
    if (!data?.responses) return null

    const responses = data.responses

    // Age distribution
    const ageGroups = responses.reduce((acc, r) => {
      const age = parseInt(r.demographics.age)
      if (age < 25) acc['18-24'] = (acc['18-24'] || 0) + 1
      else if (age < 35) acc['25-34'] = (acc['25-34'] || 0) + 1
      else if (age < 45) acc['35-44'] = (acc['35-44'] || 0) + 1
      else if (age < 55) acc['45-54'] = (acc['45-54'] || 0) + 1
      else acc['55+'] = (acc['55+'] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const ageData = Object.entries(ageGroups).map(([range, count]) => ({ range, count }))

    // Location distribution (top 5)
    const locationCounts = responses.reduce((acc, r) => {
      const location = r.demographics.location || 'Not specified'
      acc[location] = (acc[location] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const locationData = Object.entries(locationCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([location, count]) => ({ location, count }))

    // Education distribution
    const educationCounts = responses.reduce((acc, r) => {
      const education = r.demographics.education || 'Not specified'
      acc[education] = (acc[education] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const educationData = Object.entries(educationCounts).map(([education, count]) => ({ education, count }))

    // Response timeline (by day)
    const timelineData = responses.reduce((acc, r) => {
      const date = new Date(r.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      acc[date] = (acc[date] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const timeline = Object.entries(timelineData)
      .sort(([a], [b]) => {
        // Parse dates for proper sorting
        const dateA = new Date(a + ', 2024')
        const dateB = new Date(b + ', 2024')
        return dateA.getTime() - dateB.getTime()
      })
      .map(([date, count]) => ({ date, count }))

    return {
      totalResponses: responses.length,
      ageData,
      locationData,
      educationData,
      timeline
    }
  }, [data])



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

  if (!data) {
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
                    <BreadcrumbPage>{data?.survey?.title || 'Results'}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="flex gap-2">
              <Link href={`/surveys/${surveyId}/edit`}>
                <Button size="sm" variant="outline">
                  <Edit className="h-3 w-3 mr-1.5" />
                  Edit Survey
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="border-b border-border" />

        <div className="p-6 space-y-6">
          {/* Survey Overview */}
          {data.survey && (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      {data.survey.title}
                    </CardTitle>
                    <CardDescription>
                      {data.survey.description}
                    </CardDescription>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        Created {formatDate(data.survey.created_at)}
                      </div>
                      <Badge variant={data.survey.status === 'active' ? 'default' : 'secondary'}>
                        {data.survey.status}
                      </Badge>
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {data.responses.length} Responses
                      </div>
                      <div className="flex items-center gap-1">
                        <Brain className="h-4 w-4" />
                        {data.responses.length} Digital Twins
                      </div>
                      {data.survey.is_public && (
                        <div className="flex items-center gap-1 text-green-600">
                          <span className="inline-block h-2 w-2 rounded-full bg-green-600" />
                          Public
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Campaign Actions */}
                  {['draft', 'scheduled', 'active', 'stopped'].includes(data.survey.status) && (
                    <div className="flex gap-2">
                      {['draft', 'scheduled', 'stopped'].includes(data.survey.status) && (
                        <Button
                          size="sm"
                          onClick={() => handleCampaignAction('start')}
                          disabled={campaignLoading}
                        >
                          <Play className="h-3 w-3 mr-1.5" />
                          Start Campaign
                        </Button>
                      )}
                      
                      {data.survey.status === 'active' && (
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
                      
                      {['draft', 'stopped'].includes(data.survey.status) && (
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
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    {/* Age Distribution */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Age Distribution</CardTitle>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <ChartContainer 
                          config={{ count: { label: "Responses", color: "hsl(var(--zinc-600))" } }} 
                          className="aspect-auto h-[160px] w-full"
                        >
                          <BarChart data={analytics.ageData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                            <XAxis dataKey="range" tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" fontSize={10} />
                            <YAxis tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" fontSize={10} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Bar dataKey="count" fill="hsl(var(--zinc-600))" radius={2} />
                          </BarChart>
                        </ChartContainer>
                      </CardContent>
                    </Card>

                    {/* Location Distribution */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Top Locations</CardTitle>
                      </CardHeader>
                      <CardContent className="pb-4 flex flex-col items-center justify-center">
                        <div className="w-full flex justify-center">
                          <ChartContainer 
                            config={{ count: { label: "Responses", color: "hsl(var(--zinc-600))" } }} 
                            className="aspect-square h-[120px] w-[120px]"
                          >
                            <RechartsPieChart>
                              <Pie
                                data={analytics.locationData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                outerRadius={50}
                                innerRadius={20}
                                paddingAngle={2}
                                dataKey="count"
                              >
                                {analytics.locationData.map((_, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                              </Pie>
                              <ChartTooltip content={<ChartTooltipContent />} />
                            </RechartsPieChart>
                          </ChartContainer>
                        </div>
                        {/* Legend */}
                        <div className="w-full flex flex-col gap-1 text-xs mt-2">
                          {analytics.locationData.slice(0, 3).map((d, i) => (
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
                          config={{ count: { label: "Responses", color: "hsl(var(--zinc-600))" } }} 
                          className="aspect-auto h-[160px] w-full"
                        >
                          <BarChart 
                            data={analytics.educationData} 
                            layout="horizontal"
                            margin={{ left: 0, right: 16, top: 12, bottom: 12 }}
                          >
                            <CartesianGrid horizontal={false} stroke="hsl(var(--muted))" />
                            <XAxis 
                              type="number" 
                              tickLine={false} 
                              axisLine={false} 
                              stroke="hsl(var(--muted-foreground))" 
                              fontSize={10}
                              hide
                            />
                            <YAxis 
                              dataKey="education" 
                              type="category" 
                              width={80} 
                              tickLine={false} 
                              axisLine={false} 
                              stroke="hsl(var(--muted-foreground))" 
                              fontSize={9}
                              hide
                            />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Bar dataKey="count" fill="hsl(var(--zinc-600))" radius={2}>
                              <LabelList
                                dataKey="education"
                                position="insideLeft"
                                offset={8}
                                fill="white"
                                fontSize={10}
                              />
                              <LabelList
                                dataKey="count"
                                position="right"
                                offset={8}
                                fill="hsl(var(--foreground))"
                                fontSize={10}
                              />
                            </Bar>
                          </BarChart>
                        </ChartContainer>
                      </CardContent>
                    </Card>

                    {/* Response Timeline */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Response Timeline</CardTitle>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <ChartContainer 
                          config={{ count: { label: "Responses", color: "hsl(var(--zinc-600))" } }} 
                          className="aspect-auto h-[160px] w-full"
                        >
                          <AreaChart 
                            data={analytics.timeline}
                            margin={{ left: 0, right: 0, top: 12, bottom: 12 }}
                          >
                            <defs>
                              <linearGradient id="fillTimelineCompact" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="hsl(var(--zinc-600))" stopOpacity={0.8} />
                                <stop offset="95%" stopColor="hsl(var(--zinc-600))" stopOpacity={0.1} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                            <XAxis 
                              dataKey="date" 
                              tickLine={false} 
                              axisLine={false} 
                              stroke="hsl(var(--muted-foreground))" 
                              fontSize={8}
                              interval="preserveStartEnd"
                            />
                            <YAxis 
                              tickLine={false} 
                              axisLine={false} 
                              stroke="hsl(var(--muted-foreground))" 
                              fontSize={9}
                              allowDecimals={false}
                            />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Area 
                              type="monotone" 
                              dataKey="count" 
                              stroke="hsl(var(--zinc-600))" 
                              strokeWidth={2} 
                              fill="url(#fillTimelineCompact)" 
                            />
                          </AreaChart>
                        </ChartContainer>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Recent Responses List */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold">Recent Responses</h3>
                      <p className="text-sm text-muted-foreground">Latest survey responses ({data.responses.length} total)</p>
                    </div>
                    {data.responses.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">No responses yet.</p>
                    ) : (
                      <div className="rounded-lg border border-border overflow-auto max-h-[400px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Responder</TableHead>
                              <TableHead>Age</TableHead>
                              <TableHead>Location</TableHead>
                              <TableHead>Occupation</TableHead>
                              <TableHead>Education</TableHead>
                              <TableHead>Submitted</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.responses.slice(0, 10).map((resp) => (
                              <TableRow 
                                key={resp.id}
                                className="cursor-pointer hover:bg-muted/50"
                                onClick={() => router.push(`/surveys/${surveyId}/results/${resp.id}`)}
                              >
                                <TableCell className="font-medium">
                                  {resp.demographics?.name || resp.demographics?.email || `Responder #${resp.id}`}
                                </TableCell>
                                <TableCell>{resp.demographics?.age || '-'}</TableCell>
                                <TableCell>{resp.demographics?.location || '-'}</TableCell>
                                <TableCell>{resp.demographics?.occupation || '-'}</TableCell>
                                <TableCell>{resp.demographics?.education || '-'}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {formatDate(resp.submitted_at)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
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