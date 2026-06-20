"use client"

import React, { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
// import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, AreaChart, Area, ScatterChart, Scatter, LineChart, Line } from 'recharts'
import { TrendingUp, Users, BarChart3, PieChart as PieChartIcon, Activity, Info, Loader2, Brain, Lightbulb, Target, AlertTriangle, CheckCircle, Clock, Zap, Download } from 'lucide-react'

interface SurveyAnalyticsDashboardProps {
  surveyId: number
  className?: string
}

interface AIAnalyticsData {
  hasAnalytics: boolean
  status?: string
  message?: string
  analysis?: {
    surveyType: string
    mainThemes: string[]
    analysisComplexity: string
    estimatedAnalysisTime: number
  }
  insights?: {
    executiveSummary: string
    keyFindings: Array<{
      title: string
      description: string
      confidence: string
      priority: string
      statisticalEvidence: string
      businessImplication: string
    }>
    recommendations: Array<{
      category: string
      recommendation: string
      rationale: string
      priority: string
      timeframe: string
    }>
    dataQuality: {
      responseRate: number
      completeness: number
      reliability: string
      limitations: string[]
    }
  }
  dashboard?: {
    title: string
    description: string
    charts: Array<{
      id: string
      type: string
      title: string
      description: string
      data: any[]
      insights: {
        keyTakeaway: string
        statisticalSignificance: boolean
        businessRelevance: string
        actionableInsight: string
      }
      priority: number
      category: string
    }>
  }
  performance?: {
    totalTimeMs: number
    analysisTimeMs: number
    queryTimeMs: number
    insightTimeMs: number
    visualizationTimeMs: number
  }
  dataQuality?: {
    responseCount: number
    completenessScore: number
    reliabilityAssessment: string
    limitations: string[]
  }
  metadata?: {
    modelsUsed: {
      analysis: string
      queries: string
      insights: string
      visualization: string
    }
    generatedAt: string
    cacheStatus: any
  }
}

// Chart color scheme (ShadCN radix-nova neutral theme)
const CHART_COLORS = {
  primary: 'var(--primary)',
  secondary: 'var(--secondary)',
  muted: 'var(--muted)',
  accent: 'var(--accent)',
  zinc: ['#71717a', '#a1a1aa', '#d4d4d8', '#e4e4e7', '#f4f4f5', '#fafafa'],
  gradient: ['#18181b', '#27272a', '#3f3f46', '#52525b', '#71717a', '#a1a1aa']
}

export function SurveyAnalyticsDashboard({ surveyId, className }: SurveyAnalyticsDashboardProps) {
  const [aiAnalytics, setAiAnalytics] = useState<AIAnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAIAnalytics()
  }, [surveyId])

  const fetchAIAnalytics = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/surveys/${surveyId}/ai-analytics`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch AI analytics')
      }
      
      const data = await response.json()
      setAiAnalytics(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const generateAIAnalytics = async () => {
    try {
      setGenerating(true)
      setError(null)
      
      const response = await fetch(`/api/surveys/${surveyId}/ai-analytics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          analysisModel: 'gpt-4o',
          queryModel: 'gpt-4o-mini',
          insightModel: 'gpt-4o',
          visualizationModel: 'gpt-4o',
          maxCharts: 8,
          includeRawData: true,
          forceRegenerate: true
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to generate AI analytics')
      }
      
      const data = await response.json()
      
      if (data.success) {
        // Refresh the analytics data
        await fetchAIAnalytics()
      } else {
        throw new Error(data.details || 'Failed to generate analytics')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setGenerating(false)
    }
  }

  // Export the rendered report to PDF via the browser's print dialog ("Save as
  // PDF"). Unlike html2canvas, native print renders Recharts SVGs and the app's
  // oklch() theme colors correctly, and needs no extra dependencies. A scoped
  // print stylesheet (globals.css) hides the app chrome and isolates the report.
  const handleExportPdf = () => {
    if (typeof window === 'undefined') return
    const body = document.body
    const cleanup = () => {
      body.classList.remove('printing-report', 'preparing-print')
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    // Reveal all (forceMount'd) tab panels on screen first so Recharts'
    // ResizeObserver can measure and render the SVGs that were display:none in
    // inactive tabs — otherwise the charts print as empty boxes. We also fire
    // resize events to force every ResponsiveContainer to remeasure now that
    // its panel is visible.
    body.classList.add('preparing-print')
    const fireResize = () => window.dispatchEvent(new Event('resize'))
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        fireResize()
        window.setTimeout(fireResize, 150)
        window.setTimeout(() => {
          fireResize()
          body.classList.add('printing-report')
          window.print()
          // Fallback in case afterprint never fires (some browsers)
          window.setTimeout(cleanup, 1000)
        }, 500)
      })
    })
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="flex items-center space-x-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading AI analytics...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center space-y-4">
            <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
            <div>
              <p className="font-medium">Failed to load AI analytics</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={fetchAIAnalytics}>
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // If no analytics exist, show generation prompt
  if (!aiAnalytics?.hasAnalytics) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            AI-Powered Analytics
          </CardTitle>
          <CardDescription>
            Generate intelligent insights and visualizations using AI
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-lg border bg-blue-50 dark:bg-blue-950/20">
            <Info className="h-4 w-4 text-blue-600 mt-0.5" />
            <p className="text-sm text-blue-800 dark:text-blue-200">
              {aiAnalytics?.message || 'AI analytics not generated yet. Click below to create comprehensive insights.'}
            </p>
          </div>
          
          <div className="text-center space-y-4">
            <div className="space-y-2">
              <h4 className="font-medium">What you&apos;ll get:</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>Executive Summary</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>Key Findings</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>Business Recommendations</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>Smart Visualizations</span>
                </div>
              </div>
            </div>
            
            <Button 
              onClick={generateAIAnalytics} 
              disabled={generating}
              className="w-full"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Generating AI Analytics...
                </>
              ) : (
                <>
                  <Brain className="h-4 w-4 mr-2" />
                  Generate AI Analytics
                </>
              )}
            </Button>
            
            {generating && (
              <p className="text-sm text-muted-foreground">
                This may take 30-60 seconds as AI analyzes your survey data...
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div id="ai-analytics-report" className={`space-y-8 ${className}`}>
      {/* AI Analytics Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                AI Analytics Dashboard
              </CardTitle>
              <CardDescription>
                {aiAnalytics.dashboard?.description || 'Intelligent insights powered by AI'}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 no-print">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPdf}
              >
                <Download className="h-4 w-4" />
                Export PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={generateAIAnalytics}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Regenerate
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Survey Type</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{aiAnalytics.analysis?.surveyType || 'Unknown'}</div>
            <p className="text-xs text-muted-foreground">
              {aiAnalytics.analysis?.analysisComplexity || 'Unknown'} complexity
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Response Count</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{aiAnalytics.dataQuality?.responseCount?.toLocaleString() || 'N/A'}</div>
            <p className="text-xs text-muted-foreground">
              {aiAnalytics.dataQuality?.completenessScore || 0}% completion rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Data Quality</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{aiAnalytics.dataQuality?.reliabilityAssessment || 'Unknown'}</div>
            <Badge variant={
              aiAnalytics.dataQuality?.reliabilityAssessment === 'High' ? 'default' : 
              aiAnalytics.dataQuality?.reliabilityAssessment === 'Good' ? 'secondary' : 'outline'
            } className="text-xs">
              Reliability
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI Models</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{aiAnalytics.dashboard?.charts?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Charts generated
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="insights" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="insights" className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            Insights
          </TabsTrigger>
          <TabsTrigger value="visualizations" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Visualizations
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Performance
          </TabsTrigger>
        </TabsList>

        {/* forceMount keeps every panel in the DOM so PDF export (print) can
            reveal all sections at once via the print CSS. In normal view,
            data-[state=inactive]:hidden restores proper tab switching (without
            it, forceMount leaves all panels visible & stacked). */}
        <TabsContent value="insights" className="space-y-6 print-tab data-[state=inactive]:hidden" forceMount>
          <InsightsSection insights={aiAnalytics.insights} analysis={aiAnalytics.analysis} />
        </TabsContent>

        <TabsContent value="visualizations" className="space-y-6 print-tab data-[state=inactive]:hidden" forceMount>
          <VisualizationsSection dashboard={aiAnalytics.dashboard} />
        </TabsContent>

        <TabsContent value="performance" className="space-y-6 print-tab data-[state=inactive]:hidden" forceMount>
          <PerformanceSection
            performance={aiAnalytics.performance}
            metadata={aiAnalytics.metadata}
            dataQuality={aiAnalytics.dataQuality}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Insights Section Component
function InsightsSection({ insights, analysis }: { insights?: any, analysis?: any }) {
  if (!insights) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">No insights available</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Executive Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Executive Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg leading-relaxed">{insights.executiveSummary}</p>
          
          {analysis?.mainThemes && (
            <div className="mt-4">
              <h4 className="font-medium mb-2">Key Themes:</h4>
              <div className="flex flex-wrap gap-2">
                {analysis.mainThemes.map((theme: string, index: number) => (
                  <Badge key={index} variant="secondary">{theme}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Key Findings */}
      {insights.keyFindings && insights.keyFindings.length > 0 && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              Key Findings
          </CardTitle>
          <CardDescription>
              {insights.keyFindings.length} important insights discovered
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
              {insights.keyFindings.map((finding: any, index: number) => (
                <div key={index} className="border-l-4 border-primary pl-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <h4 className="font-medium">{finding.title}</h4>
                    <div className="flex gap-2">
                      <Badge variant={finding.priority === 'critical' ? 'destructive' : 'default'}>
                        {finding.priority}
                      </Badge>
                      <Badge variant="outline">
                        {finding.confidence} confidence
                      </Badge>
            </div>
            </div>
                  <p className="text-muted-foreground">{finding.description}</p>
                  <div className="text-sm">
                    <p><strong>Evidence:</strong> {finding.statisticalEvidence}</p>
                    <p><strong>Business Impact:</strong> {finding.businessImplication}</p>
            </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
      )}

      {/* Recommendations */}
      {insights.recommendations && insights.recommendations.length > 0 && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Recommendations
          </CardTitle>
          <CardDescription>
              Actionable next steps based on the analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
              {insights.recommendations.map((rec: any, index: number) => (
                <div key={index} className="p-4 rounded-lg border bg-muted/50">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium">{rec.recommendation}</h4>
                    <div className="flex gap-2">
                      <Badge variant={rec.priority === 'high' ? 'destructive' : 'secondary'}>
                        {rec.priority}
                      </Badge>
                      <Badge variant="outline">
                        {rec.timeframe}
                      </Badge>
              </div>
            </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    <strong>Category:</strong> {rec.category}
                  </p>
                  <p className="text-sm">{rec.rationale}</p>
              </div>
              ))}
          </div>
        </CardContent>
      </Card>
      )}

      {/* Data Quality */}
      {insights.dataQuality && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Data Quality Assessment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{insights.dataQuality.responseRate}%</div>
                <div className="text-sm text-muted-foreground">Response Rate</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{insights.dataQuality.completeness}%</div>
                <div className="text-sm text-muted-foreground">Completeness</div>
              </div>
            </div>
            
            <div className="space-y-2">
              <div>
                <strong>Reliability:</strong> {insights.dataQuality.reliability}
              </div>
              {insights.dataQuality.limitations && insights.dataQuality.limitations.length > 0 && (
                <div>
                  <strong>Limitations:</strong>
                  <ul className="list-disc list-inside text-sm text-muted-foreground mt-1">
                    {insights.dataQuality.limitations.map((limitation: string, index: number) => (
                      <li key={index}>{limitation}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Visualizations Section Component
function VisualizationsSection({ dashboard }: { dashboard?: any }) {
  if (!dashboard?.charts || dashboard.charts.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">No visualizations available</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        {dashboard.charts.map((chart: any, index: number) => (
          <ChartCard key={chart.id || index} chart={chart} />
        ))}
      </div>
    </div>
  )
}

// Measures its own width with a ResizeObserver and passes an explicit pixel
// width to recharts. ResponsiveContainer measures 0 inside these tab/grid
// cards (especially when the panel mounts while display:none), leaving charts
// blank — explicit width renders reliably and works for the PDF export too.
function MeasuredChart({ height = 300, children }: { height?: number; children: (width: number) => React.ReactElement }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let timer = 0
    // Poll until the element is actually laid out with a non-zero width. The
    // panel mounts while display:none (forceMount, inactive tab) so clientWidth
    // starts at 0, and ResizeObserver does not reliably fire on the
    // display:none -> block transition — so we keep polling (via setTimeout,
    // which fires in every environment) until the panel becomes visible.
    const measure = () => {
      const w = el.clientWidth
      if (w > 0) setWidth(w)
      else timer = window.setTimeout(measure, 100)
    }
    measure()
    const ro = new ResizeObserver(() => { const w = el.clientWidth; if (w > 0) setWidth(w) })
    ro.observe(el)
    return () => { window.clearTimeout(timer); ro.disconnect() }
  }, [])
  return <div ref={ref} className="w-full" style={{ height }}>{width > 0 ? children(width) : null}</div>
}

// Chart Card Component
function ChartCard({ chart }: { chart: any }) {
  const renderChart = () => {
    if (!chart.data || chart.data.length === 0) {
      return (
        <div className="h-64 flex items-center justify-center text-muted-foreground">
          No data available
        </div>
      )
    }

    switch (chart.type) {
      case 'bar':
        return (
          <MeasuredChart height={300}>
            {(w) => (
            <BarChart width={w} height={300} data={chart.data}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey={chart.chartConfig?.xAxis?.key || 'category'} className="text-xs" />
              <YAxis className="text-xs" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                dataKey={chart.chartConfig?.yAxis?.key || 'value'}
                    fill={CHART_COLORS.primary}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
            )}
              </MeasuredChart>
        )
      
      case 'pie':
        return (
          <MeasuredChart height={300}>
            {(w) => (
                <PieChart width={w} height={300}>
                  <Pie
                data={chart.data}
                dataKey={chart.chartConfig?.yAxis?.key || 'value'}
                nameKey={chart.chartConfig?.xAxis?.key || 'name'}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                label={({ name, value }) => `${name}: ${value}`}
                  >
                {chart.data.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS.zinc[index % CHART_COLORS.zinc.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
            )}
              </MeasuredChart>
        )

      case 'scatter':
        return (
          <MeasuredChart height={300}>
            {(w) => (
            <ScatterChart width={w} height={300} data={chart.data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey={chart.chartConfig?.xAxis?.key || 'x'}
                type="number"
                className="text-xs"
                name={chart.chartConfig?.xAxis?.label || 'X Axis'}
              />
              <YAxis
                dataKey={chart.chartConfig?.yAxis?.key || 'y'}
                type="number"
                className="text-xs"
                name={chart.chartConfig?.yAxis?.label || 'Y Axis'}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Scatter
                dataKey={chart.chartConfig?.yAxis?.key || 'y'}
                fill={CHART_COLORS.primary}
              />
            </ScatterChart>
            )}
          </MeasuredChart>
        )

      case 'heatmap':
        // Custom heatmap implementation using CSS Grid
        const renderHeatmap = () => {
          if (!chart.data || chart.data.length === 0) {
            return <p className="text-center text-muted-foreground">No data available for heatmap</p>
          }

          // Get unique values for x and y axes to create grid
          const xKey = chart.chartConfig?.xAxis?.key || 'x'
          const yKey = chart.chartConfig?.yAxis?.key || 'y'
          const valueKey = 'response_count'
          
          const xValues = [...new Set(chart.data.map((item: any) => item[xKey]))].sort()
          const yValues = [...new Set(chart.data.map((item: any) => item[yKey]))].sort()
          const allValues = chart.data.map((item: any) => item[valueKey] || 0)
          const maxValue = Math.max(...allValues)
          const minValue = Math.min(...allValues)
          
          return (
            <div className="space-y-3">
               {/* Axis question labels removed (now in header) */}
              <div 
                className="grid gap-[2px] mx-auto w-full"
                style={{ 
                  gridTemplateColumns: `auto repeat(${xValues.length}, 1fr)`,
                  width: '100%'
                }}
              >
                {/* Empty corner cell */}
                <div className="w-12 h-6"></div>
                
                                 {/* X-axis labels */}
                 {xValues.map((xVal, i) => (
                   <div key={`x-${i}`} className="text-[11px] text-center px-2 py-0.5 font-medium min-w-16">
                     {String(xVal)}
                   </div>
                 ))}
                
                {/* Grid cells */}
                {yValues.map((yVal, yIndex) => (
                  <React.Fragment key={`row-${yIndex}`}>
                                         {/* Y-axis label */}
                     <div className="text-[11px] text-right px-2 py-0.5 font-medium whitespace-nowrap">
                       {String(yVal)}
                     </div>
                    
                    {/* Data cells */}
                    {xValues.map((xVal, xIndex) => {
                      const dataPoint = chart.data.find((item: any) => 
                        item[xKey] === xVal && item[yKey] === yVal
                      )
                      const value = dataPoint?.[valueKey] || 0
                      const intensity = maxValue > 0 ? (value - minValue) / (maxValue - minValue) : 0
                      
                      return (
                        <div
                          key={`cell-${xIndex}-${yIndex}`}
                          className="h-6 min-w-16 border border-border/20 flex items-center justify-center text-[11px] font-medium rounded"
                          style={{
                            backgroundColor: `color-mix(in oklch, var(--primary) ${(0.1 + intensity * 0.7) * 100}%, transparent)`,
                            color: intensity > 0.5 ? 'var(--primary-foreground)' : 'var(--foreground)'
                          }}
                          title={`${xVal} × ${yVal}: ${value}`}
                        >
                          {value}
                        </div>
                      )
                    })}
                  </React.Fragment>
                ))}
              </div>
              {/* Legend */}
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground">Least ({minValue})</span>
                <div
                  className="h-2 w-32 rounded bg-gradient-to-r"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, color-mix(in oklch, var(--primary) 10%, transparent), color-mix(in oklch, var(--primary) 80%, transparent))'
                  }}
                />
                <span className="text-xs text-muted-foreground">Most ({maxValue})</span>
              </div>
              {/* Caption removed to reduce redundancy */}
            </div>
          )
        }
        
        return (
          <div className="overflow-auto p-4">
            {renderHeatmap()}
          </div>
        )

      case 'line':
        return (
          <MeasuredChart height={300}>
            {(w) => (
            <LineChart width={w} height={300} data={chart.data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey={chart.chartConfig?.xAxis?.key || 'category'} className="text-xs" />
              <YAxis className="text-xs" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey={chart.chartConfig?.yAxis?.key || 'value'}
                stroke={CHART_COLORS.primary}
                strokeWidth={2}
                dot={{ fill: CHART_COLORS.primary, strokeWidth: 2, r: 4 }}
              />
            </LineChart>
            )}
          </MeasuredChart>
        )

      case 'area':
        return (
          <MeasuredChart height={300}>
            {(w) => (
            <AreaChart width={w} height={300} data={chart.data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey={chart.chartConfig?.xAxis?.key || 'category'} className="text-xs" />
              <YAxis className="text-xs" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey={chart.chartConfig?.yAxis?.key || 'value'}
                stroke={CHART_COLORS.primary}
                fill={CHART_COLORS.primary}
                fillOpacity={0.3}
              />
            </AreaChart>
            )}
          </MeasuredChart>
        )
      
      default:
        return (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            Chart type {chart.type} not supported yet
          </div>
        )
    }
  }

  // Determine redundancy for non-heatmap charts
  const rawTitle = chart.title as string;

  return (
    <Card>
      <CardHeader>
        {chart.type === 'heatmap' ? (
          <CardTitle className="text-base font-semibold whitespace-normal">
            X: {chart.chartConfig?.xAxis?.label}<br/>
            Y: {chart.chartConfig?.yAxis?.label}
          </CardTitle>
        ) : (
           <>
             <CardTitle className="text-lg font-semibold">{rawTitle}</CardTitle>
           </>
        )}
      </CardHeader>
      <CardContent>
        {renderChart()}
        
        {chart.insights && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="flex items-center gap-1 whitespace-normal text-sm font-medium px-3 py-1">
              <Lightbulb className="h-4 w-4" />
              {chart.insights.keyTakeaway}
            </Badge>
            {chart.insights.statisticalSignificance && (
              <Badge variant="default" className="text-xs">
                Statistically Significant
              </Badge>
            )}
          </div>
        )}
          </CardContent>
        </Card>
  )
}

// Performance Section Component
function PerformanceSection({ performance, metadata, dataQuality }: { 
  performance?: any, 
  metadata?: any, 
  dataQuality?: any 
}) {
  return (
    <div className="space-y-6">
      {/* Performance Metrics */}
      {performance && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Generation Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{Math.round(performance.totalTimeMs / 1000)}s</div>
                <div className="text-xs text-muted-foreground">Total Time</div>
                          </div>
              <div className="text-center">
                <div className="text-lg font-semibold">{Math.round(performance.analysisTimeMs / 1000)}s</div>
                <div className="text-xs text-muted-foreground">Analysis</div>
                      </div>
              <div className="text-center">
                <div className="text-lg font-semibold">{Math.round(performance.queryTimeMs / 1000)}s</div>
                <div className="text-xs text-muted-foreground">Queries</div>
                    </div>
              <div className="text-center">
                <div className="text-lg font-semibold">{Math.round(performance.insightTimeMs / 1000)}s</div>
                <div className="text-xs text-muted-foreground">Insights</div>
                </div>
              <div className="text-center">
                <div className="text-lg font-semibold">{Math.round(performance.visualizationTimeMs / 1000)}s</div>
                <div className="text-xs text-muted-foreground">Charts</div>
              </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* AI Models Used */}
      {metadata?.modelsUsed && (
      <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              AI Models Used
            </CardTitle>
        </CardHeader>
        <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="font-medium">Analysis</div>
                <div className="text-sm text-muted-foreground">{metadata.modelsUsed.analysis}</div>
              </div>
              <div>
                <div className="font-medium">Queries</div>
                <div className="text-sm text-muted-foreground">{metadata.modelsUsed.queries}</div>
                  </div>
              <div>
                <div className="font-medium">Insights</div>
                <div className="text-sm text-muted-foreground">{metadata.modelsUsed.insights}</div>
                </div>
              <div>
                <div className="font-medium">Visualization</div>
                <div className="text-sm text-muted-foreground">{metadata.modelsUsed.visualization}</div>
              </div>
            </div>
            
            <div className="mt-4 text-sm text-muted-foreground">
              Generated at: {new Date(metadata.generatedAt).toLocaleString()}
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  )
} 