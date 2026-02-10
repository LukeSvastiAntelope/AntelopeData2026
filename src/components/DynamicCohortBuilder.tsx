import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, X, Users, Download, RotateCcw } from 'lucide-react';
import { VOTER_SEGMENT_PRESETS, type VoterSegmentPreset } from '@/app/utils/voter-segment-presets';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  /** Pre-populated filter rules (e.g. from voter segment presets) */
  initialFilters?: FilterRule[];
}

// ---------------------------------------------------------------------------
// Campaign preset categories shown as one-click quick-filter chips
// ---------------------------------------------------------------------------

const CAMPAIGN_PRESETS: { label: string; category: VoterSegmentPreset['category'] }[] = [
  { label: 'Engagement', category: 'engagement' },
  { label: 'Partisan',   category: 'partisan' },
  { label: 'Persuadable', category: 'persuadable' },
  { label: 'Demographic', category: 'demographic' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DynamicCohortBuilder({
  surveyId,
  onSave,
  onCancel,
  isLoading = false,
  initialFilters,
}: DynamicCohortBuilderProps) {
  const [cohortFields, setCohortFields] = useState<CohortField[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [filterRules, setFilterRules] = useState<FilterRule[]>(initialFilters ?? []);
  const [cohortName, setCohortName] = useState('');

  // Live count state
  const [matchCount, setMatchCount] = useState<{ count: number; total: number } | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Expanded preset category (only one open at a time)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Fetch cohort fields
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // Live respondent count — debounced 500 ms after filter changes
  // -----------------------------------------------------------------------
  const fetchCount = useCallback(async (rules: FilterRule[]) => {
    if (!surveyId || rules.length === 0) {
      setMatchCount(null);
      return;
    }

    // Only count when every rule is complete
    const complete = rules.every(r => r.field && r.value && (Array.isArray(r.value) ? r.value.length > 0 : r.value !== ''));
    if (!complete) { setMatchCount(null); return; }

    setCountLoading(true);
    try {
      const res = await fetch(`/api/surveys/${surveyId}/cohort-count`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: rules }),
      });
      const data = await res.json();
      if (data.status) {
        setMatchCount({ count: data.count, total: data.total });
      }
    } catch (e) {
      console.error('Count fetch error', e);
    } finally {
      setCountLoading(false);
    }
  }, [surveyId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchCount(filterRules), 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [filterRules, fetchCount]);

  // -----------------------------------------------------------------------
  // Filter rule CRUD
  // -----------------------------------------------------------------------
  const addFilterRule = () => {
    setFilterRules(prev => [...prev, { questionId: 0, field: '', op: '=', value: '', label: '' }]);
  };

  const updateFilterRule = (index: number, updates: Partial<FilterRule>) => {
    setFilterRules(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...updates };
      return copy;
    });
  };

  const removeFilterRule = (index: number) => {
    setFilterRules(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllFilters = () => {
    setFilterRules([]);
    setCohortName('');
    setMatchCount(null);
    setExpandedCategory(null);
  };

  // -----------------------------------------------------------------------
  // Apply a voter-segment preset as filter rules
  // -----------------------------------------------------------------------
  const applyPreset = (preset: VoterSegmentPreset) => {
    const rules: FilterRule[] = preset.filters.map(f => ({
      questionId: 0,
      field: f.field,
      op: f.op as FilterRule['op'],
      value: f.op === 'IN' ? f.value.split(',') : f.value,
      label: preset.name,
    }));
    setFilterRules(rules);
    setCohortName(preset.name);
    setExpandedCategory(null);
  };

  // -----------------------------------------------------------------------
  // Question select / value change helpers
  // -----------------------------------------------------------------------
  const handleQuestionSelect = (index: number, questionId: number) => {
    const field = cohortFields.find(f => f.questionId === questionId);
    if (!field) return;

    updateFilterRule(index, {
      questionId,
      field: field.fieldName,
      label: field.label,
      value: field.inputType === 'checkbox' ? [] : '',
      op: field.inputType === 'text' ? 'CONTAINS' : field.inputType === 'checkbox' ? 'IN' : '=',
    });
  };

  const handleValueChange = (index: number, value: string | string[]) => {
    updateFilterRule(index, { value });
  };

  // -----------------------------------------------------------------------
  // Auto-suggest cohort name
  // -----------------------------------------------------------------------
  const generateSuggestedName = useCallback(() => {
    if (filterRules.length === 0) return '';
    const parts = filterRules
      .filter(r => r.value && r.value !== '')
      .map(r => (Array.isArray(r.value) ? (r.value.length === 1 ? r.value[0] : `${r.value.length} options`) : String(r.value)));
    return parts.slice(0, 2).join(' + ');
  }, [filterRules]);

  useEffect(() => {
    if (!cohortName && filterRules.length > 0) {
      const suggested = generateSuggestedName();
      if (suggested) setCohortName(suggested);
    }
  }, [filterRules, cohortName, generateSuggestedName]);

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------
  const handleExport = () => {
    const params = new URLSearchParams();
    if (filterRules.length > 0) {
      params.set('filter', JSON.stringify(filterRules));
    }
    window.open(`/api/surveys/${surveyId}/export-csv?${params.toString()}`, '_blank');
  };

  // -----------------------------------------------------------------------
  // Derived state
  // -----------------------------------------------------------------------
  const hasCompleteFilters = filterRules.length > 0 && filterRules.every(r => (r.questionId > 0 || r.field) && r.value && (Array.isArray(r.value) ? r.value.length > 0 : r.value !== ''));
  const canSave = cohortName.trim() !== '' && hasCompleteFilters;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  if (loadingFields) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Loading survey questions...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold mb-1">Create Custom Cohort</h3>
          <p className="text-sm text-muted-foreground">
            Use quick presets or add custom filters to segment respondents
          </p>
        </div>
        {filterRules.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-xs gap-1.5">
            <RotateCcw className="h-3 w-3" /> Clear All
          </Button>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Campaign Quick-Preset Bar                                         */}
      {/* ----------------------------------------------------------------- */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quick Segments</Label>
        <div className="flex flex-wrap gap-1.5">
          {CAMPAIGN_PRESETS.map(({ label, category }) => (
            <button
              key={category}
              onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
              className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                expandedCategory === category
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:border-primary/50 hover:bg-muted/50 text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Expanded preset options */}
        {expandedCategory && (
          <div className="flex flex-wrap gap-1.5 pt-1 pl-1">
            {VOTER_SEGMENT_PRESETS.filter(p => p.category === expandedCategory).map(preset => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset)}
                className="inline-flex items-center px-2.5 py-1 text-xs rounded-full border border-dashed border-muted-foreground/40 hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer"
                title={preset.description}
              >
                {preset.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Manual Filter Rules                                               */}
      {/* ----------------------------------------------------------------- */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-medium">Filter Rules</Label>
          <Button type="button" variant="outline" size="sm" onClick={addFilterRule} className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Filter
          </Button>
        </div>

        {filterRules.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No filters added yet</p>
            <p className="text-xs">Pick a quick segment above or click &quot;Add Filter&quot;</p>
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
            canRemove={true}
          />
        ))}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Live Respondent Count                                             */}
      {/* ----------------------------------------------------------------- */}
      {(matchCount !== null || countLoading) && (
        <div className="flex items-center gap-2 text-sm rounded-md bg-muted/60 px-3 py-2">
          {countLoading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">Counting respondents...</span>
            </>
          ) : matchCount ? (
            <>
              <Users className="h-3.5 w-3.5 text-primary" />
              <span>
                <strong className="text-primary">{matchCount.count.toLocaleString()}</strong>
                {' '}of{' '}
                <span className="text-muted-foreground">{matchCount.total.toLocaleString()}</span>
                {' '}respondents match
              </span>
              {matchCount.count === 0 && (
                <Badge variant="outline" className="ml-auto text-xs text-orange-500 border-orange-300">No matches</Badge>
              )}
            </>
          ) : null}
        </div>
      )}

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

      {/* ----------------------------------------------------------------- */}
      {/* Actions                                                           */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex gap-3 pt-3">
        <Button onClick={() => onSave(cohortName, filterRules)} disabled={!canSave || isLoading} className="flex-1">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save Cohort
        </Button>
        {hasCompleteFilters && (
          <Button variant="secondary" size="icon" onClick={handleExport} title="Export matching respondents as CSV">
            <Download className="h-4 w-4" />
          </Button>
        )}
        <Button variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual filter rule editor
// ---------------------------------------------------------------------------
function FilterRuleEditor({
  rule,
  index,
  cohortFields,
  onQuestionSelect,
  onValueChange,
  onRemove,
  canRemove,
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

  // Demographic / preset-based rule (no questionId, but has a field like party_affiliation)
  const isPresetRule = rule.questionId === 0 && rule.field !== '';

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-3">
          {isPresetRule ? (
            /* Preset summary — compact read-only chip */
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs font-medium capitalize">
                {rule.field.replace(/_/g, ' ')}
              </Badge>
              <span className="text-xs text-muted-foreground">{rule.op}</span>
              <Badge variant="outline" className="text-xs">
                {Array.isArray(rule.value) ? rule.value.join(', ') : String(rule.value)}
              </Badge>
            </div>
          ) : (
            <>
              {/* Question Selection */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Question</Label>
                <Select
                  value={rule.questionId ? rule.questionId.toString() : ''}
                  onValueChange={(value) => onQuestionSelect(index, parseInt(value))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select a question to filter by" />
                  </SelectTrigger>
                  <SelectContent>
                    {cohortFields.map((field) => (
                      <SelectItem key={field.questionId} value={field.questionId.toString()}>
                        <div className="flex flex-col">
                          <span>{field.label.length > 60 ? field.label.substring(0, 60) + '...' : field.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {field.type} &middot; {field.possibleValues?.length || 'text'} options
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Value Selection */}
              {selectedField && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Values</Label>
                  <ValueSelector
                    field={selectedField}
                    value={rule.value}
                    onChange={(value) => onValueChange(index, value)}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Remove Button */}
        {canRemove && (
          <Button variant="ghost" size="sm" onClick={() => onRemove(index)} className="ml-2 h-7 w-7 p-0">
            <X className="h-3.5 w-3.5" />
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