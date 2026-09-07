"use client";

import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectItem, SelectContent, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { DynamicCohortBuilder } from '@/components/DynamicCohortBuilder';
import { VOTER_SEGMENT_PRESETS, VoterSegmentPreset } from '@/app/utils/voter-segment-presets';
import type { Cohort, CohortFilterRule } from '../types';

type SurveyOption = { id: number; title: string };

type CohortPanelProps = {
  surveys: SurveyOption[];
  selectedSurveyId: number | null;
  onSurveyChange: (surveyId: number | null) => void;

  cohorts: Cohort[];
  selectedCohortId: number | null;
  onSelectCohort: (cohortId: number | null) => void;

  showCohortCreator: boolean;
  setShowCohortCreator: (show: boolean) => void;

  filterRules: CohortFilterRule[];
  setFilterRules: (rules: CohortFilterRule[]) => void;

  saving: boolean;
  onCreateCohort: (name: string, filters: CohortFilterRule[]) => Promise<void> | void;
  onDeleteCohort: () => Promise<void> | void;

  canDelete?: boolean;
};

export default function CohortPanel(props: CohortPanelProps) {
  const {
    surveys,
    selectedSurveyId,
    onSurveyChange,
    cohorts,
    selectedCohortId,
    onSelectCohort,
    showCohortCreator,
    setShowCohortCreator,
    filterRules,
    setFilterRules,
    saving,
    onCreateCohort,
    onDeleteCohort,
    canDelete,
  } = props;

  return (
    <div className="space-y-4">
      {/* Survey select */}
      <div className="space-y-2">
        <Label>Survey</Label>
        <Select
          value={selectedSurveyId ? String(selectedSurveyId) : 'all'}
          onValueChange={(val) => onSurveyChange(val === 'all' ? null : Number(val))}
        >
          <SelectTrigger>
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent className="z-50">
            <SelectItem value="all">All</SelectItem>
            {surveys.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Cohort select */}
      <div className="space-y-2">
        <Label>Cohort (Filter Respondents)</Label>
        <Select
          value={showCohortCreator ? 'create-new' : selectedCohortId ? String(selectedCohortId) : 'all'}
          onValueChange={(val) => {
            if (val === 'create-new') {
              setShowCohortCreator(true);
              onSelectCohort(null);
              if (filterRules.length === 0) {
                setFilterRules([{ field: '', op: '=', value: '' }]);
              }
            } else {
              setShowCohortCreator(false);
              onSelectCohort(val === 'all' ? null : Number(val));
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="All Respondents" />
          </SelectTrigger>
          <SelectContent className="z-50">
            <SelectItem value="all">All Respondents</SelectItem>
            {cohorts
              .filter((c) => !selectedSurveyId || c.surveyId === selectedSurveyId)
              .map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            {selectedSurveyId && (
              <SelectItem value="create-new" className="text-primary font-medium">
                + Create New Cohort
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Voter Segment Presets */}
      {selectedSurveyId && !showCohortCreator && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Quick Segments</Label>
          <div className="flex flex-wrap gap-1.5">
            {VOTER_SEGMENT_PRESETS.slice(0, 8).map((preset) => (
              <button
                key={preset.id}
                onClick={() => {
                  const rules: CohortFilterRule[] = preset.filters.map(f => ({
                    field: f.field,
                    op: f.op,
                    value: f.value,
                  }));
                  setFilterRules(rules);
                  setShowCohortCreator(true);
                }}
                className="inline-flex items-center px-2 py-1 text-xs rounded-md border border-border hover:border-primary hover:bg-muted/50 transition-colors cursor-pointer"
                title={preset.description}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Dynamic Cohort Creator */}
      {showCohortCreator && selectedSurveyId && (
        <div className="mt-4">
          <DynamicCohortBuilder
            surveyId={selectedSurveyId}
            onSave={async (name, filters) => {
              const cohortFilterRules: CohortFilterRule[] = filters.map((f) => ({
                field: f.field,
                op: f.op,
                value: f.value,
              }));
              await onCreateCohort(name, cohortFilterRules);
            }}
            onCancel={() => {
              setShowCohortCreator(false);
              setFilterRules([]);
            }}
            isLoading={saving}
          />
        </div>
      )}

      {/* Fallback message when no survey selected */}
      {showCohortCreator && !selectedSurveyId && (
        <div className="space-y-4 mt-4 p-4 border rounded-lg bg-muted/50">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Create New Cohort</h3>
              <p className="text-xs text-muted-foreground">
                Please select a survey above to create cohorts for that specific survey
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowCohortCreator(false)}
              className="h-8 w-8 p-0"
            >
              ×
            </Button>
          </div>
        </div>
      )}

      {canDelete && (
        <Button variant="destructive" onClick={() => onDeleteCohort()}>
          Delete
        </Button>
      )}
    </div>
  );
}



