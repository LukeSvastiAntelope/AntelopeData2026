'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, FileSpreadsheet, BookOpen, Users, Calendar } from 'lucide-react';

interface Survey {
  id: string;
  title: string;
  slug: string;
  status: string;
  response_count: number;
  created_at: string;
}

interface SurveyLoaderProps {
  onSurveyLoad: (surveyData: any, codebook: any) => void;
  disabled?: boolean;
}

export function SurveyLoader({ onSurveyLoad, disabled = false }: SurveyLoaderProps) {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [selectedSurvey, setSelectedSurvey] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingSurveys, setLoadingSurveys] = useState(true);

  // Load user's surveys on component mount
  useEffect(() => {
    const fetchSurveys = async () => {
      try {
        const response = await fetch('/api/surveys');
        if (response.ok) {
          const data = await response.json();
          // Filter surveys with responses
          const surveysWithResponses = data.surveys?.filter((s: Survey) => s.response_count > 0) || [];
          setSurveys(surveysWithResponses);
        }
      } catch (error) {
        console.error('Error fetching surveys:', error);
      } finally {
        setLoadingSurveys(false);
      }
    };

    fetchSurveys();
  }, []);

  const handleLoadSurvey = async () => {
    if (!selectedSurvey) return;

    setLoading(true);
    try {
      // Load both CSV data and codebook in parallel
      const [csvResponse, codebookResponse] = await Promise.all([
        fetch(`/api/surveys/${selectedSurvey}/export-csv`),
        fetch(`/api/surveys/${selectedSurvey}/export-codebook`)
      ]);

      if (!csvResponse.ok || !codebookResponse.ok) {
        throw new Error('Failed to load survey data');
      }

      const csvText = await csvResponse.text();
      const codebook = await codebookResponse.json();

      // Find selected survey details
      const survey = surveys.find(s => s.id === selectedSurvey);

      onSurveyLoad({
        csvData: csvText,
        name: survey?.title || 'Survey Data',
        size: new Blob([csvText]).size,
        surveyId: selectedSurvey
      }, codebook);

    } catch (error) {
      console.error('Error loading survey:', error);
      alert('Failed to load survey data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loadingSurveys) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full"></div>
            <span className="ml-2 text-sm text-muted-foreground">Loading surveys...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Load Survey Data
        </CardTitle>
        <CardDescription>
          Load data directly from your existing surveys for AI analysis
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {surveys.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No surveys with responses found</p>
            <p className="text-sm">Create a survey and collect responses first</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Survey</label>
              <Select value={selectedSurvey} onValueChange={setSelectedSurvey}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a survey to analyze..." />
                </SelectTrigger>
                <SelectContent>
                  {surveys.map((survey) => (
                    <SelectItem key={survey.id} value={survey.id}>
                      <div className="flex items-center justify-between w-full">
                        <div className="flex flex-col items-start">
                          <span className="font-medium">{survey.title}</span>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {survey.response_count} responses
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(survey.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedSurvey && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <BookOpen className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">Auto-loaded features:</span>
                </div>
                <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                  <li>• Survey questions as codebook metadata</li>
                  <li>• Response data formatted for Python analysis</li>
                  <li>• Value labels for categorical questions</li>
                  <li>• Direct database access (no token limits)</li>
                </ul>
              </div>
            )}

            <Button 
              onClick={handleLoadSurvey}
              disabled={!selectedSurvey || loading || disabled}
              className="w-full"
            >
              {loading ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  Loading Survey Data...
                </>
              ) : (
                'Load Survey for Analysis'
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
} 