"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts'
import { TrendingUp, Users, BarChart3, PieChart as PieChartIcon, Activity, Info, Loader2 } from 'lucide-react'

interface SurveyAnalyticsDashboardProps {
  surveyId: number
  className?: string
}

interface SchemaData {
  survey_meta: {
    id: number
    title: string
    total_respondents: number
    question_count: number
    data_quality_score: number
  }
  questions: Array<{
    id: number
    prompt: string
    detected_type: string
    detection_confidence: number
  }>
  demographics: Record<string, any>
  fact_sheet: {
    core_stats: any
    question_stats: Record<string, any>
  }
  usage_recommendations: Array<{
    type: string
    title: string
    description: string
    confidence?: string
    suggested_queries?: string[]
  }>
}

// Chart color scheme (ShadCN neutral zinc theme)
const CHART_COLORS = {
  primary: 'hsl(var(--primary))',
  secondary: 'hsl(var(--secondary))',
  muted: 'hsl(var(--muted))',
  accent: 'hsl(var(--accent))',
  zinc: ['#71717a', '#a1a1aa', '#d4d4d8', '#e4e4e7', '#f4f4f5', '#fafafa'],
  gradient: ['#18181b', '#27272a', '#3f3f46', '#52525b', '#71717a', '#a1a1aa']
}

