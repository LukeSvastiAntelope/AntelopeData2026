'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { 
  FileText, 
  Users,
  BarChart3,
  Calendar,
  Eye,
  Edit,
  ExternalLink,
  Plus,
  Clock,
  X,
  Play,
  Upload,
  Database,
  Trash2,
  Copy,
  Brain,
  TrendingUp
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "@/components/ui/sonner"

// Charts & table utilities
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, CartesianGrid, XAxis, YAxis, LabelList } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table"
import { formatDistanceToNow } from "date-fns"


interface Survey {
  id: number
  title: string
  description: string
  slug: string
  status: 'draft' | 'scheduled' | 'active' | 'published' | 'closed' | 'archived' | 'stopped'
  is_public: boolean
  created_at: string
  response_count: number
  start_at?: string
  end_at?: string
  source?: 'native' | 'csv_import' | 'excel_import' | 'surveymonkey_import' | 'typeform_import' | 'google_forms_import' | 'google_sheets_import' | 'clone'
  source_metadata?: any
  parent_survey_id?: number
  is_template?: boolean
  clone_count?: number
  cloned_at?: string
}

interface DashboardStats {
  total_surveys: number
  published_surveys: number
  draft_surveys: number
  total_responses: number
  total_digital_twins: number
}

const SurveysPage = () => {
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const grayscalePalette = [
    'hsl(0, 0%, 9%)',   // Very dark gray (almost black)
    'hsl(0, 0%, 26%)',  // Dark gray
    'hsl(0, 0%, 40%)',  // Medium gray
    'hsl(0, 0%, 54%)',  // Light gray
    'hsl(0, 0%, 71%)',  // Very light gray
  ]

  /* --------------------------------------------------
   * Aggregated data for dashboard visualizations
   * -------------------------------------------------- */
  const aggregation = useMemo(() => {
    const statusCounts: Record<string, number> = {
      draft: 0,
      scheduled: 0,
      active: 0,
      published: 0,
      closed: 0,
      archived: 0
    }

    const monthlyData: Record<string, number> = {}
    const responseData: { range: string; count: number }[] = []

    surveys.forEach((survey) => {
      // Status distribution
      statusCounts[survey.status] += 1

      // Monthly creation data
      const month = new Date(survey.created_at).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short' 
      })
      monthlyData[month] = (monthlyData[month] || 0) + 1
    })

    // Response count distribution
    const responseBuckets = { '0': 0, '1-10': 0, '11-50': 0, '51-100': 0, '100+': 0 }
    surveys.forEach(survey => {
      const count = survey.response_count
      if (count === 0) responseBuckets['0']++
      else if (count <= 10) responseBuckets['1-10']++
      else if (count <= 50) responseBuckets['11-50']++
      else if (count <= 100) responseBuckets['51-100']++
      else responseBuckets['100+']++
    })

    const statusData = Object.entries(statusCounts).map(([status, count]) => ({ 
      status: status.charAt(0).toUpperCase() + status.slice(1), 
      count 
    }))

    const monthlyCreationData = Object.entries(monthlyData)
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .slice(-6) // Last 6 months
      .map(([month, count]) => ({ month, count }))

    const responseDistribution = Object.entries(responseBuckets).map(([range, count]) => ({ 
      range, 
      count 
    }))

    return { statusData, monthlyCreationData, responseDistribution }
  }, [surveys])

  // Load all surveys on component mount
  useEffect(() => {
    loadSurveys()
    fetchDashboardStats()
  }, [])

  const loadSurveys = async () => {
    try {
      const res = await fetch('/api/surveys')
      
      const data = await res.json()
      if (data.status) {
        setSurveys(data.surveys)
      }
    } catch (error) {
      console.error('Error loading surveys:', error)
    }
  }

  const fetchDashboardStats = async () => {
    try {
      // Fetch dashboard stats
      const dashboardResponse = await fetch('/api/surveys/dashboard')
      
      if (dashboardResponse.ok) {
        const data = await dashboardResponse.json()
        if (data.overview) {
          setStats(data.overview)
        }
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
      case 'published': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
      case 'scheduled': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
      case 'draft': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
      case 'stopped': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
      case 'closed': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
      case 'archived': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
    }
  }

  const getSourceInfo = (source?: string, sourceMetadata?: any) => {
    switch (source) {
      case 'csv_import': 
        return { 
          label: 'CSV', 
          icon: <Database className="h-3 w-3" />,
          tooltip: sourceMetadata?.originalFileName || 'Imported from CSV'
        }
      case 'excel_import': 
        return { 
          label: 'Excel', 
          icon: <Database className="h-3 w-3" />,
          tooltip: sourceMetadata?.originalFileName || 'Imported from Excel'
        }
      case 'surveymonkey_import': 
        return { 
          label: 'SurveyMonkey', 
          icon: <Database className="h-3 w-3" />,
          tooltip: 'Imported from SurveyMonkey'
        }
      case 'typeform_import': 
        return { 
          label: 'Typeform', 
          icon: <Database className="h-3 w-3" />,
          tooltip: 'Imported from Typeform'
        }
      case 'google_forms_import': 
        return { 
          label: 'Google Forms', 
          icon: <Database className="h-3 w-3" />,
          tooltip: 'Imported from Google Forms'
        }
      case 'google_sheets_import': 
        return { 
          label: 'Google Sheets', 
          icon: <Database className="h-3 w-3" />,
          tooltip: 'Imported from Google Sheets'
        }
      case 'clone': 
        return { 
          label: 'Clone', 
          icon: <FileText className="h-3 w-3" />,
          tooltip: sourceMetadata?.originalTitle ? `Cloned from "${sourceMetadata.originalTitle}"` : 'Cloned from another survey'
        }
      default: 
        return { 
          label: 'Native', 
          icon: <FileText className="h-3 w-3" />,
          tooltip: 'Created with Antelope'
        }
    }
  }

  const getTimeRemaining = (endAt: string) => {
    const end = new Date(endAt)
    const now = new Date()
    const diff = end.getTime() - now.getTime()
    
    if (diff <= 0) return null
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''}`
    return `${hours} hour${hours > 1 ? 's' : ''}`
  }

  const closeSurvey = async (surveyId: number) => {
    try {
      const res = await fetch(`/api/surveys/${surveyId}/close`, {
        method: 'POST'
      })
      
      if (res.ok) {
        loadSurveys() // Reload to show updated status
      }
    } catch (error) {
      console.error('Error closing survey:', error)
    }
  }

  const reopenSurvey = async (surveyId: number) => {
    try {
      const res = await fetch(`/api/surveys/${surveyId}/reopen`, {
        method: 'POST'
      })
      
      if (res.ok) {
        loadSurveys() // Reload to show updated status
      }
    } catch (error) {
      console.error('Error reopening survey:', error)
    }
  }

  const deleteSurvey = async (surveyId: number, surveyTitle: string, responseCount: number) => {
    const hasResponses = responseCount > 0
    const message = hasResponses 
      ? `Are you sure you want to delete "${surveyTitle}"? This survey has ${responseCount} response${responseCount > 1 ? 's' : ''}. This action cannot be undone.`
      : `Are you sure you want to delete "${surveyTitle}"? This action cannot be undone.`
    
    if (!confirm(message)) return

    try {
      const url = hasResponses 
        ? `/api/surveys/${surveyId}/delete?force=true`
        : `/api/surveys/${surveyId}/delete`
        
      const res = await fetch(url, {
        method: 'DELETE'
      })
      
      const data = await res.json()
      
      if (res.ok && data.status) {
        toast.success('Survey deleted successfully')
        loadSurveys() // Reload to show updated list
      } else {
        toast.error(data.message || 'Failed to delete survey')
      }
    } catch (error) {
      console.error('Error deleting survey:', error)
      toast.error('Failed to delete survey')
    }
  }

  const cloneSurvey = async (surveyId: number, surveyTitle: string) => {
    try {
      const res = await fetch(`/api/surveys/${surveyId}/clone`, {
        method: 'POST'
      })
      
      const data = await res.json()
      
      if (res.ok && data.status) {
        toast.success(`Survey "${surveyTitle}" cloned successfully as "${data.result.title}"`)
        loadSurveys() // Reload to show the new cloned survey
        // Optionally redirect to edit the cloned survey
        router.push(`/surveys/${data.result.surveyId}/edit`)
      } else {
        toast.error(data.message || 'Failed to clone survey')
      }
    } catch (error) {
      console.error('Error cloning survey:', error)
      toast.error('Failed to clone survey')
    }
  }

  const handleCampaignStatusChange = (surveyId: number, newStatus: string) => {
    // Reload surveys to reflect the status change
    loadSurveys()
    toast.success(`Campaign ${newStatus} successfully`)
  }

  if (loading) {
    return (
      <div className="flex-1 p-2 w-full bg-background">
        <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
          <div className="px-6 py-2">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <h1 className="text-base font-medium text-card-foreground">Surveys</h1>
            </div>
          </div>
          <div className="border-b border-border" />
          <div className="p-4 flex items-center justify-center">
            <div className="text-muted-foreground">Loading surveys...</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        {/* Header */}
        <div className="px-6 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <h1 className="text-base font-medium text-card-foreground">Surveys</h1>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline"
                size="sm"
                onClick={() => router.push('/surveys/import')}
              >
                <Upload className="h-3 w-3 mr-1.5" />
                Import Survey
              </Button>
              <Link href="/create">
                <Button size="sm">
                  <Plus className="h-3 w-3 mr-1.5" />
                  Create Survey
                </Button>
              </Link>
            </div>
          </div>
        </div>
        
        <div className="border-b border-border" />

        <div className="p-6 space-y-4">
          {/* Introduction */}
          <div className="text-left space-y-2 flex">
            <div className="flex-col mb-4">  
              <h2 className="text-3xl font-bold">Survey Management</h2>
              <p className="text-muted-foreground text-base max-w-2xl mx-auto mt-2">
                Create, manage, and analyze your surveys in one place. Build engaging surveys with AI assistance, import from popular platforms, and get real-time insights from your responses.
              </p>
            </div>
          </div>

          {surveys.length === 0 ? (
            /* Empty State */
            <div className="text-center space-y-4 py-12">
              <div className="flex items-center justify-center mb-4">
                <div className="p-3 rounded-full bg-primary/10">
                  <FileText className="h-8 w-8 text-primary" />
                </div>
              </div>
              <h2 className="text-2xl font-bold">No Surveys Yet</h2>
              <p className="text-muted-foreground text-base max-w-2xl mx-auto mt-2">
                Create your first survey to start collecting responses and insights from your audience.
              </p>
              <Link href="/create">
                <Button className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Survey
                </Button>
              </Link>
            </div>
          ) : (
                        <>
              {/* Dashboard Overview */}
              <section className="space-y-4">
                                 {/* Overview Stats Cards */}
                 {stats && (
                   <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                     <Card>
                       <CardContent className="p-4">
                         <div className="flex items-center">
                           <FileText className="h-6 w-6 text-blue-600" />
                           <div className="ml-3">
                             <p className="text-sm font-medium text-muted-foreground">Total Surveys</p>
                             <p className="text-xl font-bold">{stats.total_surveys}</p>
                           </div>
                         </div>
                       </CardContent>
                     </Card>

                     <Card>
                       <CardContent className="p-4">
                         <div className="flex items-center">
                           <TrendingUp className="h-6 w-6 text-green-600" />
                           <div className="ml-3">
                             <p className="text-sm font-medium text-muted-foreground">Published</p>
                             <p className="text-xl font-bold">{stats.published_surveys}</p>
                           </div>
                         </div>
                       </CardContent>
                     </Card>

                     <Card>
                       <CardContent className="p-4">
                         <div className="flex items-center">
                           <Users className="h-6 w-6 text-purple-600" />
                           <div className="ml-3">
                             <p className="text-sm font-medium text-muted-foreground">Total Responses</p>
                             <p className="text-xl font-bold">{stats.total_responses}</p>
                           </div>
                         </div>
                       </CardContent>
                     </Card>

                     <Card>
                       <CardContent className="p-4">
                         <div className="flex items-center">
                           <Brain className="h-6 w-6 text-pink-600" />
                           <div className="ml-3">
                             <p className="text-sm font-medium text-muted-foreground">Digital Twins</p>
                             <p className="text-xl font-bold">{stats.total_digital_twins}</p>
                           </div>
                         </div>
                       </CardContent>
                     </Card>

                     <Card>
                       <CardContent className="p-4">
                         <div className="flex items-center">
                           <BarChart3 className="h-6 w-6 text-orange-600" />
                           <div className="ml-3">
                             <p className="text-sm font-medium text-muted-foreground">Avg per Survey</p>
                             <p className="text-xl font-bold">
                               {stats.total_surveys > 0 
                                 ? Math.round(stats.total_responses / stats.total_surveys)
                                 : 0
                               }
                             </p>
                           </div>
                         </div>
                       </CardContent>
                     </Card>
                   </div>
                 )}





                {/* Surveys Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>All Surveys ({surveys.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Visibility</TableHead>
                          <TableHead>Responses</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {surveys.map((survey) => (
                          <TableRow key={survey.id}>
                            <TableCell>
                              <div>
                                <Link href={`/surveys/${survey.id}/results`} className="font-medium hover:text-primary cursor-pointer">
                                  {survey.title}
                                </Link>
                                {survey.description && (
                                  <div className="text-sm text-muted-foreground line-clamp-1">
                                    {survey.description}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={getStatusColor(survey.status)}>
                                {survey.status.charAt(0).toUpperCase() + survey.status.slice(1)}
                              </Badge>
                              {survey.status === 'active' && survey.end_at && (
                                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  Ends in {getTimeRemaining(survey.end_at)}
                                </div>
                              )}
                              {survey.status === 'scheduled' && survey.start_at && (
                                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  Starts {formatDistanceToNow(new Date(survey.start_at), { addSuffix: true })}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const sourceInfo = getSourceInfo(survey.source, survey.source_metadata);
                                return (
                                  <Badge variant="secondary" title={sourceInfo.tooltip}>
                                    <span className="flex items-center gap-1">
                                      {sourceInfo.icon}
                                      {sourceInfo.label}
                                    </span>
                                  </Badge>
                                );
                              })()}
                            </TableCell>
                            <TableCell>
                              <Badge variant={survey.is_public ? "default" : "secondary"}>
                                {survey.is_public ? "Public" : "Private"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Users className="h-4 w-4 text-muted-foreground" />
                                {survey.response_count}
                              </div>
                            </TableCell>
                            <TableCell>
                              {formatDistanceToNow(new Date(survey.created_at), { addSuffix: true })}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Link href={`/surveys/${survey.id}/edit`}>
                                  <Button variant="ghost" size="sm">
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </Link>
                                <Link href={`/surveys/${survey.id}/analytics`}>
                                  <Button variant="ghost" size="sm">
                                    <BarChart3 className="h-4 w-4" />
                                  </Button>
                                </Link>
                                {(survey.status === 'active' || survey.status === 'published') && (
                                  <Link href={`/survey/${survey.slug}`} target="_blank">
                                    <Button variant="ghost" size="sm">
                                      <ExternalLink className="h-4 w-4" />
                                    </Button>
                                  </Link>
                                )}
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => cloneSurvey(survey.id, survey.title)}
                                  title="Clone survey"
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                                {(survey.status === 'active' || survey.status === 'scheduled') && (
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => closeSurvey(survey.id)}
                                    title="Close survey"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                )}
                                {(survey.status === 'closed' || survey.status === 'stopped') && (
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => reopenSurvey(survey.id)}
                                    title="Reopen survey"
                                  >
                                    <Play className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => deleteSurvey(survey.id, survey.title, survey.response_count)}
                                  title="Delete survey"
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
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

          {/* Info Section */}
          <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                    Survey Management Features
                  </h4>
                  <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                    <li>• Create and customize surveys with various question types</li>
                    <li>• Track responses and analyze results in real-time</li>
                    <li>• Generate digital twins from survey responses</li>
                    <li>• Share surveys publicly or keep them private</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default SurveysPage