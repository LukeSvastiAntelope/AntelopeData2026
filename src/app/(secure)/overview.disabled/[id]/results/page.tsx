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
import { Loader2, ArrowLeft, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

interface SurveyResponse {
  id: number
  submitted_at: string
  demographics: { [key: string]: any }
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
  }
  responses: SurveyResponse[]
}

const SurveyResultsPage = () => {
  const params = useParams()
  const surveyId = params.id as string
  const router = useRouter()

  const [data, setData] = useState<SurveyAnalyticsApiResponse | null>(null)
  const [surveyTitle, setSurveyTitle] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [rowsPerPage, setRowsPerPage] = useState<number>(25)
  const [page, setPage] = useState<number>(0)

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
          setSurveyTitle(json.survey.title)
        }
      } catch (err) {
        console.error('Failed to fetch survey results', err)
      } finally {
        setLoading(false)
      }
    }

    fetchResults()
  }, [surveyId])

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Derived paginated slice
  const paginatedResponses = data ? data.responses.slice(page * rowsPerPage, (page + 1) * rowsPerPage) : []
  const pageCount = data ? Math.ceil(data.responses.length / rowsPerPage) : 0

  const handleRowsChange = (value: string) => {
    const num = parseInt(value)
    if (!isNaN(num)) {
      setRowsPerPage(num)
      setPage(0)
    }
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
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
                          <Link href="/overview" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium text-card-foreground">{surveyTitle ? `${surveyTitle} – Survey Results` : 'Survey Results'}</h1>
          </div>
        </div>

        <div className="border-b border-border" />

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Responder List */}
            <Card className="lg:col-span-3 w-full">
              <CardHeader>
                <CardTitle>Responders</CardTitle>
                <CardDescription>Select a responder to view their answers</CardDescription>
              </CardHeader>
              <CardContent>
                {data.responses.length === 0 ? (
                  <p className="text-center text-muted-foreground">No responses yet.</p>
                ) : (
                  <div className="rounded-lg border border-border overflow-auto max-h-[70vh]">
                    <div className="w-full overflow-auto">
                      <Table className="w-full">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Responder</TableHead>
                            <TableHead>Age</TableHead>
                            <TableHead>Location</TableHead>
                            <TableHead>Submitted</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedResponses.map((resp) => (
                            <TableRow 
                              key={resp.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => router.push(`/overview/${surveyId}/results/${resp.id}`)}
                            >
                              <TableCell className="font-medium whitespace-nowrap">
                                {resp.demographics?.name || resp.demographics?.email || `Responder #${resp.id}`}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{resp.demographics?.age || '-'}</TableCell>
                              <TableCell className="whitespace-nowrap">{resp.demographics?.location || '-'}</TableCell>
                              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(resp.submitted_at)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Detail view removed; navigation now occurs to separate page */}
          </div>

          {/* Bottom controls */}
          <div className="flex items-center justify-between space-x-4 py-4 px-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                Showing {data.responses.length === 0 ? 0 : page * rowsPerPage + 1}-
                {Math.min((page + 1) * rowsPerPage, data.responses.length)} of {data.responses.length}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <span>Rows per page</span>
                <Select value={rowsPerPage.toString()} onValueChange={handleRowsChange}>
                  <SelectTrigger className="h-8 w-16">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10,25,50,100].map(n => (
                      <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(p-1,0))} disabled={page === 0}>Previous</Button>
                <span className="text-sm">
                  {pageCount === 0 ? 0 : page + 1} of {pageCount === 0 ? 0 : pageCount}
                </span>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(p+1, pageCount-1))} disabled={page >= pageCount-1}>Next</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SurveyResultsPage 