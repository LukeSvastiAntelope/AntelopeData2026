'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SidebarTrigger } from "@/components/ui/sidebar"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { 
  Plus, 
  Eye, 
  Users, 
  Calendar,
  BarChart3,
  ExternalLink,
  Settings,
  Copy,
  CheckCircle,
  Brain,
  FileText,
  TrendingUp
} from "lucide-react"

interface Survey {
  id: number
  title: string
  description: string
  slug: string
  status: 'draft' | 'published' | 'closed'
  is_public: boolean
  created_at: string
  response_count: number
  created_by?: string
}

interface DashboardStats {
  total_surveys: number
  published_surveys: number
  draft_surveys: number
  total_responses: number
  total_digital_twins: number
}

const OverviewPage = () => {
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token')
      
      // Fetch surveys
      const surveyResponse = await fetch('/api/surveys', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (surveyResponse.ok) {
        const data = await surveyResponse.json()
        setSurveys(data.surveys || [])
      }

      // Fetch dashboard stats (simplified)
      const dashboardResponse = await fetch('/api/surveys/dashboard', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (dashboardResponse.ok) {
        const data = await dashboardResponse.json()
        if (data.overview) {
          setStats(data.overview)
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const copyPublicLink = async (slug: string) => {
    const publicUrl = `${window.location.origin}/survey/${slug}`
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopiedSlug(slug)
      setTimeout(() => setCopiedSlug(null), 2000)
    } catch (error) {
      console.error('Failed to copy link:', error)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
      case 'draft': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
      case 'closed': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  if (isLoading) {
    return (
      <div className="flex-1 p-2 w-full bg-background">
        <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
          <div className="p-6">
            <div className="text-center">Loading your surveys...</div>
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
              <h1 className="text-base font-medium text-card-foreground">Overview</h1>
            </div>
            <Button asChild>
              <Link href="/create/survey" className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Create Survey
              </Link>
            </Button>
          </div>
        </div>
        
        <div className="border-b border-border" />

        <div className="p-6 space-y-6">
          {/* Stats Cards - Simple version without charts */}
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

          {/* Surveys Grid */}
          <div>
            {surveys.length > 0 && <h2 className="text-lg font-semibold mb-4">My Surveys</h2>}
            {surveys.length === 0 ? (
              <div className="text-center py-12">
                <div className="flex items-center justify-center mb-4">
                  <div className="p-3 rounded-full bg-muted">
                    <BarChart3 className="h-8 w-8 text-muted-foreground" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold mb-2">No surveys yet</h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  Create your first survey to start collecting responses and building digital twin agents.
                </p>
                <Button asChild>
                  <Link href="/create/survey" className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Create Your First Survey
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {surveys.map((survey) => (
                  <Card key={survey.id} className="group hover:shadow-lg transition-all duration-200">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg line-clamp-2 mb-2">
                            {survey.title}
                          </CardTitle>
                          <CardDescription className="line-clamp-2">
                            {survey.description || 'No description provided'}
                          </CardDescription>
                        </div>
                        <Badge className={getStatusColor(survey.status)}>
                          {survey.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        {/* Stats */}
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            <span>{survey.response_count} responses</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            <span>{formatDate(survey.created_at)}</span>
                          </div>
                        </div>

                        {/* Public link for published surveys */}
                        {survey.status === 'published' && survey.is_public && (
                          <div className="p-2 bg-muted rounded-lg">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">Public Link:</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyPublicLink(survey.slug)}
                                className="h-6 px-2"
                              >
                                {copiedSlug === survey.slug ? (
                                  <CheckCircle className="h-3 w-3 text-green-600" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                            <div className="text-xs font-mono text-muted-foreground truncate">
                              /survey/{survey.slug}
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2">
                          {survey.status === 'published' && (
                            <Button variant="outline" size="sm" asChild className="flex-1">
                              <Link href={`/survey/${survey.slug}`} target="_blank">
                                <Eye className="h-3 w-3 mr-1" />
                                View
                                <ExternalLink className="h-3 w-3 ml-1" />
                              </Link>
                            </Button>
                          )}
                          <Button variant="outline" size="sm" asChild className="flex-1">
                            <Link href={`/overview/${survey.id}/edit`}>
                              <Settings className="h-3 w-3 mr-1" />
                              Edit
                            </Link>
                          </Button>
                          {survey.response_count > 0 && (
                            <Button variant="outline" size="sm" asChild className="flex-1">
                              <Link href={`/overview/${survey.id}/analytics`}>
                                <BarChart3 className="h-3 w-3 mr-1" />
                                Analytics
                              </Link>
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default OverviewPage 