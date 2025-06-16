'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { 
  Brain, 
  Search,
  MessageCircle,
  Users,
  Loader2,
  Send
} from "lucide-react"

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

        <div className="p-6 space-y-6">
          {/* Introduction */}
          <div className="text-center">
            <div className="flex items-center justify-center mb-4">
              <div className="p-3 rounded-full bg-primary/10">
                <Brain className="h-8 w-8 text-primary" />
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-2">Digital Twin Explorer</h2>
            <p className="text-muted-foreground text-base max-w-2xl mx-auto">
              Search and interact with digital twins created from survey responses. Each twin represents a real person&apos;s perspectives and can answer questions based on their profile.
            </p>
          </div>

          {/* Search Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search Digital Twins
              </CardTitle>
              <CardDescription>
                Find digital twins based on demographics, interests, or characteristics
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., 'young professionals in tech', 'conservative voters', 'parents with children'"
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && searchTwins()}
                />
                <Button onClick={searchTwins} disabled={searching}>
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Search
                </Button>
                {searchResults.length > 0 && (
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setSearchResults([])
                      setQueryText('')
                    }}
                  >
                    Clear Search
                  </Button>
                )}
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium">Found {searchResults.length} digital twins:</h4>
                  <div className="grid gap-3">
                    {searchResults.map((twin) => (
                      <div 
                        key={twin.agentToken}
                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                          selectedTwin === twin.agentToken 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border hover:border-primary/50'
                        }`}
                        onClick={() => setSelectedTwin(twin.agentToken)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <Badge variant="secondary" className="mb-2">
                              {twin.surveyTitle}
                            </Badge>
                            <p className="text-sm font-medium">
                              {twin.demographics?.name || 'Anonymous'}, {twin.demographics?.age}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {twin.demographics?.location} • {twin.demographics?.occupation}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {Math.round(twin.score * 100)}% match
                          </Badge>
                        </div>
                        
                        {twin.principles && (
                          <div className="text-xs text-muted-foreground">
                            <strong>Values:</strong> {twin.principles.coreValues?.slice(0, 3).join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* All Digital Twins Section */}
          {searchResults.length === 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  All Digital Twins
                </CardTitle>
                <CardDescription>
                  Browse all available digital twins created from survey responses
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                    <p className="text-muted-foreground">Loading digital twins...</p>
                  </div>
                ) : allTwins.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No digital twins found</p>
                    <p className="text-sm">Create surveys to start building digital twins</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <h4 className="font-medium">{allTwins.length} digital twins available:</h4>
                    <div className="grid gap-3">
                      {allTwins.map((twin) => (
                        <div 
                          key={twin.agentToken}
                          className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                            selectedTwin === twin.agentToken 
                              ? 'border-primary bg-primary/5' 
                              : 'border-border hover:border-primary/50'
                          }`}
                          onClick={() => setSelectedTwin(twin.agentToken)}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <Badge variant="secondary" className="mb-2">
                                {twin.surveyTitle}
                              </Badge>
                              <p className="text-sm font-medium">
                                {twin.demographics?.name || 'Anonymous'}, {twin.demographics?.age}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {twin.demographics?.location} • {twin.demographics?.occupation}
                              </p>
                            </div>
                            <Badge variant="outline">
                              Digital Twin
                            </Badge>
                          </div>
                          
                          {twin.principles && (
                            <div className="text-xs text-muted-foreground">
                              <strong>Values:</strong> {twin.principles.coreValues?.slice(0, 3).join(', ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                                )}
              </CardContent>
            </Card>
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