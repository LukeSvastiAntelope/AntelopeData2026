import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, X, Users } from 'lucide-react';

interface CohortField {
  questionId: number;
  label: string;
  type: string;
  fieldName: string;
  inputType: 'select' | 'checkbox' | 'text';
  possibleValues?: { value: string; label: string; count: number }[];
  sampleValues?: string[];
  placeholder?: string;
}

interface FilterRule {
  questionId: number;
  field: string;
  op: '=' | 'IN' | 'CONTAINS';
  value: string | string[];
  label: string;
}

interface DynamicCohortBuilderProps {
  surveyId: number;
  onSave: (name: string, filters: FilterRule[]) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function DynamicCohortBuilder({ 
  surveyId, 
  onSave, 
  onCancel, 
  isLoading = false 
}: DynamicCohortBuilderProps) {
  const [cohortFields, setCohortFields] = useState<CohortField[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);
  const [cohortName, setCohortName] = useState('');
  const [estimatedCount, setEstimatedCount] = useState<number | null>(null);

  // Fetch available fields for this survey
  useEffect(() => {
    if (!surveyId) return;

    const fetchCohortFields = async () => {
      try {
        setLoadingFields(true);
        const response = await fetch(`/api/surveys/${surveyId}/cohort-fields`);
        const data = await response.json();
        
        if (data.status) {
          setCohortFields(data.cohortFields);
        } else {
          console.error('Failed to fetch cohort fields:', data.message);
        }
      } catch (error) {
        console.error('Error fetching cohort fields:', error);
      } finally {
        setLoadingFields(false);
      }
    };

    fetchCohortFields();
  }, [surveyId]);

  // Add a new filter rule
  const addFilterRule = () => {
    setFilterRules([...filterRules, {
      questionId: 0,
      field: '',
      op: '=',
      value: '',
      label: ''
    }]);
  };

  // Update a filter rule
  const updateFilterRule = (index: number, updates: Partial<FilterRule>) => {
    const newRules = [...filterRules];
    newRules[index] = { ...newRules[index], ...updates };
    setFilterRules(newRules);
  };

  // Remove a filter rule
  const removeFilterRule = (index: number) => {
    setFilterRules(filterRules.filter((_, i) => i !== index));
  };

  // Handle question selection
  const handleQuestionSelect = (index: number, questionId: number) => {
    const field = cohortFields.find(f => f.questionId === questionId);
    if (!field) return;

    updateFilterRule(index, {
      questionId: questionId,
      field: field.fieldName,
      label: field.label,
      value: field.inputType === 'checkbox' ? [] : '',
      op: field.inputType === 'text' ? 'CONTAINS' : 
          field.inputType === 'checkbox' ? 'IN' : '='
    });
  };

  // Handle value selection for different input types
  const handleValueChange = (index: number, value: string | string[]) => {
    updateFilterRule(index, { value });
  };

  // Generate a suggested cohort name based on filters
  const generateSuggestedName = () => {
    if (filterRules.length === 0) return '';
    
    const parts = filterRules
      .filter(rule => rule.value && rule.value !== '')
      .map(rule => {
        if (Array.isArray(rule.value)) {
          return rule.value.length === 1 ? rule.value[0] : `${rule.value.length} options`;
        }
        return rule.value;
      });
    
    return parts.slice(0, 2).join(' + ');
  };

  // Auto-suggest name when filters change
  useEffect(() => {
    if (!cohortName && filterRules.length > 0) {
      const suggested = generateSuggestedName();
      if (suggested) {
        setCohortName(suggested);
      }
    }
  }, [filterRules]);

  const canSave = cohortName.trim() && filterRules.length > 0 && 
                  filterRules.every(rule => rule.questionId > 0 && rule.value);

  if (loadingFields) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Loading survey questions...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Create Custom Cohort</h3>
        <p className="text-sm text-muted-foreground">
          Select questions and values to filter survey respondents into a cohort
        </p>
      </div>

      {/* Filter Rules */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-medium">Filter Rules</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addFilterRule}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Filter
          </Button>
        </div>

        {filterRules.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No filters added yet</p>
            <p className="text-sm">Click &quot;Add Filter&quot; to start building your cohort</p>
          </div>
        )}

        {filterRules.map((rule, index) => (
          <FilterRuleEditor
            key={index}
            rule={rule}
            index={index}
            cohortFields={cohortFields}
            onQuestionSelect={handleQuestionSelect}
            onValueChange={handleValueChange}
            onRemove={removeFilterRule}
            canRemove={filterRules.length > 1}
          />
        ))}
      </div>

      {/* Cohort Name */}
      <div className="space-y-2">
        <Label htmlFor="cohort-name">Cohort Name</Label>
        <Input
          id="cohort-name"
          value={cohortName}
          onChange={(e) => setCohortName(e.target.value)}
          placeholder="Enter a descriptive name for this cohort"
        />
      </div>

      {/* Estimated Count */}
      {estimatedCount !== null && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>Estimated {estimatedCount} respondents match these filters</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <Button
          onClick={() => onSave(cohortName, filterRules)}
          disabled={!canSave || isLoading}
          className="flex-1"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save Cohort
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// Individual filter rule editor component
function FilterRuleEditor({
  rule,
  index,
  cohortFields,
  onQuestionSelect,
  onValueChange,
  onRemove,
  canRemove
}: {
  rule: FilterRule;
  index: number;
  cohortFields: CohortField[];
  onQuestionSelect: (index: number, questionId: number) => void;
  onValueChange: (index: number, value: string | string[]) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
}) {
  const selectedField = cohortFields.find(f => f.questionId === rule.questionId);

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-4">
          {/* Question Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Question</Label>
            <Select
              value={rule.questionId ? rule.questionId.toString() : ''}
              onValueChange={(value) => onQuestionSelect(index, parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a question to filter by" />
              </SelectTrigger>
              <SelectContent>
                {cohortFields.map((field) => (
                  <SelectItem key={field.questionId} value={field.questionId.toString()}>
                    <div className="flex flex-col">
                      <span>{field.label.substring(0, 60)}...</span>
                      <span className="text-xs text-muted-foreground">
                        {field.type} • {field.possibleValues?.length || 'text'} options
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Value Selection */}
          {selectedField && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Values</Label>
              <ValueSelector
                field={selectedField}
                value={rule.value}
                onChange={(value) => onValueChange(index, value)}
              />
            </div>
          )}
        </div>

        {/* Remove Button */}
        {canRemove && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemove(index)}
            className="ml-2 h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// Value selector based on field type
function ValueSelector({
  field,
  value,
  onChange
}: {
  field: CohortField;
  value: string | string[];
  onChange: (value: string | string[]) => void;
}) {
  if (field.inputType === 'text') {
    return (
      <div className="space-y-2">
        <Input
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
        {field.sampleValues && field.sampleValues.length > 0 && (
          <div className="text-xs text-muted-foreground">
            <p>Sample responses:</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {field.sampleValues.slice(0, 3).map((sample, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {sample.substring(0, 30)}...
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (field.inputType === 'select') {
    return (
      <Select
        value={value as string}
        onValueChange={(val) => onChange(val)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select a value" />
        </SelectTrigger>
        <SelectContent>
          {field.possibleValues?.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex justify-between w-full">
                <span>{option.label}</span>
                <span className="text-xs text-muted-foreground ml-2">
                  {option.count} responses
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.inputType === 'checkbox') {
    const selectedValues = Array.isArray(value) ? value : [];
    
    return (
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {field.possibleValues?.map((option) => (
          <div key={option.value} className="flex items-center space-x-2">
            <Checkbox
              id={`${field.questionId}-${option.value}`}
              checked={selectedValues.includes(option.value)}
              onCheckedChange={(checked) => {
                if (checked) {
                  onChange([...selectedValues, option.value]);
                } else {
                  onChange(selectedValues.filter(v => v !== option.value));
                }
              }}
            />
            <Label
              htmlFor={`${field.questionId}-${option.value}`}
              className="text-sm flex-1 cursor-pointer flex justify-between"
            >
              <span>{option.label}</span>
              <span className="text-xs text-muted-foreground">
                {option.count}
              </span>
            </Label>
          </div>
        ))}
      </div>
    );
  }

  return null;
} 