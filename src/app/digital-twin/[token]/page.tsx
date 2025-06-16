'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, AlertCircle, UserCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

interface TwinData {
  agent_token: string
  baseProfile: any
  created_from_response_id: number
  created_at: string
  // optional metadata from Pinecone (if needed later)
  principles?: any
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
        alert('Profile updated')
        setTwin((prev: any) => ({ ...prev, baseProfile: { ...prev.baseProfile, demographics: draft } }))
        setEditMode(false)
      } else {
        alert(json.message || 'Failed to update')
      }
    } catch (e) {
      alert('Network error')
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

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
          <h1 className="text-base font-medium text-card-foreground">Your Digital Twin</h1>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCircle className="h-5 w-5" />
                Profile Overview
              </CardTitle>
              <CardDescription>
                Basic demographics captured from your survey response.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.keys(demographics).length === 0 && (
                <p className="text-muted-foreground text-sm">No demographic data available.</p>
              )}

              <div>
                <span className="font-medium">Name:</span>{' '}
                {editMode ? (
                  <Input className="mt-1" value={draft.name || ''} onChange={e=>setDraft({...draft, name:e.target.value})} />
                ) : (
                  demographics.name || '—'
                )}
              </div>
              <div>
                <span className="font-medium">Email:</span>{' '}
                {editMode ? (
                  <Input className="mt-1" value={draft.email || ''} onChange={e=>setDraft({...draft, email:e.target.value})} />
                ) : (
                  demographics.email || '—'
                )}
              </div>
              <div>
                <span className="font-medium">Age:</span>{' '}
                {editMode ? (
                  <Input className="mt-1" value={draft.age || ''} onChange={e=>setDraft({...draft, age:e.target.value})} />
                ) : (
                  demographics.age || '—'
                )}
              </div>
              <div>
                <span className="font-medium">Location:</span>{' '}
                {editMode ? (
                  <Input className="mt-1" value={draft.location || ''} onChange={e=>setDraft({...draft, location:e.target.value})} />
                ) : (
                  demographics.location || '—'
                )}
              </div>
              <div>
                <span className="font-medium">Occupation:</span>{' '}
                {editMode ? (
                  <Input className="mt-1" value={draft.occupation || ''} onChange={e=>setDraft({...draft, occupation:e.target.value})} />
                ) : (
                  demographics.occupation || '—'
                )}
              </div>
              <div>
                <span className="font-medium">Interests:</span>{' '}
                {editMode ? (
                  <Input className="mt-1" value={draft.interests || ''} onChange={e=>setDraft({...draft, interests:e.target.value})} />
                ) : (
                  demographics.interests || '—'
                )}
              </div>
              <div>
                <span className="font-medium">Education:</span>{' '}
                {editMode ? (
                  <select
                    className="w-full mt-1 border rounded-md bg-background px-2 py-1"
                    value={draft.education || ''}
                    onChange={e=>setDraft({...draft, education:e.target.value})}
                  >
                    <option value="">Select</option>
                    <option value="high-school">High School</option>
                    <option value="some-college">Some College</option>
                    <option value="bachelors">Bachelor's</option>
                    <option value="masters">Master's</option>
                    <option value="phd">PhD</option>
                    <option value="other">Other</option>
                  </select>
                ) : (
                  demographics.education || '—'
                )}
              </div>
              <div>
                <span className="font-medium">Income:</span>{' '}
                {editMode ? (
                  <select
                    className="w-full mt-1 border rounded-md bg-background px-2 py-1"
                    value={draft.income || ''}
                    onChange={e=>setDraft({...draft, income:e.target.value})}
                  >
                    <option value="">Select</option>
                    <option value="under-25k">Under $25k</option>
                    <option value="25k-50k">$25k–$50k</option>
                    <option value="50k-75k">$50k–$75k</option>
                    <option value="75k-100k">$75k–$100k</option>
                    <option value="100k-150k">$100k–$150k</option>
                    <option value="over-150k">Over $150k</option>
                    <option value="prefer-not-to-say">Prefer not to say</option>
                  </select>
                ) : (
                  demographics.income || '—'
                )}
              </div>
              <div>
                <span className="font-medium">Political Views:</span>{' '}
                {editMode ? (
                  <select
                    className="w-full mt-1 border rounded-md bg-background px-2 py-1"
                    value={draft.politicalViews || ''}
                    onChange={e=>setDraft({...draft, politicalViews:e.target.value})}
                  >
                    <option value="">Select</option>
                    <option value="very-liberal">Very Liberal</option>
                    <option value="liberal">Liberal</option>
                    <option value="moderate">Moderate</option>
                    <option value="conservative">Conservative</option>
                    <option value="very-conservative">Very Conservative</option>
                    <option value="libertarian">Libertarian</option>
                    <option value="other">Other</option>
                    <option value="prefer-not-to-say">Prefer not to say</option>
                  </select>
                ) : (
                  demographics.politicalViews || '—'
                )}
              </div>
              <div>
                <span className="font-medium">Twitter / X:</span>{' '}
                {editMode ? (
                  <Input className="mt-1" value={draft.socialMedia?.twitter || ''} onChange={e=>setDraft({...draft, socialMedia:{...(draft.socialMedia||{}), twitter:e.target.value}})} />
                ) : (
                  demographics.socialMedia?.twitter || '—'
                )}
              </div>
              <div>
                <span className="font-medium">LinkedIn:</span>{' '}
                {editMode ? (
                  <Input className="mt-1" value={draft.socialMedia?.linkedin || ''} onChange={e=>setDraft({...draft, socialMedia:{...(draft.socialMedia||{}), linkedin:e.target.value}})} />
                ) : (
                  demographics.socialMedia?.linkedin || '—'
                )}
              </div>
              <div>
                <span className="font-medium">Instagram:</span>{' '}
                {editMode ? (
                  <Input className="mt-1" value={draft.socialMedia?.instagram || ''} onChange={e=>setDraft({...draft, socialMedia:{...(draft.socialMedia||{}), instagram:e.target.value}})} />
                ) : (
                  demographics.socialMedia?.instagram || '—'
                )}
              </div>

              <div>
                <span className="font-medium">Twin Token:</span>{' '}
                <Badge variant="secondary" className="break-all">
                  {twin.agent_token}
                </Badge>
              </div>

              {editMode ? (
                <div className="flex gap-2 pt-4">
                  <Button onClick={saveChanges}>Save</Button>
                  <Button variant="outline" onClick={()=>setEditMode(false)}>Cancel</Button>
                </div>
              ) : (
                <Button className="mt-4" onClick={startEdit}>Edit Profile</Button>
              )}
            </CardContent>
          </Card>

          {surveys.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Survey Participation</CardTitle>
                <CardDescription>Surveys you have answered</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {surveys.map((s)=> (
                      <TableRow key={s.id}>
                        <TableCell>{s.title}</TableCell>
                        <TableCell>{new Date(s.submitted_at).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
} 