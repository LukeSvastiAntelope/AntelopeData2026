/* eslint-disable react/no-unescaped-entities */
'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { 
  Loader2, 
  AlertCircle, 
  User, 
  Brain,
  MessageCircle,
  Edit3,
  Save,
  X,
  MapPin,
  Briefcase,
  GraduationCap,
  DollarSign,
  Heart,
  Calendar,
  Send,
  Bot,
  Sparkles
} from 'lucide-react'

interface TwinData {
  agent_token: string
  baseProfile: any
  created_from_response_id: number
  created_at: string
  principles?: any
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export default function DigitalTwinProfilePage() {
  const params = useParams()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [twin, setTwin] = useState<TwinData | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState<any>({})
  const [surveys, setSurveys] = useState<any[]>([])
  
  // Chat functionality
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [currentQuestion, setCurrentQuestion] = useState('')
  const [isQuerying, setIsQuerying] = useState(false)

  useEffect(() => {
    const fetchTwin = async () => {
      try {
        const res = await fetch(`/api/digital-twin/${token}`)
        const json = await res.json()
        if (!json.status) {
          setError(json.message || 'Digital Twin not found')
        } else {
          setTwin(json.twin)
          // fetch surveys
          const sRes = await fetch(`/api/digital-twin/${token}/responses`)
          const sJson = await sRes.json()
          if (sJson.status) setSurveys(sJson.surveys)
        }
      } catch (err) {
        setError('Failed to load Digital Twin')
      } finally {
        setLoading(false)
      }
    }

    if (token) fetchTwin()
  }, [token])

  const startEdit = () => {
    setDraft(twin?.baseProfile?.demographics || {})
    setEditMode(true)
  }

  const saveChanges = async () => {
    try {
      const res = await fetch(`/api/digital-twin/${token}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demographics: draft }),
      })
      const json = await res.json()
      if (json.status) {
        setTwin((prev: any) => ({ ...prev, baseProfile: { ...prev.baseProfile, demographics: draft } }))
        setEditMode(false)
      } else {
        alert(json.message || 'Failed to update')
      }
    } catch (e) {
      alert('Network error')
    }
  }

  const askDigitalTwin = async () => {
    if (!currentQuestion.trim() || isQuerying) return

    const userMessage: ChatMessage = {
      role: 'user',
      content: currentQuestion,
      timestamp: new Date()
    }

    setChatMessages(prev => [...prev, userMessage])
    setCurrentQuestion('')
    setIsQuerying(true)

    try {
      const res = await fetch('/api/digital-twins/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          agentToken: token, 
          question: userMessage.content 
        })
      })
      
      const data = await res.json()
      if (data.status) {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.response,
          timestamp: new Date()
        }
        setChatMessages(prev => [...prev, assistantMessage])
      } else {
        throw new Error(data.message || 'Failed to get response')
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'Sorry, I had trouble responding to that. Please try again.',
        timestamp: new Date()
      }
      setChatMessages(prev => [...prev, errorMessage])
    } finally {
      setIsQuerying(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !twin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">{error || 'Digital Twin not found'}</h2>
          </CardContent>
        </Card>
      </div>
    )
  }

  const demographics = twin.baseProfile?.demographics || {}
  const principles = twin.principles || {}

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        {/* Header */}
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-card-foreground">Your Digital Twin</h1>
          <p className="text-muted-foreground mt-1">Explore your AI-powered digital persona</p>
        </div>
        
        <div className="border-b border-border" />

        <div className="p-6 space-y-6">
          {/* Hero Profile Section */}
          <Card className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-secondary/5" />
            <CardContent className="relative pt-6">
              <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                {/* Avatar */}
                <div className="relative">
                  <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center border-4 border-background shadow-lg">
                    <User className="w-12 h-12 md:w-16 md:h-16 text-primary" />
                  </div>
                  <div className="absolute -bottom-2 -right-2 bg-green-500 rounded-full p-2 border-4 border-background">
                    <Brain className="w-4 h-4 text-white" />
                  </div>
                </div>

                {/* Profile Info */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl md:text-3xl font-bold">
                      {demographics.name || 'Anonymous Digital Twin'}
                    </h2>
                    <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                      <Sparkles className="w-3 h-3 mr-1" />
                      AI Twin
                    </Badge>
                  </div>
                  
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    {demographics.age && (
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {demographics.age} years old
                      </div>
                    )}
                    {demographics.location && (
                      <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {demographics.location}
                      </div>
                    )}
                    {demographics.occupation && (
                      <div className="flex items-center gap-1">
                        <Briefcase className="w-4 h-4" />
                        {demographics.occupation}
                      </div>
                    )}
                  </div>

                  <p className="text-muted-foreground max-w-2xl">
                    This is your digital twin - an AI representation of your perspectives, values, and personality 
                    created from your survey responses. You can chat with it to explore your own viewpoints 
                    and see how it responds to different questions.
                  </p>
                </div>

                {/* Edit Button */}
                <Button 
                  variant="outline" 
                  onClick={editMode ? saveChanges : startEdit}
                  className="shrink-0"
                >
                  {editMode ? (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save
                    </>
                  ) : (
                    <>
                      <Edit3 className="w-4 h-4 mr-2" />
                      Edit Profile
                    </>
                  )}
                </Button>
                {editMode && (
                  <Button 
                    variant="ghost" 
                    onClick={() => setEditMode(false)}
                    size="icon"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Demographics & Details */}
            <div className="space-y-6">
              {/* Personal Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Personal Information
                  </CardTitle>
                  <CardDescription>
                    Your demographic information and background
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {editMode ? (
                    <div className="grid gap-4">
                      <div>
                        <Label htmlFor="name">Name</Label>
                        <Input 
                          id="name"
                          value={draft.name || ''} 
                          onChange={e => setDraft({...draft, name: e.target.value})} 
                        />
                      </div>
                      <div>
                        <Label htmlFor="email">Email</Label>
                        <Input 
                          id="email"
                          type="email"
                          value={draft.email || ''} 
                          onChange={e => setDraft({...draft, email: e.target.value})} 
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="age">Age</Label>
                          <Input 
                            id="age"
                            value={draft.age || ''} 
                            onChange={e => setDraft({...draft, age: e.target.value})} 
                          />
                        </div>
                        <div>
                          <Label htmlFor="location">Location</Label>
                          <Input 
                            id="location"
                            value={draft.location || ''} 
                            onChange={e => setDraft({...draft, location: e.target.value})} 
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="occupation">Occupation</Label>
                        <Input 
                          id="occupation"
                          value={draft.occupation || ''} 
                          onChange={e => setDraft({...draft, occupation: e.target.value})} 
                        />
                      </div>
                      <div>
                        <Label htmlFor="interests">Interests</Label>
                        <Input 
                          id="interests"
                          value={draft.interests || ''} 
                          onChange={e => setDraft({...draft, interests: e.target.value})} 
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {demographics.email && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Email:</span>
                          <span className="font-medium">{demographics.email}</span>
                        </div>
                      )}
                      {demographics.age && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Age:</span>
                          <span className="font-medium">{demographics.age}</span>
                        </div>
                      )}
                      {demographics.location && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Location:</span>
                          <span className="font-medium">{demographics.location}</span>
                        </div>
                      )}
                      {demographics.occupation && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Occupation:</span>
                          <span className="font-medium">{demographics.occupation}</span>
                        </div>
                      )}
                      {demographics.education && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Education:</span>
                          <span className="font-medium">{demographics.education}</span>
                        </div>
                      )}
                      {demographics.income && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Income:</span>
                          <span className="font-medium">{demographics.income}</span>
                        </div>
                      )}
                      {demographics.politicalViews && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Political Views:</span>
                          <span className="font-medium">{demographics.politicalViews}</span>
                        </div>
                      )}
                      {demographics.interests && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Interests:</span>
                          <span className="font-medium">{demographics.interests}</span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* AI Persona Insights */}
              {principles && Object.keys(principles).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="h-5 w-5" />
                      AI Persona Insights
                    </CardTitle>
                    <CardDescription>
                      AI-generated personality traits and characteristics
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {principles.coreValues && (
                      <div>
                        <h4 className="font-medium mb-2">Core Values</h4>
                        <div className="flex flex-wrap gap-2">
                          {principles.coreValues.map((value: string, index: number) => (
                            <Badge key={index} variant="secondary">{value}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {principles.personalityTraits && (
                      <div>
                        <h4 className="font-medium mb-2">Personality Traits</h4>
                        <div className="flex flex-wrap gap-2">
                          {principles.personalityTraits.map((trait: string, index: number) => (
                            <Badge key={index} variant="outline">{trait}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {principles.communicationStyle && (
                      <div>
                        <h4 className="font-medium mb-2">Communication Style</h4>
                        <p className="text-sm text-muted-foreground">{principles.communicationStyle}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Chat Interface */}
            <div className="space-y-6">
              <Card className="h-fit">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageCircle className="h-5 w-5" />
                    Chat with Your Digital Twin
                  </CardTitle>
                  <CardDescription>
                    Ask questions and see how your digital twin responds based on your profile
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Chat Messages */}
                  <div className="space-y-3 max-h-96 overflow-y-auto border rounded-lg p-4 bg-muted/20">
                    {chatMessages.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">
                        <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Start a conversation with your digital twin!</p>
                        <p className="text-xs mt-1">Try asking: "What do you think about remote work?" or "What are your core values?"</p>
                      </div>
                    ) : (
                      chatMessages.map((message, index) => (
                        <div key={index} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] rounded-lg p-3 ${
                            message.role === 'user' 
                              ? 'bg-primary text-primary-foreground' 
                              : 'bg-background border'
                          }`}>
                            <p className="text-sm">{message.content}</p>
                            <p className="text-xs opacity-70 mt-1">
                              {message.timestamp.toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                    {isQuerying && (
                      <div className="flex gap-3 justify-start">
                        <div className="bg-background border rounded-lg p-3">
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm text-muted-foreground">Thinking...</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Chat Input */}
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Ask your digital twin a question..."
                      value={currentQuestion}
                      onChange={(e) => setCurrentQuestion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          askDigitalTwin()
                        }
                      }}
                      rows={2}
                      className="resize-none"
                    />
                    <Button 
                      onClick={askDigitalTwin}
                      disabled={!currentQuestion.trim() || isQuerying}
                      size="icon"
                      className="shrink-0 self-end"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Survey History */}
          {surveys.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Survey Participation</CardTitle>
                <CardDescription>Surveys that contributed to your digital twin</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {surveys.map((survey) => (
                    <div key={survey.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <h4 className="font-medium">{survey.title}</h4>
                        <p className="text-sm text-muted-foreground">
                          Completed {new Date(survey.submitted_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant="secondary">Completed</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Technical Details */}
          <Card className="bg-muted/20">
            <CardHeader>
              <CardTitle className="text-sm">Technical Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Digital Twin Token:</span>
                <Badge variant="secondary" className="font-mono text-xs">
                  {twin.agent_token}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
} 