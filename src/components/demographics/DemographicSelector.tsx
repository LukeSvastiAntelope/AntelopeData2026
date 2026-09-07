'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { 
  Shield, 
  Users, 
  AlertTriangle, 
  CheckCircle, 
  Info,
  Eye,
  EyeOff,
  Contact,
  Briefcase,
  Heart,
  User
} from "lucide-react"
import {
  AnonymityLevel,
  DemographicField,
  SurveyDemographicConfig,
  ANONYMITY_LEVELS,
  DEMOGRAPHIC_FIELDS,
  getAvailableFields,
  getRecommendedFields,
  validateDemographicConfig,
  createDefaultDemographicConfig
} from '@/app/utils/demographic-system-v2'

interface DemographicSelectorProps {
  anonymityLevel: AnonymityLevel;
  selectedFields: DemographicField[];
  onFieldsChange: (fields: DemographicField[]) => void;
  onConfigChange?: (config: SurveyDemographicConfig) => void;
  className?: string;
}

const CategoryIcons = {
  personal: User,
  professional: Briefcase,
  social: Heart,
  contact: Contact
}

const SensitivityColors = {
  low: 'bg-green-100 text-green-800 border-green-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  high: 'bg-red-100 text-red-800 border-red-200'
}

export function DemographicSelector({
  anonymityLevel,
  selectedFields,
  onFieldsChange,
  onConfigChange,
  className = ''
}: DemographicSelectorProps) {
  const [localSelectedFields, setLocalSelectedFields] = useState<DemographicField[]>(selectedFields);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors: string[] }>({ valid: true, errors: [] });

  const levelConfig = ANONYMITY_LEVELS[anonymityLevel];
  const availableFields = getAvailableFields(anonymityLevel);
  const recommendedFields = getRecommendedFields(anonymityLevel);

  // Group fields by category
  const fieldsByCategory = availableFields.reduce((acc, field) => {
    const category = field.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push(field);
    return acc;
  }, {} as Record<string, typeof availableFields>);

  useEffect(() => {
    setLocalSelectedFields(selectedFields);
  }, [selectedFields]);

  useEffect(() => {
    // Validate configuration whenever fields change
    const config: SurveyDemographicConfig = {
      anonymityLevel,
      selectedFields: localSelectedFields,
      isRequired: anonymityLevel !== 'anonymous'
    };

    const validation = validateDemographicConfig(config);
    setValidationResult(validation);

    if (validation.valid && onConfigChange) {
      onConfigChange(config);
    }
  }, [anonymityLevel, localSelectedFields, onConfigChange]);

  const handleFieldToggle = (field: DemographicField, checked: boolean) => {
    let newFields: DemographicField[];
    
    if (checked) {
      newFields = [...localSelectedFields, field];
    } else {
      // Don't allow unchecking required fields
      if (levelConfig.requiredFields.includes(field)) {
        return;
      }
      newFields = localSelectedFields.filter(f => f !== field);
    }

    setLocalSelectedFields(newFields);
    onFieldsChange(newFields);
  };

  const handleSelectRecommended = () => {
    const newFields = [...levelConfig.requiredFields, ...levelConfig.recommendedFields];
    setLocalSelectedFields(newFields);
    onFieldsChange(newFields);
  };

  const handleSelectAll = () => {
    const newFields = availableFields.map(f => f.field);
    setLocalSelectedFields(newFields);
    onFieldsChange(newFields);
  };

  const handleClearOptional = () => {
    const newFields = levelConfig.requiredFields;
    setLocalSelectedFields(newFields);
    onFieldsChange(newFields);
  };

  if (anonymityLevel === 'anonymous') {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <EyeOff className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Anonymous Survey</CardTitle>
          </div>
          <CardDescription>
            No demographic data will be collected for this survey
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              {levelConfig.privacyNote}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>Demographic Configuration</CardTitle>
          </div>
          <Badge variant="outline" className="capitalize">
            {levelConfig.title}
          </Badge>
        </div>
        <CardDescription>
          {levelConfig.description}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Privacy Notice */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {levelConfig.privacyNote}
          </AlertDescription>
        </Alert>

        {/* Validation Errors */}
        {!validationResult.valid && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                {validationResult.errors.map((error, index) => (
                  <div key={index}>• {error}</div>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleSelectRecommended}
            className="text-xs"
          >
            <CheckCircle className="h-3 w-3 mr-1" />
            Use Recommended
          </Button>
          {anonymityLevel === 'semi_anonymous' && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleSelectAll}
              className="text-xs"
            >
              <Users className="h-3 w-3 mr-1" />
              Select All Available
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleClearOptional}
            className="text-xs"
          >
            <Eye className="h-3 w-3 mr-1" />
            Required Only
          </Button>
        </div>

        {/* Field Selection by Category */}
        <div className="space-y-4">
          {Object.entries(fieldsByCategory).map(([category, fields]) => {
            const Icon = CategoryIcons[category as keyof typeof CategoryIcons];
            
            return (
              <div key={category} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <h4 className="font-medium capitalize">{category} Information</h4>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {fields.map((fieldConfig) => {
                    const isSelected = localSelectedFields.includes(fieldConfig.field);
                    const isRequired = levelConfig.requiredFields.includes(fieldConfig.field);
                    const isRecommended = recommendedFields.some(r => r.field === fieldConfig.field);
                    
                    return (
                      <div 
                        key={fieldConfig.field}
                        className="flex items-center space-x-3 p-3 rounded-lg border bg-card"
                      >
                        <Checkbox
                          id={fieldConfig.field}
                          checked={isSelected}
                          onCheckedChange={(checked) => 
                            handleFieldToggle(fieldConfig.field, checked as boolean)
                          }
                          disabled={isRequired}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Label 
                              htmlFor={fieldConfig.field}
                              className="text-sm font-medium cursor-pointer"
                            >
                              {fieldConfig.label}
                            </Label>
                            {isRequired && (
                              <Badge variant="destructive" className="text-xs">
                                Required
                              </Badge>
                            )}
                            {isRecommended && !isRequired && (
                              <Badge variant="secondary" className="text-xs">
                                Recommended
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${SensitivityColors[fieldConfig.sensitivityLevel]}`}
                            >
                              {fieldConfig.sensitivityLevel} sensitivity
                            </Badge>
                            <span className="text-xs text-muted-foreground capitalize">
                              {fieldConfig.type.replace('-', ' ')}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Selection Summary */}
        <Separator />
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {localSelectedFields.length} of {availableFields.length} fields selected
          </span>
          {levelConfig.maxFields && (
            <span>
              Limit: {levelConfig.maxFields} fields
            </span>
          )}
        </div>

        {/* Validation Status */}
        {validationResult.valid && localSelectedFields.length > 0 && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Configuration is valid and ready to use.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
} 