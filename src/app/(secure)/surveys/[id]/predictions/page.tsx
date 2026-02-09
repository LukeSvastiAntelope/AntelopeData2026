'use client'

import { useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  BarChart3,
  TrendingUp,
  Users,
  Target,
  Loader2,
  AlertCircle,
  Trophy,
  ArrowUp,
  ArrowDown,
  Minus,
  Info,
} from 'lucide-react'
import toast from 'react-hot-toast'

// -----------------------------------------------------------------------
// Types (mirrors API response)
// -----------------------------------------------------------------------

interface CandidateResult {
  name: string
  rawSupport: number
  likelyVoterSupport: number
  winProbability: number
  marginOfError: number
}

interface SegmentBreakdown {
  segment: string
  sampleSize: number
  candidateSupport: Record<string, number>
  turnoutEstimate: number
}

interface KeyDriver {
  segment: string
  impact: 'high' | 'medium' | 'low'
  description: string
}

interface PredictionResult {
  candidates: CandidateResult[]
  totalSampleSize: number
  likelyVoterSampleSize: number
  segmentBreakdowns: SegmentBreakdown[]
  keyDrivers: KeyDriver[]
  overallMarginOfError: number
  confidenceLevel: number
  methodology: string
}

interface WaveTrend {
  waveNumber: number
  surveyId: number
  title: string
  candidates: Array<{ name: string; likelyVoterSupport: number; winProbability: number }>
  sampleSize: number
}

// -----------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------

