'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { 
  Users, 
  Save, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  Info,
  UserCheck,
  Building,
  Heart,
  Vote,
  Shield
} from "lucide-react"

interface DemographicField {
  id: number
  field_name: string
  field_type: string
  field_label: string
  field_options: string[] | null
  validation_rules: any
  category: string
  help_text: string
  is_required: boolean
}

interface DemographicsFormProps {
  surveyId: string
  surveyResponseId?: string
  onSubmit?: (responses: Record<string, any>) => void
  onSkip?: () => void
  className?: string
}

const DemographicsForm: React.FC<DemographicsFormProps> = ({ 
  surveyId, 
  surveyResponseId,
  onSubmit, 
  onSkip,
  className = ""
}) => {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [fields, setFields] = useState<DemographicField[]>([])
  const [responses, setResponses] = useState<Record<string, any>>({})
  const [config, setConfig] = useState<any>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  // Category icons
  const categoryIcons = {
    basic: UserCheck,
    professional: Building,
    personal: Heart,
    social: Vote
  }

  useEffect(() => {
    loadDemographicsForm()
  }, [surveyId])

  const loadDemographicsForm = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/surveys/${surveyId}/demographics/form`)
      
      if (!response.ok) {
        if (response.status === 404) {
          // No demographics configured for this survey
          setFields([])
          return
        }
        throw new Error('Failed to load demographics form')
      }

      const data = await response.json()
      setFields(data.fields || [])
      setConfig(data.config || null)

      // Initialize responses object
      const initialResponses: Record<string, any> = {}
      data.fields?.forEach((field: DemographicField) => {
        initialResponses[field.field_name] = field.field_type === 'multi-select' ? [] : ''
      })
      setResponses(initialResponses)

    } catch (error) {
      console.error('Error loading demographics form:', error)
      setError(error instanceof Error ? error.message : 'Failed to load form')
    } finally {
      setLoading(false)
    }
  }

  const validateField = (field: DemographicField, value: any): string | null => {
    const rules = field.validation_rules || {}
    
    // Required field validation
    if (field.is_required || rules.required) {
      if (!value || (Array.isArray(value) && value.length === 0) || value.toString().trim() === '') {
        return `${field.field_label} is required`
      }
    }

    // Type-specific validation
    if (value && value.toString().trim() !== '') {
      switch (field.field_type) {
        case 'text':
          if (rules.minLength && value.length < rules.minLength) {
            return `${field.field_label} must be at least ${rules.minLength} characters`
          }
          if (rules.maxLength && value.length > rules.maxLength) {
            return `${field.field_label} must be no more than ${rules.maxLength} characters`
          }
          break
        case 'number':
          const numValue = Number(value)
          if (isNaN(numValue)) {
            return `${field.field_label} must be a valid number`
          }
          if (rules.min !== undefined && numValue < rules.min) {
            return `${field.field_label} must be at least ${rules.min}`
          }
          if (rules.max !== undefined && numValue > rules.max) {
            return `${field.field_label} must be no more than ${rules.max}`
          }
          break
      }
    }

    return null
  }

  const handleFieldChange = (fieldName: string, value: any) => {
    setResponses(prev => ({ ...prev, [fieldName]: value }))
    
    // Clear validation error for this field
    if (validationErrors[fieldName]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[fieldName]
        return newErrors
      })
    }
  }

  const handleMultiSelectChange = (fieldName: string, option: string, checked: boolean) => {
    const currentValues = responses[fieldName] || []
    let newValues
    
    if (checked) {
      newValues = [...currentValues, option]
    } else {
      newValues = currentValues.filter((v: string) => v !== option)
    }
    
    handleFieldChange(fieldName, newValues)
  }

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {}
    
    fields.forEach(field => {
      const error = validateField(field, responses[field.field_name])
      if (error) {
        errors[field.field_name] = error
      }
    })
    
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async () => {
    if (!validateForm()) {
      setError('Please fix the validation errors before submitting')
      return
    }

    try {
      setSubmitting(true)
      setError(null)

      // If we have an onSubmit callback, use it (for integration with survey submission)
      if (onSubmit) {
        onSubmit(responses)
        return
      }

      // Otherwise, submit demographics directly
      const response = await fetch(`/api/surveys/${surveyId}/demographics/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          survey_response_id: surveyResponseId,
          responses
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to submit demographics')
      }

      setSuccess(true)

    } catch (error) {
      console.error('Error submitting demographics:', error)
      setError(error instanceof Error ? error.message : 'Failed to submit demographics')
    } finally {
      setSubmitting(false)
    }
  }

  const renderField = (field: DemographicField) => {
    const hasError = validationErrors[field.field_name]
    const value = responses[field.field_name] || ''

    switch (field.field_type) {
      case 'text':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.field_name} className="text-sm font-medium">
              {field.field_label}
              {(field.is_required || field.validation_rules?.required) && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </Label>
            <Input
              id={field.field_name}
              value={value}
              onChange={(e) => handleFieldChange(field.field_name, e.target.value)}
              placeholder={field.help_text}
              className={hasError ? 'border-red-500' : ''}
            />
            {field.help_text && !hasError && (
              <p className="text-xs text-muted-foreground">{field.help_text}</p>
            )}
            {hasError && (
              <p className="text-xs text-red-500">{hasError}</p>
            )}
          </div>
        )

      case 'select':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.field_name} className="text-sm font-medium">
              {field.field_label}
              {(field.is_required || field.validation_rules?.required) && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </Label>
            <Select value={value} onValueChange={(value) => handleFieldChange(field.field_name, value)}>
              <SelectTrigger className={hasError ? 'border-red-500' : ''}>
                <SelectValue placeholder="Select an option..." />
              </SelectTrigger>
              <SelectContent>
                {field.field_options?.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {field.help_text && !hasError && (
              <p className="text-xs text-muted-foreground">{field.help_text}</p>
            )}
            {hasError && (
              <p className="text-xs text-red-500">{hasError}</p>
            )}
          </div>
        )

      case 'multi-select':
        return (
          <div key={field.id} className="space-y-2">
            <Label className="text-sm font-medium">
              {field.field_label}
              {(field.is_required || field.validation_rules?.required) && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {field.field_options?.map((option) => (
                <div key={option} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${field.field_name}-${option}`}
                    checked={(value || []).includes(option)}
                    onCheckedChange={(checked) => 
                      handleMultiSelectChange(field.field_name, option, checked as boolean)
                    }
                  />
                  <Label 
                    htmlFor={`${field.field_name}-${option}`}
                    className="text-sm cursor-pointer"
                  >
                    {option}
                  </Label>
                </div>
              ))}
            </div>
            {field.help_text && !hasError && (
              <p className="text-xs text-muted-foreground">{field.help_text}</p>
            )}
            {hasError && (
              <p className="text-xs text-red-500">{hasError}</p>
            )}
          </div>
        )

      case 'number':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.field_name} className="text-sm font-medium">
              {field.field_label}
              {(field.is_required || field.validation_rules?.required) && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </Label>
            <Input
              id={field.field_name}
              type="number"
              value={value}
              onChange={(e) => handleFieldChange(field.field_name, e.target.value)}
              placeholder={field.help_text}
              min={field.validation_rules?.min}
              max={field.validation_rules?.max}
              className={hasError ? 'border-red-500' : ''}
            />
            {field.help_text && !hasError && (
              <p className="text-xs text-muted-foreground">{field.help_text}</p>
            )}
            {hasError && (
              <p className="text-xs text-red-500">{hasError}</p>
            )}
          </div>
        )

      case 'boolean':
        return (
          <div key={field.id} className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id={field.field_name}
                checked={value === true || value === 'true'}
                onCheckedChange={(checked) => handleFieldChange(field.field_name, checked)}
              />
              <Label htmlFor={field.field_name} className="text-sm font-medium cursor-pointer">
                {field.field_label}
                {(field.is_required || field.validation_rules?.required) && (
                  <span className="text-red-500 ml-1">*</span>
                )}
              </Label>
            </div>
            {field.help_text && !hasError && (
              <p className="text-xs text-muted-foreground ml-6">{field.help_text}</p>
            )}
            {hasError && (
              <p className="text-xs text-red-500 ml-6">{hasError}</p>
            )}
          </div>
        )

      default:
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.field_name} className="text-sm font-medium">
              {field.field_label}
              {(field.is_required || field.validation_rules?.required) && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </Label>
            <Textarea
              id={field.field_name}
              value={value}
              onChange={(e) => handleFieldChange(field.field_name, e.target.value)}
              placeholder={field.help_text}
              className={hasError ? 'border-red-500' : ''}
              rows={3}
            />
            {field.help_text && !hasError && (
              <p className="text-xs text-muted-foreground">{field.help_text}</p>
            )}
            {hasError && (
              <p className="text-xs text-red-500">{hasError}</p>
            )}
          </div>
        )
    }
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Loading demographics form...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  // If no demographics configured, don't render anything
  if (fields.length === 0) {
    return null
  }

  // Group fields by category
  const fieldsByCategory = fields.reduce((acc, field) => {
    if (!acc[field.category]) {
      acc[field.category] = []
    }
    acc[field.category].push(field)
    return acc
  }, {} as Record<string, DemographicField[]>)

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10">
            <Users className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <CardTitle>Demographics Information</CardTitle>
            <CardDescription>
              Please provide some basic information about yourself
              {config?.is_required && (
                <span className="text-red-500 ml-1">*Required</span>
              )}
            </CardDescription>
          </div>
        </div>

        {/* Privacy Notice */}
        {config?.consent_text && (
          <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
            <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">Privacy Notice</h4>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                {config.consent_text}
              </p>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Render fields by category */}
        {Object.entries(fieldsByCategory).map(([category, categoryFields]) => {
          const IconComponent = categoryIcons[category as keyof typeof categoryIcons] || Users
          
          return (
            <div key={category} className="space-y-4">
              <div className="flex items-center gap-2 border-b pb-2">
                <IconComponent className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium text-sm uppercase tracking-wide text-muted-foreground">
                  {category} Information
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {categoryFields.map(renderField)}
              </div>
            </div>
          )
        })}

        {/* Error Display */}
        {error && (
          <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-lg">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Success Display */}
        {success && (
          <div className="flex items-center gap-2 text-green-600 bg-green-50 dark:bg-green-950/20 p-3 rounded-lg">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">Demographics submitted successfully!</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-4">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Submit Demographics
              </>
            )}
          </Button>
          
          {onSkip && !config?.is_required && (
            <Button variant="outline" onClick={onSkip}>
              Skip Demographics
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default DemographicsForm 