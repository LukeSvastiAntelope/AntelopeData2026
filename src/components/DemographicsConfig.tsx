'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Users, 
  Settings, 
  Eye, 
  Save, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  Info,
  UserCheck,
  Building,
  Heart,
  Vote
} from "lucide-react"

interface DemographicTemplate {
  id: number
  field_name: string
  field_type: string
  field_label: string
  field_options: string[] | null
  validation_rules: any
  category: string
  sort_order: number
  help_text: string
  is_active: boolean
}

interface DemographicCategory {
  title: string
  description: string
  fields: DemographicTemplate[]
}

interface DemographicsConfigProps {
  surveyId: string
  onSave?: () => void
  onCancel?: () => void
}

const DemographicsConfig: React.FC<DemographicsConfigProps> = ({ 
  surveyId, 
  onSave, 
  onCancel 
}) => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Configuration state
  const [enabled, setEnabled] = useState(false)
  const [required, setRequired] = useState(false)
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple')
  const [selectedFields, setSelectedFields] = useState<number[]>([])
  const [consentText, setConsentText] = useState('')

  // Templates data
  const [categories, setCategories] = useState<Record<string, DemographicCategory>>({})
  const [existingConfig, setExistingConfig] = useState<any>(null)

  // Category icons
  const categoryIcons = {
    basic: UserCheck,
    professional: Building,
    personal: Heart,
    social: Vote
  }

  useEffect(() => {
    loadData()
  }, [surveyId])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Load demographic templates
      const templatesResponse = await fetch('/api/demographics/templates/categories', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      if (!templatesResponse.ok) {
        throw new Error('Failed to load demographic templates')
      }

      const templatesData = await templatesResponse.json()
      setCategories(templatesData.data)

      // Load existing configuration
      const configResponse = await fetch(`/api/surveys/${surveyId}/demographics/config`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      if (configResponse.ok) {
        const configData = await configResponse.json()
        if (configData.data.config) {
          setExistingConfig(configData.data.config)
          setEnabled(true)
          setRequired(configData.data.config.is_required)
          setMode(configData.data.config.demographic_type)
          setSelectedFields(configData.data.config.selected_fields)
          setConsentText(configData.data.config.consent_text || '')
        }
      }

    } catch (error) {
      console.error('Error loading demographics data:', error)
      setError(error instanceof Error ? error.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleFieldToggle = (fieldId: number, checked: boolean) => {
    if (checked) {
      setSelectedFields([...selectedFields, fieldId])
    } else {
      setSelectedFields(selectedFields.filter(id => id !== fieldId))
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)
      setSuccess(false)

      if (!enabled) {
        // If demographics are disabled, remove configuration
        const response = await fetch(`/api/surveys/${surveyId}/demographics/config`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        })

        if (!response.ok) {
          throw new Error('Failed to remove demographics configuration')
        }
      } else {
        // Save demographics configuration
        if (selectedFields.length === 0) {
          throw new Error('Please select at least one demographic field')
        }

        const response = await fetch(`/api/surveys/${surveyId}/demographics/config`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            demographic_type: mode,
            selected_fields: selectedFields,
            is_required: required,
            consent_text: consentText || null
          })
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to save demographics configuration')
        }
      }

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      
      if (onSave) {
        onSave()
      }

    } catch (error) {
      console.error('Error saving demographics config:', error)
      setError(error instanceof Error ? error.message : 'Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  const getSelectedFieldsCount = () => {
    return selectedFields.length
  }

  const getSelectedFieldsPreview = () => {
    const allFields = Object.values(categories).flatMap(cat => cat.fields)
    return selectedFields
      .map(id => allFields.find(field => field.id === id))
      .filter(Boolean)
      .slice(0, 3)
      .map(field => field!.field_label)
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Loading demographics configuration...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle>Demographics Configuration</CardTitle>
                <CardDescription>
                  Configure demographic data collection for your survey respondents
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="enable-demographics" className="text-sm font-medium">
                Enable Demographics
              </Label>
              <Switch
                id="enable-demographics"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Configuration */}
      {enabled && (
        <>
          {/* Mode Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Configuration Mode</CardTitle>
              <CardDescription>
                Choose between simple pre-defined fields or advanced custom configuration
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={mode} onValueChange={(value) => setMode(value as 'simple' | 'advanced')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="simple" className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4" />
                    Simple Mode
                  </TabsTrigger>
                  <TabsTrigger value="advanced" className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Advanced Mode
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="simple" className="mt-4">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                      <Info className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-blue-900 dark:text-blue-100">Simple Mode</h4>
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          Select from pre-defined demographic fields organized by category. 
                          Perfect for standard market research and surveys.
                        </p>
                      </div>
                    </div>

                    {/* Field Selection by Category */}
                    <div className="space-y-6">
                      {Object.entries(categories).map(([categoryKey, category]) => {
                        const IconComponent = categoryIcons[categoryKey as keyof typeof categoryIcons] || Users
                        const selectedInCategory = category.fields.filter(field => 
                          selectedFields.includes(field.id)
                        ).length

                        return (
                          <Card key={categoryKey}>
                            <CardHeader className="pb-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800">
                                    <IconComponent className="h-4 w-4" />
                                  </div>
                                  <div>
                                    <CardTitle className="text-base">{category.title}</CardTitle>
                                    <CardDescription className="text-sm">
                                      {category.description}
                                    </CardDescription>
                                  </div>
                                </div>
                                {selectedInCategory > 0 && (
                                  <Badge variant="secondary">
                                    {selectedInCategory} selected
                                  </Badge>
                                )}
                              </div>
                            </CardHeader>
                            <CardContent className="pt-0">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {category.fields.map((field) => (
                                  <div key={field.id} className="flex items-start gap-3 p-3 border rounded-lg">
                                    <Checkbox
                                      id={`field-${field.id}`}
                                      checked={selectedFields.includes(field.id)}
                                      onCheckedChange={(checked) => 
                                        handleFieldToggle(field.id, checked as boolean)
                                      }
                                    />
                                    <div className="flex-1 min-w-0">
                                      <Label 
                                        htmlFor={`field-${field.id}`}
                                        className="text-sm font-medium cursor-pointer"
                                      >
                                        {field.field_label}
                                      </Label>
                                      {field.help_text && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                          {field.help_text}
                                        </p>
                                      )}
                                      <Badge variant="outline" className="text-xs mt-1">
                                        {field.field_type}
                                      </Badge>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="advanced" className="mt-4">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 p-4 bg-orange-50 dark:bg-orange-950/20 rounded-lg">
                      <Settings className="h-5 w-5 text-orange-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-orange-900 dark:text-orange-100">Advanced Mode</h4>
                        <p className="text-sm text-orange-700 dark:text-orange-300">
                          Create custom demographic fields with your own questions, field types, and validation rules.
                          Coming soon in Phase 3 of development.
                        </p>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Demographics Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Required Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="required-demographics" className="text-sm font-medium">
                    Required Demographics
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Require respondents to complete demographics before submitting survey
                  </p>
                </div>
                <Switch
                  id="required-demographics"
                  checked={required}
                  onCheckedChange={setRequired}
                />
              </div>

              {/* Consent Text */}
              <div>
                <Label htmlFor="consent-text" className="text-sm font-medium">
                  Privacy Consent Text (Optional)
                </Label>
                <Textarea
                  id="consent-text"
                  placeholder="Enter custom privacy notice or consent text for demographic data collection..."
                  value={consentText}
                  onChange={(e) => setConsentText(e.target.value)}
                  className="mt-1"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This text will be shown to respondents before they fill out demographics
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Preview */}
          {selectedFields.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Preview
                </CardTitle>
                <CardDescription>
                  How demographics will appear to your survey respondents
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Selected Fields:</span>
                    <Badge variant="secondary">
                      {getSelectedFieldsCount()} field{getSelectedFieldsCount() !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {getSelectedFieldsPreview().join(', ')}
                    {getSelectedFieldsCount() > 3 && ` and ${getSelectedFieldsCount() - 3} more...`}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">Required:</span> {required ? 'Yes' : 'No'}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Error/Success Messages */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {success && (
        <Card className="border-green-500">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm">Demographics configuration saved successfully!</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Configuration
            </>
          )}
        </Button>
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}

export default DemographicsConfig 