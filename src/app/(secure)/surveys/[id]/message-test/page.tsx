'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Progress } from '@/components/ui/progress'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { ArrowLeft, Plus, Trash2, Play, Loader2, MessageSquare, BarChart3 } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'

interface MessageResult {
  messageIndex: number
  message: string
  reactions: Array<{
    agentToken: string
    demographics: Record<string, string>
    sentiment: string
    reaction: string
    convincingScore: number
  }>
  summary: {
    avgConvincingScore: number
    sentimentBreakdown: Record<string, number>
    totalResponses: number
  }
}

export default function MessageTestPage() {
  const params = useParams()
  const router = useRouter()
  const surveyId = params.id as string

  const [messages, setMessages] = useState<string[]>(['', ''])
  const [customQuestion, setCustomQuestion] = useState('')
  const [maxProfiles, setMaxProfiles] = useState(10)
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<MessageResult[] | null>(null)

  const addMessage = () => {
    if (messages.length < 4) {
      setMessages(prev => [...prev, ''])
    }
  }

  const removeMessage = (index: number) => {
    if (messages.length > 2) {
      setMessages(prev => prev.filter((_, i) => i !== index))
    }
  }

  const updateMessage = (index: number, value: string) => {
    setMessages(prev => prev.map((m, i) => i === index ? value : m))
  }

  const runTest = async () => {
    const validMessages = messages.filter(m => m.trim())
    if (validMessages.length < 2) {
      toast.error('Please enter at least 2 message variants')
      return
    }

    setIsRunning(true)
    setResults(null)

    try {
      const response = await fetch(`/api/surveys/${surveyId}/message-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          messages: validMessages,
          maxProfiles,
          question: customQuestion || undefined,
        }),
      })

      const data = await response.json()

      if (data.status) {
        setResults(data.results)
        toast.success(`Test complete! Tested against ${data.totalProfiles} voter profiles.`)
      } else {
        toast.error(data.message || 'Failed to run message test')
      }
    } catch (error) {
      console.error('Message test error:', error)
      toast.error('Failed to run message test')
    } finally {
      setIsRunning(false)
    }
  }

  const sentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'negative': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      case 'mixed': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
    }
  }

  const getWinnerIndex = () => {
    if (!results || results.length === 0) return -1
    let bestIdx = 0
    let bestScore = 0
    results.forEach((r, i) => {
      if (r.summary.avgConvincingScore > bestScore) {
        bestScore = r.summary.avgConvincingScore
        bestIdx = i
      }
    })
    return bestIdx
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
                    <BreadcrumbLink href={`/surveys/${surveyId}/analytics`}>Analytics</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Message Test</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </div>
        </div>

        <div className="border-b border-border" />

        <div className="p-6 space-y-6">
          {/* Intro */}
          <div>
            <h2 className="text-2xl font-bold mb-2">A/B Message Testing</h2>
            <p className="text-muted-foreground">
              Test different campaign messages against your survey&apos;s voter profiles. 
              Each message variant will be evaluated by synthetic voters based on their 
              demographics and political positions.
            </p>
          </div>

          {/* Message Variants */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  <CardTitle>Message Variants</CardTitle>
                </div>
                {messages.length < 4 && (
                  <Button variant="outline" size="sm" onClick={addMessage}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Variant
                  </Button>
                )}
              </div>
              <CardDescription>
                Enter 2-4 different message framings to compare. These could be different 
                policy pitches, attack/defense narratives, or communication styles.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {messages.map((msg, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="font-semibold">
                      Message {String.fromCharCode(65 + idx)}
                    </Label>
                    {messages.length > 2 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMessage(idx)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <Textarea
                    placeholder={`Enter message variant ${String.fromCharCode(65 + idx)}...`}
                    value={msg}
                    onChange={(e) => updateMessage(idx, e.target.value)}
                    rows={3}
                  />
                </div>
              ))}

              <div className="pt-2 space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Custom evaluation question (optional)
                </Label>
                <Textarea
                  placeholder="Default: What is your honest reaction to this message? Would it make you more or less likely to support the candidate?"
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="flex items-center gap-4 pt-2">
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Test with</Label>
                  <select
                    className="border rounded px-2 py-1 text-sm bg-background"
                    value={maxProfiles}
                    onChange={(e) => setMaxProfiles(parseInt(e.target.value))}
                  >
                    <option value={5}>5 profiles</option>
                    <option value={10}>10 profiles</option>
                    <option value={20}>20 profiles</option>
                    <option value={50}>50 profiles</option>
                  </select>
                </div>
                <Button onClick={runTest} disabled={isRunning}>
                  {isRunning ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Run Test
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          {results && (
            <div className="space-y-6">
              {/* Summary Comparison */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    <CardTitle>Results Summary</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {results.map((result, idx) => {
                      const isWinner = getWinnerIndex() === idx
                      return (
                        <div
                          key={idx}
                          className={`border rounded-lg p-4 ${isWinner ? 'border-primary bg-primary/5' : ''}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold">
                              Message {String.fromCharCode(65 + idx)}
                            </h4>
                            {isWinner && (
                              <Badge variant="default" className="text-xs">Winner</Badge>
                            )}
                          </div>
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Convincing Score</p>
                              <div className="flex items-center gap-2">
                                <span className="text-2xl font-bold">
                                  {result.summary.avgConvincingScore}
                                </span>
                                <span className="text-sm text-muted-foreground">/ 5</span>
                              </div>
                              <Progress
                                value={(result.summary.avgConvincingScore / 5) * 100}
                                className="h-2 mt-1"
                              />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Sentiment</p>
                              <div className="flex gap-1 flex-wrap">
                                {Object.entries(result.summary.sentimentBreakdown)
                                  .filter(([_, count]) => count > 0)
                                  .map(([sentiment, count]) => (
                                    <Badge key={sentiment} variant="outline" className={`text-xs ${sentimentColor(sentiment)}`}>
                                      {sentiment}: {count}
                                    </Badge>
                                  ))
                                }
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {result.summary.totalResponses} voter reactions
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Detailed Reactions */}
              {results.map((result, idx) => (
                <Card key={idx}>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Message {String.fromCharCode(65 + idx)} — Detailed Reactions
                    </CardTitle>
                    <CardDescription className="text-sm italic">
                      &quot;{result.message.slice(0, 150)}{result.message.length > 150 ? '...' : ''}&quot;
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {result.reactions.map((reaction, rIdx) => (
                        <div key={rIdx} className="border rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className={sentimentColor(reaction.sentiment)}>
                              {reaction.sentiment}
                            </Badge>
                            <Badge variant="outline">Score: {reaction.convincingScore}/5</Badge>
                            <span className="text-xs text-muted-foreground">
                              {[
                                reaction.demographics.age,
                                reaction.demographics.gender,
                                reaction.demographics.party_affiliation,
                                reaction.demographics.state
                              ].filter(Boolean).join(' · ')}
                            </span>
                          </div>
                          <p className="text-sm">{reaction.reaction}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
