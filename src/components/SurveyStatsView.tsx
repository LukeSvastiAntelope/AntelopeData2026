import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BarChart3, Users, MapPin, GraduationCap, Calendar, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, PieChart as RechartsPieChart, LabelList } from 'recharts';



interface SurveyStatsData {
  survey: {
    id: number;
    title: string;
    response_count: number;
    processed_stats?: boolean;
  };
  demographics?: {
    age: Array<{
      range: string;
      count: number;
    }>;
    location: Array<{
      location: string;
      count: number;
    }>;
    education: Array<{
      education: string;
      count: number;
    }>;
  };
  // Summary endpoint format (legacy)
  ageData?: Array<{
    range: string;
    count: number;
  }>;
  locationData?: Array<{
    location: string;
    count: number;
  }>;
  educationData?: Array<{
    education: string;
    count: number;
  }>;
  questions?: Array<{
    id: number;
    prompt: string;
    type: string;
    detected_type?: string;
    distribution: Array<{
      option: string;
      count: number;
      percentage: number;
    }>;
  }>;
  timeline?: Array<{
    date: string;
    responses: number;
  }>;
}

interface SurveyStatsViewProps {
  surveyId: number;
  className?: string;
}

// Chart color scheme (ShadCN neutral zinc theme)
const CHART_COLORS = {
  primary: 'hsl(var(--primary))',
  secondary: 'hsl(var(--secondary))',
  muted: 'hsl(var(--muted))',
  accent: 'hsl(var(--accent))',
  zinc: ['#71717a', '#a1a1aa', '#d4d4d8', '#e4e4e7', '#f4f4f5', '#fafafa'],
  gradient: ['#18181b', '#27272a', '#3f3f46', '#52525b', '#71717a', '#a1a1aa']
}

// ShadCN zinc theme color palette (matching Advanced Analytics)
const COLORS = [
  'hsl(var(--zinc-600))',
  'hsl(var(--zinc-500))', 
  'hsl(var(--zinc-400))',
  'hsl(var(--zinc-700))',
  'hsl(var(--zinc-300))',
  'hsl(var(--zinc-800))'
]

