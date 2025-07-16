'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { 
  Shield, 
  CheckCircle, 
  AlertTriangle,
  User,
  Mail,
  MapPin,
  Briefcase,
  GraduationCap,
  DollarSign,
  Heart,
  Phone
} from "lucide-react"
import {
  SurveyDemographicConfig,
  DemographicField,
  DEMOGRAPHIC_FIELDS,
  calculateDemographicCompletion,
  ANONYMITY_LEVELS
} from '@/app/utils/demographic-system-v2'

interface DemographicFormProps {
  config: SurveyDemographicConfig;
  initialData?: Record<string, any>;
  onDataChange: (data: Record<string, any>) => void;
  onValidationChange?: (isValid: boolean) => void;
  showProgress?: boolean;
  className?: string;
}

const FieldIcons = {
  name: User,
  email: Mail,
  age: User,
  gender: User,
  location: MapPin,
  occupation: Briefcase,
  education: GraduationCap,
  income: DollarSign,
  political_views: Heart,
  interests: Heart,
  social_media: Heart,
  ethnicity: User,
  marital_status: User,
  household_size: User,
  phone_number: Phone,
} as const;

export function DemographicForm({
  config,
  initialData = {},
  onDataChange,
  onValidationChange,
  showProgress = true,
  className = ''
}: DemographicFormProps) {
  const [formData, setFormData] = useState<Record<string, any>>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const levelConfig = ANONYMITY_LEVELS[config.anonymityLevel];

  useEffect(() => {
    setFormData(initialData);
  }, [initialData]);

  useEffect(() => {
    // Validate form and calculate completion
    const newErrors: Record<string, string> = {};
    
    // Check required fields
    for (const field of levelConfig.requiredFields) {
      if (config.selectedFields.includes(field)) {
        const value = formData[field];
        if (!value || (typeof value === 'string' && value.trim() === '')) {
          newErrors[field] = `${DEMOGRAPHIC_FIELDS[field].label} is required`;
        } else if (field === 'email' && value) {
          // Email validation
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(value)) {
            newErrors[field] = 'Please enter a valid email address';
          }
        } else if (field === 'phone_number' && value) {
          // Phone validation
          const phonePattern = DEMOGRAPHIC_FIELDS[field].validation?.pattern;
          if (phonePattern && !new RegExp(phonePattern).test(value)) {
            newErrors[field] = 'Please enter a valid phone number';
          }
        }
      }
    }

    setErrors(newErrors);
    
    const isValid = Object.keys(newErrors).length === 0;
    onValidationChange?.(isValid);
    onDataChange(formData);
  }, [formData, config, levelConfig, onDataChange, onValidationChange]);

  const handleFieldChange = (field: DemographicField, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setTouched(prev => ({
      ...prev,
      [field]: true
    }));
  };

  const renderField = (field: DemographicField) => {
    const fieldConfig = DEMOGRAPHIC_FIELDS[field];
    const value = formData[field] || '';
    const error = errors[field];
    const isRequired = levelConfig.requiredFields.includes(field);
    const Icon = FieldIcons[field];
    const customLabel = config.customFieldLabels?.[field] || fieldConfig.label;

    const fieldContent = (() => {
      switch (fieldConfig.type) {
        case 'text':
        case 'email':
          return (
            <Input
              id={field}
              type={fieldConfig.type}
              value={value}
              onChange={(e) => handleFieldChange(field, e.target.value)}
              placeholder={`Enter your ${customLabel.toLowerCase()}`}
              className={error ? 'border-red-500' : ''}
            />
          );

        case 'select':
          return (
            <Select
              value={value}
              onValueChange={(newValue) => handleFieldChange(field, newValue)}
            >
              <SelectTrigger className={error ? 'border-red-500' : ''}>
                <SelectValue placeholder={`Select ${customLabel.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {fieldConfig.options?.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );

        case 'multi-select':
          const selectedValues = Array.isArray(value) ? value : [];
          return (
            <div className="space-y-2">
              {fieldConfig.options?.map((option) => (
                <div key={option} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${field}-${option}`}
                    checked={selectedValues.includes(option)}
                    onCheckedChange={(checked) => {
                      let newValues;
                      if (checked) {
                        newValues = [...selectedValues, option];
                      } else {
                        newValues = selectedValues.filter(v => v !== option);
                      }
                      handleFieldChange(field, newValues);
                    }}
                  />
                  <Label htmlFor={`${field}-${option}`} className="text-sm">
                    {option}
                  </Label>
                </div>
              ))}
            </div>
          );

        case 'number':
          return (
            <Input
              id={field}
              type="number"
              value={value}
              onChange={(e) => handleFieldChange(field, e.target.value)}
              placeholder={`Enter ${customLabel.toLowerCase()}`}
              min={fieldConfig.validation?.min}
              max={fieldConfig.validation?.max}
              className={error ? 'border-red-500' : ''}
            />
          );

        default:
          return null;
      }
    })();

    return (
      <div key={field} className="space-y-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor={field} className="text-sm font-medium">
            {customLabel}
          </Label>
          {isRequired && (
            <Badge variant="destructive" className="text-xs">
              Required
            </Badge>
          )}
        </div>
        {fieldContent}
        {error && touched[field] && (
          <p className="text-sm text-red-600 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {error}
          </p>
        )}
      </div>
    );
  };

  // Group fields by category for better organization
  const fieldsByCategory = config.selectedFields.reduce((acc, field) => {
    const fieldConfig = DEMOGRAPHIC_FIELDS[field];
    const category = fieldConfig.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push(field);
    return acc;
  }, {} as Record<string, DemographicField[]>);

  // Calculate completion percentage
  const completion = calculateDemographicCompletion(formData, config);

  if (config.anonymityLevel === 'anonymous') {
    return null; // No form for anonymous surveys
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>Demographic Information</CardTitle>
          </div>
          <Badge variant="outline">
            {levelConfig.title}
          </Badge>
        </div>
        <CardDescription>
          {config.isRequired 
            ? "Please complete your demographic information to continue with the survey."
            : "Providing demographic information is optional but helps with research insights."
          }
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Privacy Notice */}
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            {levelConfig.privacyNote}
          </AlertDescription>
        </Alert>

        {/* Progress indicator */}
        {showProgress && config.selectedFields.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Completion Progress</span>
              <span>{completion.percentage}%</span>
            </div>
            <Progress value={completion.percentage} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {completion.completedFields.length} of {config.selectedFields.length} fields completed
            </p>
          </div>
        )}

        {/* Form fields organized by category */}
        <div className="space-y-6">
          {Object.entries(fieldsByCategory).map(([category, fields], index) => (
            <div key={category}>
              {index > 0 && <Separator />}
              <div className="space-y-4">
                <h3 className="font-medium capitalize text-sm text-muted-foreground">
                  {category} Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {fields.map(renderField)}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Validation summary */}
        {Object.keys(errors).length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                <p className="font-medium">Please fix the following errors:</p>
                {Object.values(errors).map((error, index) => (
                  <div key={index}>• {error}</div>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Completion indicator */}
        {Object.keys(errors).length === 0 && completion.percentage === 100 && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              All demographic information has been completed successfully.
            </AlertDescription>
          </Alert>
        )}

        {/* Custom consent text */}
        {config.consentText && (
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              {config.consentText}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
} 