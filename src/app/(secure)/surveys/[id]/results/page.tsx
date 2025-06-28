'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { 
  Users,
  BarChart3,
  Calendar,
  User,
  MapPin,
  Briefcase
} from "lucide-react"
import Link from "next/link"
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"

// Charts & table utilities
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, CartesianGrid, XAxis, YAxis, LabelList } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table"
import { formatDistanceToNow } from "date-fns"

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
  agentToken?: string
}

interface Survey {
  id: number
  title: string
  description: string
  status: string
  created_at: string
}

const SurveyResultsPage = () => {
  const params = useParams()
  const router = useRouter()
  const surveyId = params.id as string
  
  const [survey, setSurvey] = useState<Survey | null>(null)
  const [responses, setResponses] = useState<SurveyResponse[]>([])
  const [loading, setLoading] = useState(true)

  const grayscalePalette = [
    'hsl(0, 0%, 9%)',
    'hsl(0, 0%, 26%)',
    'hsl(0, 0%, 40%)',
    'hsl(0, 0%, 54%)',
    'hsl(0, 0%, 71%)',
  ]

  // Demographics aggregation
  const demographicsData = useMemo(() => {
    const ageBuckets: Record<string, number> = {
      '<18': 0,
      '18-24': 0,
      '25-34': 0,
      '35-44': 0,
      '45-54': 0,
      '55-64': 0,
      '65+': 0,
    }

    const locationCounts: Record<string, number> = {}
    const occupationCounts: Record<string, number> = {}
    const politicalCounts: Record<string, number> = {}

    responses.forEach((response) => {
      // Age distribution
      const ageNumber = parseInt(response.demographics?.age as string)
      if (!isNaN(ageNumber)) {
        let bucket = '65+'
        if (ageNumber < 18) bucket = '<18'
        else if (ageNumber < 25) bucket = '18-24'
        else if (ageNumber < 35) bucket = '25-34'
        else if (ageNumber < 45) bucket = '35-44'
        else if (ageNumber < 55) bucket = '45-54'
        else if (ageNumber < 65) bucket = '55-64'
        ageBuckets[bucket] += 1
      }

      // Location distribution
      const location = response.demographics?.location || 'Unknown'
      locationCounts[location] = (locationCounts[location] || 0) + 1

      // Occupation distribution
      const occupation = response.demographics?.occupation || 'Unknown'
      occupationCounts[occupation] = (occupationCounts[occupation] || 0) + 1

      // Political views distribution
      const political = response.demographics?.politicalViews || 'Unknown'
      politicalCounts[political] = (politicalCounts[political] || 0) + 1
    })

    const ageData = Object.entries(ageBuckets)
      .filter(([_, count]) => count > 0)
      .map(([group, count]) => ({ group, count }))

    const locationData = Object.entries(locationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([location, count]) => ({ name: location, count }))

    const occupationData = Object.entries(occupationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([occupation, count]) => ({ name: occupation, count }))

    const politicalData = Object.entries(politicalCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([political, count]) => ({ name: political, count }))

    return { ageData, locationData, occupationData, politicalData }
  }, [responses])

  useEffect(() => {
    loadSurveyData()
  }, [surveyId])

  const loadSurveyData = async () => {
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

      // Load survey analytics (which includes responses)
      const analyticsRes = await fetch(`/api/surveys/${surveyId}/analytics`, {
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      
      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json()
        if (analyticsData.responses) {
          setResponses(analyticsData.responses)
        }
      }
    } catch (error) {
      console.error('Error loading survey data:', error)
    } finally {
      setLoading(false)
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
              <h1 className="text-base font-medium text-card-foreground">Survey Results</h1>
            </div>
          </div>
          <div className="border-b border-border" />
          <div className="p-4 flex items-center justify-center">
            <div className="text-muted-foreground">Loading survey results...</div>
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
                    <BreadcrumbPage>{survey?.title || 'Survey'}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </div>
        </div>
        
        <div className="border-b border-border" />

        <div className="p-4 space-y-4">
          {responses.length === 0 ? (
            <div className="text-center space-y-4 py-12">
              <div className="flex items-center justify-center mb-4">
                <div className="p-3 rounded-full bg-primary/10">
                  <Users className="h-8 w-8 text-primary" />
                </div>
              </div>
              <h2 className="text-2xl font-bold">No Responses Yet</h2>
              <p className="text-muted-foreground text-base max-w-2xl mx-auto">
                This survey hasn&apos;t received any responses yet. Share your survey to start collecting data.
              </p>
            </div>
          ) : (
            <>
              {/* Demographics Overview */}
              <section className="space-y-4">
                <h2 className="text-xl font-semibold">Demographics Overview</h2>
                
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {/* Age Distribution */}
                  {demographicsData.ageData.length > 0 && (
                    <Card>
                      <CardHeader className="px-6 pt-6 pb-0">
                        <CardTitle className="text-sm">Age Distribution</CardTitle>
                      </CardHeader>
                      <CardContent className="px-0 pt-2 pb-4 sm:px-0 sm:pt-2">
                        <ChartContainer config={{ count: { color: "hsl(var(--zinc-600))" } }} className="aspect-auto h-[180px] w-full">
                          <BarChart 
                            data={demographicsData.ageData}
                            margin={{ left: -20, right: 20, top: 12, bottom: 12 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                            <XAxis dataKey="group" tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" />
                            <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Bar dataKey="count" fill="hsl(0, 0%, 40%)" radius={4} />
                          </BarChart>
                        </ChartContainer>
                      </CardContent>
                    </Card>
                  )}

                  {/* Top Locations */}
                  {demographicsData.locationData.length > 0 && (
                    <Card>
                      <CardHeader className="px-6 pt-6 pb-0">
                        <CardTitle className="text-sm">Top Locations</CardTitle>
                      </CardHeader>
                      <CardContent className="px-0 pt-2 pb-4 sm:px-0 sm:pt-2 flex flex-col items-center justify-center">
                        <div className="flex flex-row items-center justify-start gap-2 w-full px-4">
                          <div className="w-3/5 flex justify-end">
                            <ChartContainer config={{ visitors: { label: "Count" } }} className="aspect-square w-[120px]">
                              <PieChart>
                                <Pie
                                  data={demographicsData.locationData.map((d, i) => ({ ...d, fill: grayscalePalette[i % grayscalePalette.length] }))}
                                  dataKey="count"
                                  nameKey="name"
                                  outerRadius={60}
                                  innerRadius={25}
                                  paddingAngle={2}
                                >
                                  {demographicsData.locationData.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={grayscalePalette[index % grayscalePalette.length]} />
                                  ))}
                                </Pie>
                                <ChartTooltip content={<ChartTooltipContent />} />
                              </PieChart>
                            </ChartContainer>
                          </div>
                          <div className="w-2/5 flex flex-col gap-1 text-xs">
                            {demographicsData.locationData.slice(0, 3).map((d, i) => (
                              <div key={d.name} className="flex items-center gap-1">
                                <span
                                  className="inline-block h-2 w-2 rounded-sm"
                                  style={{ backgroundColor: grayscalePalette[i % grayscalePalette.length] }}
                                />
                                <span className="text-muted-foreground truncate">{d.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Top Occupations */}
                  {demographicsData.occupationData.length > 0 && (
                    <Card>
                      <CardHeader className="px-6 pt-6 pb-0">
                        <CardTitle className="text-sm">Top Occupations</CardTitle>
                      </CardHeader>
                      <CardContent className="px-6 pt-2 pb-4">
                        <ChartContainer config={{ 
                          count: { label: "Count", color: "hsl(0, 0%, 40%)" },
                          label: { color: "var(--background)" }
                        }} className="aspect-auto h-[180px] w-full">
                          <BarChart 
                            data={demographicsData.occupationData}
                            layout="vertical"
                            margin={{ left: 0, right: 16, top: 12, bottom: 12 }}
                          >
                            <CartesianGrid horizontal={false} />
                            <YAxis dataKey="name" type="category" tickLine={false} tickMargin={10} axisLine={false} hide />
                            <XAxis dataKey="count" type="number" hide />
                            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                            <Bar dataKey="count" layout="vertical" radius={4}>
                              {demographicsData.occupationData.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={grayscalePalette[index % grayscalePalette.length]} />
                              ))}
                              <LabelList dataKey="name" position="insideLeft" offset={8} fill="white" fontSize={10} />
                              <LabelList dataKey="count" position="right" offset={8} fill="hsl(var(--foreground))" fontSize={10} />
                            </Bar>
                          </BarChart>
                        </ChartContainer>
                      </CardContent>
                    </Card>
                  )}

                  {/* Political Views */}
                  {demographicsData.politicalData.length > 0 && (
                    <Card>
                      <CardHeader className="px-6 pt-6 pb-0">
                        <CardTitle className="text-sm">Political Views</CardTitle>
                      </CardHeader>
                      <CardContent className="px-6 pt-2 pb-4">
                        <ChartContainer config={{ 
                          count: { label: "Count", color: "hsl(0, 0%, 40%)" },
                          label: { color: "var(--background)" }
                        }} className="aspect-auto h-[180px] w-full">
                          <BarChart 
                            data={demographicsData.politicalData}
                            layout="vertical"
                            margin={{ left: 0, right: 16, top: 12, bottom: 12 }}
                          >
                            <CartesianGrid horizontal={false} />
                            <YAxis dataKey="name" type="category" tickLine={false} tickMargin={10} axisLine={false} hide />
                            <XAxis dataKey="count" type="number" hide />
                            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                            <Bar dataKey="count" layout="vertical" radius={4}>
                              {demographicsData.politicalData.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={grayscalePalette[index % grayscalePalette.length]} />
                              ))}
                              <LabelList dataKey="name" position="insideLeft" offset={8} fill="white" fontSize={10} />
                              <LabelList dataKey="count" position="right" offset={8} fill="hsl(var(--foreground))" fontSize={10} />
                            </Bar>
                          </BarChart>
                        </ChartContainer>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </section>

              {/* Respondents List */}
              <section className="space-y-4">
                <h2 className="text-xl font-semibold">All Respondents</h2>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Survey Responses ({responses.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Respondent</TableHead>
                          <TableHead>Age</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Occupation</TableHead>
                          <TableHead>Political Views</TableHead>
                          <TableHead>Submitted</TableHead>
                          <TableHead>Digital Twin</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {responses.map((response) => (
                          <TableRow 
                            key={response.id} 
                            className="cursor-pointer hover:bg-muted/50" 
                            onClick={() => router.push(`/surveys/${surveyId}/results/${response.id}`)}
                          >
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                {response.demographics?.name || 'Anonymous'}
                              </div>
                            </TableCell>
                            <TableCell>{response.demographics?.age || '—'}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-muted-foreground" />
                                {response.demographics?.location || '—'}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Briefcase className="h-3 w-3 text-muted-foreground" />
                                {response.demographics?.occupation || '—'}
                              </div>
                            </TableCell>
                            <TableCell>{response.demographics?.politicalViews || '—'}</TableCell>
                            <TableCell>
                              {formatDistanceToNow(new Date(response.submitted_at), { addSuffix: true })}
                            </TableCell>
                            <TableCell>
                              {response.agentToken ? (
                                <Badge variant="secondary">Available</Badge>
                              ) : (
                                <Badge variant="outline">—</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default SurveyResultsPage 