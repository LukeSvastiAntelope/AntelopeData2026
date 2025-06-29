'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { 
  Loader2, 
  AlertCircle, 
  Save,
  ArrowLeft,
  User
} from 'lucide-react'

interface TwinData {
  agent_token: string
  baseProfile: any
  created_from_response_id: number
  created_at: string
  principles?: any
}

export default function EditDigitalTwinPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [twin, setTwin] = useState<TwinData | null>(null)
  const [demographics, setDemographics] = useState<any>({})

  useEffect(() => {
    const fetchTwin = async () => {
      try {
        const res = await fetch(`/api/digital-twin/${token}`)
        const json = await res.json()
        
        if (!json.status) {
          setError(json.message || 'Digital Twin not found')
        } else {
          setTwin(json.twin)
          setDemographics(json.twin.baseProfile?.demographics || {})
        }
      } catch (err) {
        setError('Failed to load Digital Twin data')
      } finally {
        setLoading(false)
      }
    }

    if (token) fetchTwin()
  }, [token])

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/digital-twin/${token}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demographics }),
      })
      
      const json = await res.json()
      if (json.status) {
        // Navigate back to dashboard
        router.push(`/digital-twin/${token}`)
      } else {
        setError(json.message || 'Failed to update profile')
      }
    } catch (e) {
      setError('Network error occurred')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    router.push(`/digital-twin/${token}`)
  }

  const updateField = (field: string, value: string) => {
    setDemographics((prev: any) => ({ ...prev, [field]: value }))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error && !twin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">{error}</h2>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg max-w-4xl">
        {/* Header */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <h1 className="text-base font-medium text-card-foreground">Edit Digital Twin Profile</h1>
          </div>
        </div>

        <div className="border-b border-border" />

        <div className="p-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Information
              </CardTitle>
              <CardDescription>
                Update your demographic information to improve your digital twin accuracy
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Required Fields */}
              <div>
                <h4 className="font-medium mb-3 text-sm text-muted-foreground">Required Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      placeholder="Your full name"
                      value={demographics.name || ''}
                      onChange={(e) => updateField('name', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your.email@example.com"
                      value={demographics.email || ''}
                      onChange={(e) => updateField('email', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="age">Age *</Label>
                    <Input
                      id="age"
                      type="number"
                      placeholder="25"
                      value={demographics.age || ''}
                      onChange={(e) => updateField('age', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Personal Information */}
              <div>
                <h4 className="font-medium mb-3 text-sm text-muted-foreground">Personal Information (Optional)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="gender">Gender</Label>
                    <select
                      id="gender"
                      value={demographics.gender || ''}
                      onChange={(e) => updateField('gender', e.target.value)}
                      className="w-full px-3 py-2 border border-input bg-background rounded-md"
                    >
                      <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Non-binary">Non-binary</option>
                      <option value="Other">Other</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="ethnicity">Race/Ethnicity</Label>
                    <select
                      id="ethnicity"
                      value={demographics.ethnicity || ''}
                      onChange={(e) => updateField('ethnicity', e.target.value)}
                      className="w-full px-3 py-2 border border-input bg-background rounded-md"
                    >
                      <option value="">Select race/ethnicity</option>
                      <option value="White">White</option>
                      <option value="Black or African American">Black or African American</option>
                      <option value="Hispanic or Latino">Hispanic or Latino</option>
                      <option value="Asian">Asian</option>
                      <option value="Native American">Native American</option>
                      <option value="Pacific Islander">Pacific Islander</option>
                      <option value="Mixed Race">Mixed Race</option>
                      <option value="Other">Other</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      placeholder="City, Country"
                      value={demographics.location || ''}
                      onChange={(e) => updateField('location', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="occupation">Occupation</Label>
                    <Input
                      id="occupation"
                      placeholder="Your job/profession"
                      value={demographics.occupation || ''}
                      onChange={(e) => updateField('occupation', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="education">Education Level</Label>
                    <select
                      id="education"
                      value={demographics.education || ''}
                      onChange={(e) => updateField('education', e.target.value)}
                      className="w-full px-3 py-2 border border-input bg-background rounded-md"
                    >
                      <option value="">Select education level</option>
                      <option value="High School">High School</option>
                      <option value="Some College">Some College</option>
                      <option value="Bachelor's Degree">Bachelor&apos;s Degree</option>
                      <option value="Master's Degree">Master&apos;s Degree</option>
                      <option value="Doctorate">PhD/Doctorate</option>
                      <option value="Trade School">Trade School</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="income">Income Range</Label>
                    <select
                      id="income"
                      value={demographics.income || ''}
                      onChange={(e) => updateField('income', e.target.value)}
                      className="w-full px-3 py-2 border border-input bg-background rounded-md"
                    >
                      <option value="">Select income range</option>
                      <option value="Under $25k">Under $25,000</option>
                      <option value="$25k-$50k">$25,000 - $50,000</option>
                      <option value="$50k-$75k">$50,000 - $75,000</option>
                      <option value="$75k-$100k">$75,000 - $100,000</option>
                      <option value="$100k-$150k">$100,000 - $150,000</option>
                      <option value="$150k+">Over $150,000</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Interests and Views */}
              <div>
                <h4 className="font-medium mb-3 text-sm text-muted-foreground">Interests & Views (Optional)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="interests">Interests & Hobbies</Label>
                    <Textarea
                      id="interests"
                      placeholder="e.g., Technology, Sports, Reading, Travel..."
                      value={demographics.interests || ''}
                      onChange={(e) => updateField('interests', e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label htmlFor="politicalViews">Political Views</Label>
                    <select
                      id="politicalViews"
                      value={demographics.politicalViews || ''}
                      onChange={(e) => updateField('politicalViews', e.target.value)}
                      className="w-full px-3 py-2 border border-input bg-background rounded-md"
                    >
                      <option value="">Select political leaning</option>
                      <option value="very-liberal">Very Liberal</option>
                      <option value="liberal">Liberal</option>
                      <option value="moderate">Moderate</option>
                      <option value="conservative">Conservative</option>
                      <option value="very-conservative">Very Conservative</option>
                      <option value="libertarian">Libertarian</option>
                      <option value="other">Other</option>
                      <option value="prefer-not-to-say">Prefer not to say</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Social Media */}
              <div>
                <h4 className="font-medium mb-3 text-sm text-muted-foreground">Social Media (Optional)</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="twitter">Twitter/X Handle</Label>
                    <Input
                      id="twitter"
                      placeholder="@username"
                      value={demographics.socialMedia?.twitter || ''}
                      onChange={(e) => {
                        const socialMedia = demographics.socialMedia || {}
                        setDemographics((prev: any) => ({
                          ...prev,
                          socialMedia: { ...socialMedia, twitter: e.target.value }
                        }))
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="linkedin">LinkedIn Profile</Label>
                    <Input
                      id="linkedin"
                      placeholder="linkedin.com/in/username"
                      value={demographics.socialMedia?.linkedin || ''}
                      onChange={(e) => {
                        const socialMedia = demographics.socialMedia || {}
                        setDemographics((prev: any) => ({
                          ...prev,
                          socialMedia: { ...socialMedia, linkedin: e.target.value }
                        }))
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="instagram">Instagram Handle</Label>
                    <Input
                      id="instagram"
                      placeholder="@username"
                      value={demographics.socialMedia?.instagram || ''}
                      onChange={(e) => {
                        const socialMedia = demographics.socialMedia || {}
                        setDemographics((prev: any) => ({
                          ...prev,
                          socialMedia: { ...socialMedia, instagram: e.target.value }
                        }))
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-6">
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={handleCancel} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
} 