export default function SurveyStatsView({ surveyId, className }: SurveyStatsViewProps) {
  const [data, setData] = useState<SurveyStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const questionsPerPage = 20;

  // Function to determine the best chart type for a question
  const getOptimalChartType = (question: any) => {
    const responseCount = question.distribution.length;
    const questionType = question.type.toLowerCase();
    
    // For yes/no or binary questions, use pie chart
    if (responseCount <= 2) {
      return 'pie';
    }
    
    // For 3 options, use pie chart for true binary-style questions
    if (responseCount === 3) {
      return 'pie';
    }
    
    // For all other cases (4+ options), use horizontal progress bars
    return 'horizontal-bar';
  };

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Try the new stats endpoint first (for surveys with pre-computed stats)
      let response = await fetch(`/api/surveys/${surveyId}/stats`);
      let result: any = null;
      
      if (response.status === 202 || !response.ok) {
        // Fall back to legacy summary if stats not ready or failed
        console.log('Pre-computed stats not available, falling back to legacy summary');
        response = await fetch(`/api/surveys/${surveyId}/summary`);
        
        if (!response.ok) {
          const errorResult = await response.json();
          throw new Error(errorResult.error || 'Failed to fetch survey statistics');
        }
        
        result = await response.json();
        
        // If summary doesn't have questions, try to get them from schema endpoint
        if (!result.questions || result.questions.length === 0) {
          console.log('Summary endpoint has no questions, trying schema endpoint for question data');
          try {
            // Force refresh to get fresh distributions with the fixed schema analysis
            const timestamp = Date.now();
            const forceRefresh = `?refresh=true&t=${timestamp}&v=5`;
            const schemaResponse = await fetch(`/api/surveys/${surveyId}/schema${forceRefresh}`);
            if (schemaResponse.ok) {
              const schemaData = await schemaResponse.json();
              
              // Transform schema questions to our expected format
              if (schemaData.questions && schemaData.questions.length > 0) {
                result.questions = schemaData.questions.map((q: any) => {
                  const summary = q.statistical_summary || {};
                  const distributionRaw = summary.distribution || summary.adoption_rates || {};
                  const distributionEntries = Object.entries(distributionRaw);
                  console.log(`Processing question ${q.id}: "${q.prompt}" (${q.detected_type}) with ${distributionEntries.length} distribution/adoption entries`);
                  
                  return {
                    id: q.id,
                    prompt: q.prompt,
                    type: q.type,
                    detected_type: q.detected_type,
                    distribution: distributionEntries.map(([option, data]: [string, any]) => {
                      const count = typeof data === 'object' ? (data.count || data.users || 0) : (data || 0);
                      const percentage = typeof data === 'object' ? (data.percentage || 0) : 0;
                      return { option, count, percentage };
                    }).filter(item => item.count > 0)
                  };
                });
                console.log(`Added ${result.questions.length} questions from schema endpoint`);
              }
            }
          } catch (schemaError) {
            console.warn('Failed to fetch schema data:', schemaError);
          }
        }
      } else {
        result = await response.json();
      }
      
      console.log('Survey data loaded:', { 
        surveyId, 
        hasDemo: !!result.demographics, 
        hasLegacy: !!result.ageData, 
        questionsCount: result.questions?.length || 0,
        keys: Object.keys(result) 
      });
      setData(result);
      setCurrentPage(1); // Reset to first page when new data loads
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (surveyId) {
      fetchStats();
    }
  }, [surveyId]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-64 ${className}`}>
        <div className="flex items-center gap-3">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading survey statistics...</span>
        </div>
      </div>
    );
  }

  if (error) {
    const isProcessing = error.includes('being processed');
    return (
      <div className={`flex flex-col items-center justify-center h-64 gap-4 ${className}`}>
        <div className="flex items-center gap-2">
          {isProcessing ? (
            <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
          ) : (
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          )}
          <div className="text-sm text-muted-foreground text-center">
            {error}
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={fetchStats}
          className="gap-2"
        >
          <RefreshCw className="h-3 w-3" />
          {isProcessing ? 'Check Again' : 'Retry'}
        </Button>
        {isProcessing && (
          <div className="text-xs text-muted-foreground text-center max-w-md">
            This survey&apos;s statistics are being processed in the background. 
            You can use the Chat tab while waiting, or check back in a few minutes.
          </div>
        )}
      </div>
    );
  }

  if (!data) {
    return (
      <div className={`flex items-center justify-center h-64 ${className}`}>
        <div className="text-sm text-muted-foreground">
          No statistics available
        </div>
      </div>
    );
  }

  // Handle different data formats between stats and summary endpoints
  const demographics = data.demographics || {
    age: data.ageData || [],
    location: data.locationData || [],
    education: data.educationData || []
  };
  const questions = data.questions || [];

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num);
  };

  return (
    <ScrollArea className={`h-full ${className}`}>
      <div className="p-4 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{data.survey.title}</h2>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {formatNumber(data.survey.response_count)} Responses
            </Badge>
            {data.survey.processed_stats && (
              <Badge variant="outline" className="text-green-600 border-green-200">
                Statistics Processed
              </Badge>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Responses</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(data.survey.response_count)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Locations</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{demographics.location?.length || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Education Levels</CardTitle>
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{demographics.education?.length || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Questions</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{questions.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Demographics Section - Matching Advanced Analytics */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* Age Distribution */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Age Distribution</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <ChartContainer 
                config={{ count: { label: "Responses", color: "hsl(var(--zinc-600))" } }} 
                className="aspect-auto h-[160px] w-full"
              >
                <BarChart data={demographics.age || []} margin={{ left: -20, right: 20, top: 12, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                  <XAxis dataKey="range" tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="hsl(var(--zinc-600))" radius={2} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Location Distribution */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Top Locations</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 flex items-center gap-4">
              <div className="flex-shrink-0">
                <ChartContainer 
                  config={{ count: { label: "Responses", color: "hsl(var(--zinc-600))" } }} 
                  className="aspect-square h-[140px] w-[140px]"
                >
                  <RechartsPieChart>
                    <Pie
                      data={(demographics.location || []).filter(d => d.location !== 'Not specified').map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={60}
                      innerRadius={20}
                      paddingAngle={2}
                      dataKey="count"
                    >
                      {(demographics.location || []).filter(d => d.location !== 'Not specified').map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </RechartsPieChart>
                </ChartContainer>
              </div>
              {/* Legend */}
              <div className="flex-1 flex flex-col gap-2 text-xs">
                {(demographics.location || []).filter(d => d.location !== 'Not specified').map((d, i) => (
                  <div key={d.location} className="flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-sm"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    />
                    <span className="text-muted-foreground truncate">{d.location} ({d.count})</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Education Distribution */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Education Levels</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <ChartContainer 
                config={{ 
                  count: { label: "Responses", color: "hsl(var(--zinc-600))" },
                  label: { color: "hsl(var(--background))" }
                }} 
                className="aspect-auto h-[160px] w-full"
              >
                <BarChart 
                  data={demographics.education || []} 
                  accessibilityLayer
                  layout="vertical"
                  margin={{ right: 16 }}
                >
                  <CartesianGrid horizontal={false} />
                  <YAxis 
                    dataKey="education"
                    type="category"
                    tickLine={false} 
                    tickMargin={10}
                    axisLine={false} 
                    tickFormatter={(value) => value.length > 20 ? value.slice(0, 20) + "..." : value}
                    hide
                  />
                  <XAxis dataKey="count" type="number" hide />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent indicator="line" />}
                  />
                  <Bar
                    dataKey="count"
                    layout="vertical"
                    fill="hsl(var(--zinc-600))"
                    radius={4}
                  >
                    <LabelList
                      dataKey="education"
                      position="insideLeft"
                      offset={8}
                      className="fill-white"
                      fontSize={10}
                    />
                    <LabelList
                      dataKey="count"
                      position="right"
                      offset={8}
                      className="fill-foreground"
                      fontSize={10}
                    />
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Question Statistics */}
        {questions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Survey Questions Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(() => {
                  const validQuestions = questions.filter(q => q.prompt && q.prompt.trim().length > 0);
                  const totalPages = Math.ceil(validQuestions.length / questionsPerPage);
                  const startIndex = (currentPage - 1) * questionsPerPage;
                  const endIndex = startIndex + questionsPerPage;
                  const currentQuestions = validQuestions.slice(startIndex, endIndex);
                  
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                          Showing {startIndex + 1}-{Math.min(endIndex, validQuestions.length)} of {validQuestions.length} questions
                        </div>
                        {totalPages > 1 && (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                              disabled={currentPage === 1}
                            >
                              <ChevronLeft className="h-4 w-4" />
                              Previous
                            </Button>
                            <span className="text-sm text-muted-foreground">
                              Page {currentPage} of {totalPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                              disabled={currentPage === totalPages}
                            >
                              Next
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                      
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {currentQuestions.map((question, qIndex) => {
                          const questionNumber = startIndex + qIndex + 1;
                          return (
                            <Card key={question.id} className="h-fit">
                              <CardHeader className="pb-2">
                                <div className="space-y-1">
                                  <CardTitle className="text-sm">Question {questionNumber}</CardTitle>
                                  <div className="text-xs text-muted-foreground line-clamp-2">
                                    {question.prompt}
                                  </div>
                                  <Badge variant="outline" className="text-xs">
                                    {question.type}
                                  </Badge>
                                </div>
                              </CardHeader>
                              <CardContent className="pt-0 pb-4">
                              
                              {/* Show text questions as info cards without charts */}
                              {question.detected_type === 'text' ? (
                                <div className="text-xs text-muted-foreground p-3 bg-muted/20 rounded border-l-4 border-blue-200">
                                  <div className="font-medium text-foreground mb-1">Open-ended Question</div>
                                  <div className="text-xs">This is a free-form text question. Responses are qualitative and would need individual analysis.</div>
                                </div>
                              ) : question.distribution.length > 0 ? (
                                (() => {
                                  const chartType = getOptimalChartType(question);
                                  const topResponses = question.distribution.slice(0, 5);
                                  
                                  if (chartType === 'pie') {
                                    return (
                                      <div className="space-y-3">
                                        <div className="text-xs font-medium text-muted-foreground">
                                          Response Distribution:
                                        </div>
                                        <div className="flex items-center gap-4">
                                          <div className="flex-shrink-0">
                                            <ChartContainer 
                                              config={{ count: { label: "Responses", color: "hsl(var(--zinc-600))" } }} 
                                              className="aspect-square h-[120px] w-[120px]"
                                            >
                                              <RechartsPieChart>
                                                <Pie
                                                  data={topResponses.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))}
                                                  cx="50%"
                                                  cy="50%"
                                                  labelLine={false}
                                                  outerRadius={50}
                                                  innerRadius={15}
                                                  paddingAngle={2}
                                                  dataKey="count"
                                                >
                                                  {topResponses.map((_, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                  ))}
                                                </Pie>
                                                <ChartTooltip content={<ChartTooltipContent />} />
                                              </RechartsPieChart>
                                            </ChartContainer>
                                          </div>
                                          {/* Legend */}
                                          <div className="flex-1 flex flex-col gap-1 text-xs">
                                            {topResponses.map((d, i) => (
                                              <div key={i} className="flex items-center gap-1">
                                                <span
                                                  className="inline-block h-2 w-2 rounded-sm"
                                                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                                                />
                                                <span className="text-muted-foreground truncate">
                                                  {d.option.length > 15 ? d.option.slice(0, 15) + "..." : d.option} ({d.count})
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }
                                  
                                  // horizontal-bar (for all other cases)
                                  return (
                                    <div className="space-y-2">
                                      <div className="text-xs font-medium text-muted-foreground">
                                        Response Distribution (Top 5):
                                      </div>
                                      <div className="space-y-1.5"> {/* More compact spacing */}
                                        {topResponses.map((dist, dIndex) => {
                                          const maxCount = Math.max(...question.distribution.map(d => d.count));
                                          const barWidth = maxCount > 0 ? (dist.count / maxCount) * 100 : 0;
                                          
                                          return (
                                            <div key={dIndex} className="space-y-1">
                                              <div className="flex items-center justify-between text-xs">
                                                <span className="font-medium truncate mr-2 max-w-[120px]">{dist.option}</span>
                                                <span className="text-muted-foreground whitespace-nowrap text-[10px]">
                                                  {formatNumber(dist.count)} ({dist.percentage.toFixed(1)}%)
                                                </span>
                                              </div>
                                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                                <div 
                                                  className="h-full bg-primary rounded-full transition-all duration-300"
                                                  style={{ width: `${barWidth}%` }}
                                                />
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })()
                              ) : (
                                <div className="text-xs text-muted-foreground italic p-2 text-center bg-muted/30 rounded">
                                  Response distribution not yet processed
                                </div>
                              )}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                      
                      {totalPages > 1 && (
                        <div className="flex justify-center pt-4">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                              disabled={currentPage === 1}
                            >
                              <ChevronLeft className="h-4 w-4" />
                              Previous
                            </Button>
                            <span className="text-sm text-muted-foreground">
                              Page {currentPage} of {totalPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                              disabled={currentPage === totalPages}
                            >
                              Next
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}