export default function PredictionsPage() {
  const params = useParams()
  const surveyId = params.id as string

  const [candidateQuestion, setCandidateQuestion] = useState('')
  const [candidateInput, setCandidateInput] = useState('')
  const [includeWaves, setIncludeWaves] = useState(false)
  const [loading, setLoading] = useState(false)
  const [prediction, setPrediction] = useState<PredictionResult | null>(null)
  const [waveTrends, setWaveTrends] = useState<WaveTrend[] | null>(null)

  const handleRun = useCallback(async () => {
    const candidates = candidateInput
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)

    if (!candidateQuestion.trim()) {
      toast.error('Enter the question key that identifies the head-to-head question')
      return
    }
    if (candidates.length < 2) {
      toast.error('Enter at least 2 candidate names, comma-separated')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/surveys/${surveyId}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateQuestion, candidates, includeWaves }),
      })
      const data = await res.json()

      if (!data.status) {
        toast.error(data.message || 'Prediction failed')
        return
      }

      setPrediction(data.prediction)
      setWaveTrends(data.waveTrends || null)
    } catch {
      toast.error('Prediction request failed')
    } finally {
      setLoading(false)
    }
  }, [surveyId, candidateQuestion, candidateInput, includeWaves])

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex items-center gap-2 p-4 border-b">
        <SidebarTrigger />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Election Predictions</h1>
          <p className="text-sm text-muted-foreground">
            Model election outcomes from survey data using likely-voter screens and Monte Carlo simulation
          </p>
        </div>
      </div>

      <div className="flex-1 p-6 max-w-6xl mx-auto w-full space-y-6">
        {/* Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Configure Prediction
            </CardTitle>
            <CardDescription>
              Identify the head-to-head question and candidate names from your survey
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="questionKey">Question Key or Text</Label>
                <Input
                  id="questionKey"
                  placeholder='e.g., "vote for" or "prefer"'
                  value={candidateQuestion}
                  onChange={(e) => setCandidateQuestion(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Substring to match the head-to-head / ballot question
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="candidates">Candidate Names</Label>
                <Input
                  id="candidates"
                  placeholder="e.g., Biden, Trump"
                  value={candidateInput}
                  onChange={(e) => setCandidateInput(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated candidate names
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeWaves}
                  onChange={(e) => setIncludeWaves(e.target.checked)}
                  className="rounded"
                />
                Include tracking poll waves (trend analysis)
              </label>

              <Button onClick={handleRun} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Running Model...
                  </>
                ) : (
                  <>
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Run Prediction
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {prediction && (
          <>
            {/* Win probability gauges */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {prediction.candidates.map((c, i) => {
                const isLeader =
                  c.winProbability ===
                  Math.max(...prediction.candidates.map((x) => x.winProbability))
                return (
                  <Card key={c.name} className={isLeader ? 'ring-2 ring-primary' : ''}>
                    <CardContent className="pt-6 text-center">
                      {isLeader && (
                        <Badge className="mb-2" variant="default">
                          <Trophy className="h-3 w-3 mr-1" />
                          Leader
                        </Badge>
                      )}
                      <h3 className="text-lg font-semibold">{c.name}</h3>
                      <div className="mt-3">
                        <div className="text-4xl font-bold text-primary">
                          {c.winProbability}%
                        </div>
                        <p className="text-sm text-muted-foreground">Win Probability</p>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-muted-foreground">LV Support</p>
                          <p className="font-medium">{c.likelyVoterSupport}%</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">MoE</p>
                          <p className="font-medium">±{c.marginOfError}%</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Raw Support</p>
                          <p className="font-medium">{c.rawSupport}%</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Sample (LV)</p>
                          <p className="font-medium">{prediction.likelyVoterSampleSize}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* Wave trend chart */}
            {waveTrends && waveTrends.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Tracking Poll Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Wave</TableHead>
                        <TableHead>Sample</TableHead>
                        {waveTrends[0].candidates.map((c) => (
                          <TableHead key={c.name}>{c.name} (LV%)</TableHead>
                        ))}
                        {waveTrends[0].candidates.map((c) => (
                          <TableHead key={`${c.name}-wp`}>{c.name} Win%</TableHead>
                        ))}
                        <TableHead>Trend</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {waveTrends.map((wave, wi) => {
                        const prevWave = wi > 0 ? waveTrends[wi - 1] : null
                        return (
                          <TableRow key={wave.waveNumber}>
                            <TableCell className="font-medium">
                              Wave {wave.waveNumber}
                            </TableCell>
                            <TableCell>{wave.sampleSize}</TableCell>
                            {wave.candidates.map((c) => (
                              <TableCell key={c.name}>
                                {c.likelyVoterSupport}%
                              </TableCell>
                            ))}
                            {wave.candidates.map((c) => (
                              <TableCell key={`${c.name}-wp`}>
                                {c.winProbability}%
                              </TableCell>
                            ))}
                            <TableCell>
                              {prevWave ? (
                                <TrendArrow
                                  current={wave.candidates[0]?.likelyVoterSupport || 0}
                                  previous={prevWave.candidates[0]?.likelyVoterSupport || 0}
                                />
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Turnout by segment */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Segment Breakdowns
                </CardTitle>
                <CardDescription>
                  {prediction.segmentBreakdowns.length} segments analyzed
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Segment</TableHead>
                        <TableHead className="text-right">n</TableHead>
                        {prediction.candidates.map((c) => (
                          <TableHead key={c.name} className="text-right">
                            {c.name}
                          </TableHead>
                        ))}
                        <TableHead className="text-right">Est. Turnout</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prediction.segmentBreakdowns.slice(0, 30).map((seg) => (
                        <TableRow key={seg.segment}>
                          <TableCell className="whitespace-nowrap font-medium">
                            {seg.segment}
                          </TableCell>
                          <TableCell className="text-right">{seg.sampleSize}</TableCell>
                          {prediction.candidates.map((c) => (
                            <TableCell key={c.name} className="text-right">
                              {seg.candidateSupport[c.name] || 0}%
                            </TableCell>
                          ))}
                          <TableCell className="text-right">
                            {seg.turnoutEstimate}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Key drivers */}
            {prediction.keyDrivers.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    Key Drivers
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {prediction.keyDrivers.map((driver, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 rounded-lg bg-muted/30"
                      >
                        <Badge
                          variant={
                            driver.impact === 'high'
                              ? 'destructive'
                              : driver.impact === 'medium'
                              ? 'default'
                              : 'secondary'
                          }
                          className="mt-0.5 shrink-0"
                        >
                          {driver.impact}
                        </Badge>
                        <p className="text-sm">{driver.description}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Methodology */}
            <Card>
              <CardContent className="py-4">
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Info className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>{prediction.methodology}</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------

function TrendArrow({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous
  if (Math.abs(diff) < 0.5) {
    return <Minus className="h-4 w-4 text-muted-foreground" />
  }
  if (diff > 0) {
    return (
      <span className="flex items-center text-green-600 text-sm">
        <ArrowUp className="h-4 w-4" />+{diff.toFixed(1)}
      </span>
    )
  }
  return (
    <span className="flex items-center text-red-600 text-sm">
      <ArrowDown className="h-4 w-4" />{diff.toFixed(1)}
    </span>
  )
}
