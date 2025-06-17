/* eslint-disable react/no-unescaped-entities */
'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { 
  Brain, 
  MessageCircle,
  Users,
  Loader2,
  Send
} from "lucide-react"

// Charts & table utilities
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, CartesianGrid, XAxis, YAxis, LabelList } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table"
import { formatDistanceToNow } from "date-fns"

interface DigitalTwin {
  agentToken: string
  score: number
  demographics: any
  principles: any
  surveyTitle: string
  createdAt: string
}

const DigitalTwinsPage = () => {
  const [queryText, setQueryText] = useState('')
  const [searchResults, setSearchResults] = useState<DigitalTwin[]>([])
  const [allTwins, setAllTwins] = useState<DigitalTwin[]>([])
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(true)
  
  const [selectedTwin, setSelectedTwin] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [response, setResponse] = useState('')
  const [querying, setQuerying] = useState(false)

  const grayscalePalette = [
    'hsl(0, 0%, 9%)',   // Very dark gray (almost black)
    'hsl(0, 0%, 26%)',  // Dark gray
    'hsl(0, 0%, 40%)',  // Medium gray
    'hsl(0, 0%, 54%)',  // Light gray
    'hsl(0, 0%, 71%)',  // Very light gray
  ]

  /* --------------------------------------------------
   * Aggregated data for dashboard visualisations
   * -------------------------------------------------- */
  const aggregation = useMemo(() => {
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
    const politicalCounts: Record<string, number> = {}

    allTwins.forEach((twin) => {
      const ageNumber = parseInt(twin.demographics?.age as string)
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

      const loc = twin.demographics?.location || 'Unknown'
      locationCounts[loc] = (locationCounts[loc] || 0) + 1

      const political = twin.demographics?.politicalViews || 'Unknown'
      politicalCounts[political] = (politicalCounts[political] || 0) + 1
    })

    const ageData = Object.entries(ageBuckets).map(([group, count]) => ({ group, count }))

    const locationData = Object.entries(locationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([location, count]) => ({ name: location, count }))

    const politicalData = Object.entries(politicalCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([political, count]) => ({ name: political, count }))

    return { ageData, locationData, politicalData }
  }, [allTwins])

  // Load all digital twins on component mount
  useEffect(() => {
    loadAllTwins()
  }, [])

  const loadAllTwins = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/digital-twins/search', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ query: '', topK: 50 }) // Empty query to get all
      })
      
      const data = await res.json()
      if (data.status) {
        setAllTwins(data.results)
      }
    } catch (error) {
      console.error('Error loading digital twins:', error)
    } finally {
      setLoading(false)
    }
  }

  const searchTwins = async () => {
    if (!queryText.trim()) return
    
    setSearching(true)
    try {
      const res = await fetch('/api/digital-twins/search', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ query: queryText, topK: 10 })
      })
      
      const data = await res.json()
      if (data.status) {
        setSearchResults(data.results)
      }
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setSearching(false)
    }
  }

  const queryTwin = async () => {
    if (!selectedTwin || !question.trim()) return
    
    setQuerying(true)
    try {
      const res = await fetch('/api/digital-twins/query', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ agentToken: selectedTwin, question })
      })
      
      const data = await res.json()
      if (data.status) {
        setResponse(data.response)
      }
    } catch (error) {
      console.error('Query error:', error)
    } finally {
      setQuerying(false)
    }
  }

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        {/* Header */}
        <div className="px-6 py-4">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium text-card-foreground">Digital Twins</h1>
          </div>
        </div>
        
        <div className="border-b border-border" />

        <div className="p-4 space-y-4">
          {/* Introduction */}
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center mb-4">
              <div className="p-3 rounded-full bg-primary/10">
                <Brain className="h-8 w-8 text-primary" />
              </div>
            </div>
            <h2 className="text-2xl font-bold">Digital Twin Explorer</h2>
            <p className="text-muted-foreground text-base max-w-2xl mx-auto">
              Search and interact with digital twins created from survey responses. Each twin represents a real person&apos;s perspectives and can answer questions based on their profile.
            </p>
          </div>

          {/* Dashboard Overview */}
          {allTwins.length > 0 && (
            <section className="space-y-4">
              {/* Charts Grid */}
              <div className="grid gap-4 md:grid-cols-3">
                {/* Age Distribution (ShadCN Area style) */}
                <Card>
                  <CardHeader className="px-6 pt-6 pb-0">
                    <CardTitle>Age Distribution</CardTitle>
                    <CardDescription>Total twins by age cohort</CardDescription>
                  </CardHeader>
                  <CardContent className="px-0 pt-2 pb-4 sm:px-0 sm:pt-2">
                    <ChartContainer config={{ count: { color: "hsl(var(--zinc-600))" } }} className="aspect-auto h-[220px] w-full">
                      <AreaChart 
                        data={aggregation.ageData}
                        margin={{
                          left: -20,
                          right: 20,
                          top: 12,
                          bottom: 12,
                        }}
                      >
                        <defs>
                          <linearGradient id="fillAge" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(0, 0%, 40%)" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="hsl(0, 0%, 40%)" stopOpacity={0.1} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                        <XAxis dataKey="group" tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" />
                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Area type="monotone" dataKey="count" stroke="hsl(0, 0%, 40%)" strokeWidth={2} fill="url(#fillAge)" />
                      </AreaChart>
                    </ChartContainer>
                  </CardContent>
                </Card>

                {/* Top Locations */}
                <Card>
                  <CardHeader className="px-6 pt-6 pb-0">
                    <CardTitle>Top Locations</CardTitle>
                    <CardDescription>Most common geographical locations</CardDescription>
                  </CardHeader>
                  <CardContent className="px-0 pt-2 pb-4 sm:px-0 sm:pt-2 flex flex-col items-center justify-center">
                    <div className="flex flex-row items-center justify-start gap-2 w-full px-4">
                      <div className="w-3/5 flex justify-end">
                        <ChartContainer config={{ visitors: { label: "Count" } }} className="aspect-square w-[200px]">
                          <PieChart>
                            <Pie
                              data={aggregation.locationData.map((d, i) => ({ ...d, fill: grayscalePalette[i % grayscalePalette.length] }))}
                              dataKey="count"
                              nameKey="name"
                              outerRadius={85}
                              innerRadius={35}
                              paddingAngle={2}
                            >
                              {aggregation.locationData.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={grayscalePalette[index % grayscalePalette.length]} />
                              ))}
                            </Pie>
                            <ChartTooltip content={<ChartTooltipContent />} />
                          </PieChart>
                        </ChartContainer>
                      </div>
                      {/* Legend */}
                      <div className="w-2/5 flex flex-col gap-1 text-xs">
                        {aggregation.locationData.map((d, i) => (
                          <div key={d.name} className="flex items-center gap-1">
                            <span
                              className="inline-block h-2 w-2 rounded-sm"
                              style={{ backgroundColor: grayscalePalette[i % grayscalePalette.length] }}
                            />
                            <span className="text-muted-foreground">{d.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Top Occupations */}
                <Card>
                  <CardHeader className="px-6 pt-6 pb-0">
                    <CardTitle>Political Leanings</CardTitle>
                    <CardDescription>Most common political orientations</CardDescription>
                  </CardHeader>
                  <CardContent className="px-6 pt-2 pb-4">
                    <ChartContainer config={{ 
                      count: { label: "Count", color: "hsl(0, 0%, 40%)" },
                      label: { color: "var(--background)" }
                    }} className="aspect-auto h-[220px] w-full">
                      <BarChart 
                        data={aggregation.politicalData}
                        layout="vertical"
                        margin={{
                          left: 0,
                          right: 16,
                          top: 12,
                          bottom: 12,
                        }}
                      >
                        <CartesianGrid horizontal={false} />
                        <YAxis
                          dataKey="name"
                          type="category"
                          tickLine={false}
                          tickMargin={10}
                          axisLine={false}
                          hide
                        />
                        <XAxis dataKey="count" type="number" hide />
                        <ChartTooltip
                          cursor={false}
                          content={<ChartTooltipContent indicator="line" />}
                        />
                        <Bar 
                          dataKey="count" 
                          layout="vertical"
                          radius={4}
                        >
                          {aggregation.politicalData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={grayscalePalette[index % grayscalePalette.length]} />
                          ))}
                          <LabelList
                            dataKey="name"
                            position="insideLeft"
                            offset={8}
                            fill="white"
                            fontSize={12}
                          />
                          <LabelList
                            dataKey="count"
                            position="right"
                            offset={8}
                            fill="hsl(var(--foreground))"
                            fontSize={12}
                          />
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </div>

            {/* Twins Table */}
            <Card>
              <CardHeader>
                <CardTitle>Digital Twins ({allTwins.length})</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Age</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Political Leaning</TableHead>
                      <TableHead>Survey</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allTwins.map((twin) => (
                      <TableRow key={twin.agentToken} className="cursor-pointer" onClick={() => setSelectedTwin(twin.agentToken)}>
                        <TableCell>{twin.demographics?.name || 'Anonymous'}</TableCell>
                        <TableCell>{twin.demographics?.age || '—'}</TableCell>
                        <TableCell>{twin.demographics?.location || '—'}</TableCell>
                        <TableCell>{twin.demographics?.politicalViews || '—'}</TableCell>
                        <TableCell>{twin.surveyTitle}</TableCell>
                        <TableCell>{twin.createdAt ? formatDistanceToNow(new Date(twin.createdAt), { addSuffix: true }) : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Query Section */}
        {selectedTwin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Ask a Question
              </CardTitle>
              <CardDescription>
                Ask the selected digital twin a question and get a response based on their persona
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="question">Your Question</Label>
                <Textarea
                  id="question"
                  placeholder="e.g., 'What do you think about remote work?', 'How do you feel about climate change?'"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  rows={3}
                />
              </div>
              
              <Button onClick={queryTwin} disabled={querying || !question.trim()}>
                {querying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Ask Question
              </Button>

              {response && (
                <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-medium mb-2">Response:</h4>
                  <p className="text-sm">{response}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Info Section */}
        <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Users className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                  How Digital Twins Work
                </h4>
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                  <li>• Each digital twin is created from real survey responses</li>
                  <li>• AI analyzes demographics and answers to build a persona</li>
                  <li>• Twins can answer new questions based on their profile</li>
                  <li>• All personal information is anonymized and secure</li>
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

export default DigitalTwinsPage 