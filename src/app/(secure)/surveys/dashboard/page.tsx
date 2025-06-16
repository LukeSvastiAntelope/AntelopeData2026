'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { 
  ArrowLeft,
  BarChart3,
  Users,
  FileText,
  Brain,
  TrendingUp,
  Calendar,
  MapPin,
  Briefcase,
  GraduationCap,
  Activity,
  Eye,
  Loader2
} from "lucide-react"
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

interface DashboardData {
  overview: {
    total_surveys: number
    published_surveys: number
    draft_surveys: number
    total_responses: number
    total_digital_twins: number
  }
  responseTrends: Array<{
    date: string
    responses: number
  }>
  digitalTwinTrends: Array<{
    date: string
    digital_twins_created: number
  }>
  topSurveys: Array<{
    id: number
    title: string
    status: string
    created_at: string
    response_count: number
    digital_twins_count: number
  }>
  demographics: {
    ageGroups: Array<{ range: string; count: number }>
    topLocations: Array<{ location: string; count: number }>
    topOccupations: Array<{ occupation: string; count: number }>
    educationLevels: Array<{ level: string; count: number }>
  }
  recentActivity: Array<{
    type: string
    survey_title: string
    respondent_name: string
    timestamp: string
  }>
}

// Chart configurations with neutral zinc theme
const responseTrendsConfig = {
  responses: {
    label: "Responses",
    color: "hsl(var(--chart-1))",
  },
}

const ageDemographicsConfig = {
  count: {
    label: "Count",
    color: "hsl(var(--chart-1))",
  },
}

const SurveyDashboardPage = () => {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const response = await fetch('/api/surveys/dashboard', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        })
        
        if (response.ok) {
          const dashboardData = await response.json()
          setData(dashboardData)
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })
  }

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
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
            <p className="text-muted-foreground">Loading dashboard...</p>
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
            <p className="text-muted-foreground">Failed to load dashboard data</p>
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
            <Link href="/surveys" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium text-card-foreground">Survey Analytics Dashboard</h1>
          </div>
        </div>
        
        <div className="border-b border-border" />

        <div className="p-6 space-y-6">
          {/* Overview Stats */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <FileText className="h-8 w-8 text-blue-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">Total Surveys</p>
                    <p className="text-2xl font-bold">{data.overview.total_surveys}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <TrendingUp className="h-8 w-8 text-green-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">Published</p>
                    <p className="text-2xl font-bold">{data.overview.published_surveys}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <Users className="h-8 w-8 text-purple-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">Total Responses</p>
                    <p className="text-2xl font-bold">{data.overview.total_responses}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <Brain className="h-8 w-8 text-pink-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">Digital Twins</p>
                    <p className="text-2xl font-bold">{data.overview.total_digital_twins}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <BarChart3 className="h-8 w-8 text-orange-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">Avg per Survey</p>
                    <p className="text-2xl font-bold">
                      {data.overview.total_surveys > 0 
                        ? Math.round(data.overview.total_responses / data.overview.total_surveys)
                        : 0
                      }
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Response Trends */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Response Trends (Last 30 Days)
                </CardTitle>
                <CardDescription>
                  Daily survey responses over the past month
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={responseTrendsConfig} className="h-[200px] w-full">
                  <LineChart data={data.responseTrends} margin={{ left: 12, right: 12 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tickFormatter={formatDate}
                    />
                    <YAxis 
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                    />
                    <ChartTooltip 
                      content={
                        <ChartTooltipContent
                          labelFormatter={(value) => formatDate(value)}
                          nameKey="responses"
                        />
                      }
                    />
                    <Line 
                      type="monotone" 
                      dataKey="responses" 
                      stroke="hsl(var(--chart-1))"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Age Demographics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Age Demographics
                </CardTitle>
                <CardDescription>
                  Distribution of respondents by age group
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={ageDemographicsConfig} className="h-[200px] w-full">
                  <BarChart data={data.demographics.ageGroups} margin={{ left: 12, right: 12 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis 
                      dataKey="range" 
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                    />
                    <YAxis 
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                    />
                    <ChartTooltip 
                      content={
                        <ChartTooltipContent
                          nameKey="count"
                        />
                      }
                    />
                    <Bar 
                      dataKey="count" 
                      fill="hsl(var(--chart-1))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          {/* Top Surveys and Demographics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Performing Surveys */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Top Performing Surveys
                </CardTitle>
                <CardDescription>
                  Surveys ranked by response count
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.topSurveys.slice(0, 5).map((survey) => (
                    <div key={survey.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium truncate">{survey.title}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Badge variant={survey.status === 'published' ? 'default' : 'secondary'}>
                            {survey.status}
                          </Badge>
                          <span>•</span>
                          <Calendar className="h-3 w-3" />
                          {formatDate(survey.created_at)}
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-lg font-bold text-blue-600">{survey.response_count}</p>
                        <p className="text-xs text-muted-foreground">responses</p>
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-lg font-bold text-pink-600">{survey.digital_twins_count}</p>
                        <p className="text-xs text-muted-foreground">twins</p>
                      </div>
                      <Button variant="outline" size="sm" asChild className="ml-4">
                        <Link href={`/surveys/${survey.id}/analytics`}>
                          <Eye className="h-3 w-3" />
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Demographics Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Demographics Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Top Locations */}
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Top Locations
                  </h4>
                  <div className="space-y-1">
                    {data.demographics.topLocations.slice(0, 5).map((location, index) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span>{location.location}</span>
                        <span className="font-medium">{location.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Occupations */}
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Briefcase className="h-4 w-4" />
                    Top Occupations
                  </h4>
                  <div className="space-y-1">
                    {data.demographics.topOccupations.slice(0, 5).map((occupation, index) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span>{occupation.occupation}</span>
                        <span className="font-medium">{occupation.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Education Levels */}
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <GraduationCap className="h-4 w-4" />
                    Education Levels
                  </h4>
                  <div className="space-y-1">
                    {data.demographics.educationLevels.slice(0, 5).map((education, index) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span>{education.level}</span>
                        <span className="font-medium">{education.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Activity
              </CardTitle>
              <CardDescription>
                Latest survey responses and digital twin creations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 border rounded-lg">
                    <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900">
                      <Users className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">
                        {activity.respondent_name} responded to &quot;{activity.survey_title}&quot;
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatTimestamp(activity.timestamp)}
                      </p>
                    </div>
                    <Badge variant="outline">
                      <Brain className="h-3 w-3 mr-1" />
                      Digital Twin Created
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-4 pt-4">
            <Button asChild>
              <Link href="/create/survey">
                <FileText className="h-4 w-4 mr-2" />
                Create New Survey
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/surveys">
                <Eye className="h-4 w-4 mr-2" />
                View All Surveys
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/digital-twins">
                <Brain className="h-4 w-4 mr-2" />
                Explore Digital Twins
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SurveyDashboardPage 