export function SurveyAnalyticsDashboard({ surveyId, className }: SurveyAnalyticsDashboardProps) {
  const [schema, setSchema] = useState<SchemaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSchemaData()
  }, [surveyId])

  const fetchSchemaData = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/surveys/${surveyId}/schema`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch survey schema')
      }
      
      const data = await response.json()
      setSchema(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="flex items-center space-x-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Analyzing survey data...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !schema) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-muted-foreground">Failed to load analytics</p>
            <Button variant="outline" size="sm" onClick={fetchSchemaData} className="mt-2">
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={`space-y-8 ${className}`}>
      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Respondents</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{schema.survey_meta.total_respondents.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {schema.survey_meta.question_count} questions analyzed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Data Quality</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(schema.survey_meta.data_quality_score * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">
              <Badge variant={schema.survey_meta.data_quality_score >= 0.9 ? "default" : "secondary"} className="text-xs">
                {schema.survey_meta.data_quality_score >= 0.9 ? "Excellent" : "Good"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Question Types</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{schema.questions.length}</div>
            <p className="text-xs text-muted-foreground">
              {new Set(schema.questions.map(q => q.detected_type)).size} unique types
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Demographics</CardTitle>
            <PieChartIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(schema.demographics).length}</div>
            <p className="text-xs text-muted-foreground">
              Available for analysis
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Platform Adoption Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Platform Adoption</h3>
          <p className="text-sm text-muted-foreground">Social media platform usage patterns and adoption rates</p>
        </div>
        <PlatformAdoptionCharts factSheet={schema.fact_sheet} />
      </div>

      {/* Usage Patterns Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Usage Patterns</h3>
          <p className="text-sm text-muted-foreground">Daily usage statistics and behavioral patterns</p>
        </div>
        <UsagePatternsCharts factSheet={schema.fact_sheet} />
      </div>

      {/* Demographics Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Demographics</h3>
          <p className="text-sm text-muted-foreground">Age, gender, and other demographic breakdowns</p>
        </div>
        <DemographicsCharts demographics={schema.demographics} />
      </div>

      {/* Insights Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">AI Insights & Recommendations</h3>
          <p className="text-sm text-muted-foreground">Intelligent analysis and suggested questions</p>
        </div>
        <InsightsPanel 
          recommendations={schema.usage_recommendations} 
          questions={schema.questions}
          surveyMeta={schema.survey_meta}
        />
      </div>
    </div>
  )
}

// Platform Adoption Charts Component
function PlatformAdoptionCharts({ factSheet }: { factSheet: any }) {
  // Find platform adoption data
  const platformData = Object.values(factSheet.question_stats || {}).find((stats: any) => 
    stats.adoption_rates && Object.keys(stats.adoption_rates).length > 0
  ) as any

  if (!platformData?.adoption_rates) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">No platform adoption data available</p>
        </CardContent>
      </Card>
    )
  }

  // Prepare data for charts
  const adoptionData = Object.entries(platformData.adoption_rates)
    .map(([platform, stats]: [string, any]) => ({
      platform: platform.length > 12 ? platform.substring(0, 12) + '...' : platform,
      fullName: platform,
      percentage: stats.percentage,
      users: stats.users,
      rank: stats.rank
    }))
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 8) // Top 8 platforms

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Platform Adoption Rates
          </CardTitle>
          <CardDescription>
            Percentage of respondents using each platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              percentage: {
                label: "Adoption Rate",
                color: CHART_COLORS.primary,
              },
            }}
            className="h-64"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={adoptionData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="platform" 
                  className="text-xs fill-muted-foreground"
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis className="text-xs fill-muted-foreground" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar 
                  dataKey="percentage" 
                  fill={CHART_COLORS.primary}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Usage Patterns */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Usage Patterns
          </CardTitle>
          <CardDescription>
            Multi-platform vs single-platform users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Average platforms per user</span>
              <span className="font-semibold">{platformData.usage_patterns?.average_selections_per_user || 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Single platform users</span>
              <span className="font-semibold">{platformData.usage_patterns?.single_selection_users || 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Multi-platform users</span>
              <span className="font-semibold">{platformData.usage_patterns?.multi_selection_users || 'N/A'}</span>
            </div>
            
            {/* Simple usage pattern visualization */}
            {platformData.usage_patterns && (
              <div className="mt-4">
                <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                  <div 
                    className="bg-primary" 
                    style={{ 
                      width: `${(platformData.usage_patterns.single_selection_users / (platformData.usage_patterns.single_selection_users + platformData.usage_patterns.multi_selection_users)) * 100}%` 
                    }}
                  />
                  <div 
                    className="bg-secondary" 
                    style={{ 
                      width: `${(platformData.usage_patterns.multi_selection_users / (platformData.usage_patterns.single_selection_users + platformData.usage_patterns.multi_selection_users)) * 100}%` 
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Single</span>
                  <span>Multi</span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Usage Patterns Charts Component
function UsagePatternsCharts({ factSheet }: { factSheet: any }) {
  // Find usage statistics data
  const usageData = Object.values(factSheet.question_stats || {}).find((stats: any) => 
    stats.statistics && stats.statistics.mean !== undefined
  ) as any

  if (!usageData?.statistics) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">No usage statistics available</p>
        </CardContent>
      </Card>
    )
  }

  // Prepare distribution data
  const distributionData = usageData.distribution ? 
    Object.entries(usageData.distribution).map(([range, stats]: [string, any]) => ({
      range: range.replace('_hours', 'h'),
      count: stats.count,
      percentage: stats.percentage
    })) : []

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Statistics Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Usage Statistics
          </CardTitle>
          <CardDescription>
            Daily usage patterns and distribution
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{usageData.statistics.mean}</div>
                <div className="text-xs text-muted-foreground">Average hours/day</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-secondary">{usageData.statistics.median}</div>
                <div className="text-xs text-muted-foreground">Median hours/day</div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-lg font-semibold">{usageData.statistics.min}</div>
                <div className="text-xs text-muted-foreground">Minimum</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold">{usageData.statistics.max}</div>
                <div className="text-xs text-muted-foreground">Maximum</div>
              </div>
            </div>

            <div className="text-center pt-2 border-t">
              <div className="text-sm font-medium">Standard Deviation</div>
              <div className="text-lg">{usageData.statistics.std_dev}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Distribution Chart */}
      {distributionData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Usage Distribution
            </CardTitle>
            <CardDescription>
              How users are distributed across usage ranges
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                percentage: {
                  label: "Percentage",
                  color: CHART_COLORS.accent,
                },
              }}
              className="h-64"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={distributionData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="range" 
                    className="text-xs fill-muted-foreground"
                  />
                  <YAxis className="text-xs fill-muted-foreground" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area 
                    type="monotone" 
                    dataKey="percentage" 
                    stroke={CHART_COLORS.accent}
                    fill={CHART_COLORS.accent}
                    fillOpacity={0.6}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Demographics Charts Component
function DemographicsCharts({ demographics }: { demographics: Record<string, any> }) {
  if (!demographics || Object.keys(demographics).length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">No demographic data available</p>
        </CardContent>
      </Card>
    )
  }

  // Prepare age distribution data
  const ageData = demographics.age?.distribution ? 
    Object.entries(demographics.age.distribution).map(([group, stats]: [string, any]) => ({
      group,
      count: stats.count,
      percentage: stats.percentage
    })) : []

  // Prepare gender distribution data
  const genderData = demographics.gender?.distribution ? 
    Object.entries(demographics.gender.distribution).map(([gender, stats]: [string, any], index) => ({
      gender,
      count: stats.count,
      percentage: stats.percentage,
      fill: CHART_COLORS.zinc[index % CHART_COLORS.zinc.length]
    })) : []

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Age Distribution */}
      {ageData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Age Distribution
            </CardTitle>
            <CardDescription>
              Respondents by age group
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                percentage: {
                  label: "Percentage",
                  color: CHART_COLORS.primary,
                },
              }}
              className="h-64"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ageData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="group" 
                    className="text-xs fill-muted-foreground"
                  />
                  <YAxis className="text-xs fill-muted-foreground" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar 
                    dataKey="percentage" 
                    fill={CHART_COLORS.primary}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Gender Distribution */}
      {genderData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="h-4 w-4" />
              Gender Distribution
            </CardTitle>
            <CardDescription>
              Respondents by gender
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                percentage: {
                  label: "Percentage",
                  color: CHART_COLORS.secondary,
                },
              }}
              className="h-64"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={genderData}
                    dataKey="percentage"
                    nameKey="gender"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ gender, percentage }) => `${gender}: ${percentage}%`}
                  >
                    {genderData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Insights Panel Component
function InsightsPanel({ 
  recommendations, 
  questions, 
  surveyMeta 
}: { 
  recommendations: any[], 
  questions: any[], 
  surveyMeta: any 
}) {
  return (
    <div className="space-y-4">
      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-4 w-4" />
            Analysis Recommendations
          </CardTitle>
          <CardDescription>
            Suggested analyses based on your survey data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recommendations.map((rec, index) => (
              <div key={index} className="flex items-start space-x-3 p-3 rounded-lg bg-muted/50">
                <Badge variant={rec.type === 'quality_warning' ? 'destructive' : 'default'}>
                  {rec.confidence || rec.type.split('_')[0]}
                </Badge>
                <div className="flex-1">
                  <div className="font-medium">{rec.title}</div>
                  <div className="text-sm text-muted-foreground">{rec.description}</div>
                  {rec.suggested_queries && (
                    <div className="mt-2">
                      <div className="text-xs font-medium mb-1">Try asking:</div>
                      <div className="space-y-1">
                        {rec.suggested_queries.slice(0, 2).map((query: string, qIndex: number) => (
                          <div key={qIndex} className="text-xs bg-background px-2 py-1 rounded border">
                            &ldquo;{query}&rdquo;
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Question Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Question Analysis</CardTitle>
          <CardDescription>
            Detected question types and analysis potential
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {questions.map((question, index) => (
              <div key={index} className="flex items-center justify-between p-2 rounded border">
                <div className="flex-1">
                  <div className="font-medium text-sm">{question.prompt.substring(0, 60)}...</div>
                  <div className="text-xs text-muted-foreground">
                    Type: {question.detected_type.replace('_', ' ')} 
                    • Confidence: {(question.detection_confidence * 100).toFixed(0)}%
                  </div>
                </div>
                <Badge variant="outline">
                  {question.detected_type}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 