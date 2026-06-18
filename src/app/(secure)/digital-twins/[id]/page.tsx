'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { 
  ArrowLeft, 
  Brain, 
  Mail, 
  MapPin, 
  Briefcase, 
  GraduationCap, 
  DollarSign,
  Calendar,
  MessageCircle,
  FileText,
  Loader2,
  User
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface DigitalTwinDetail {
  agentToken: string;
  score: number;
  demographics: {
    name?: string;
    email?: string;
    age?: string;
    gender?: string;
    location?: string;
    occupation?: string;
    education?: string;
    income?: string;
    politicalViews?: string;
    interests?: string;
    ethnicity?: string;
  };
  principles: any;
  surveyTitle: string;
  createdAt: string;
  surveys: Array<{
    id: number;
    title: string;
    description: string;
    status: string;
    created_at: string;
    response_count: number;
    submitted_at?: string;
  }>;
}

export default function DigitalTwinDetailPage() {
  const params = useParams();
  const router = useRouter();
  const twinId = params.id as string;
  
  const [twin, setTwin] = useState<DigitalTwinDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTwinDetail();
  }, [twinId]);

  const fetchTwinDetail = async () => {
    try {
      // First get the twin details
      const twinResponse = await fetch('/api/digital-twins/search', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ query: '', topK: 100 })
      });
      
      const twinData = await twinResponse.json();
      if (!twinData.status) {
        throw new Error('Failed to fetch twin data');
      }

      // Find the specific twin by ID (assuming ID is the agentToken)
      const foundTwin = twinData.results.find((t: any) => t.agentToken === twinId);
      if (!foundTwin) {
        throw new Error('Voter profile not found');
      }

      // Get all surveys this voter profile has participated in
      const surveysResponse = await fetch(`/api/digital-twin/${foundTwin.agentToken}/responses`);
      const surveysData = await surveysResponse.json();
      
      let surveys = [];
      if (surveysData.status && surveysData.surveys) {
        surveys = surveysData.surveys.map((survey: any) => ({
          id: survey.id,
          title: survey.title,
          description: survey.description,
          status: 'completed',
          created_at: survey.submitted_at,
          response_count: 1,
          submitted_at: survey.submitted_at
        }));
      }
      
      // If no surveys found via the API, fall back to the survey that created this twin
      if (surveys.length === 0) {
        const fallbackSurveysResponse = await fetch('/api/surveys', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        const fallbackSurveysData = await fallbackSurveysResponse.json();
        const matchingSurvey = fallbackSurveysData.surveys?.find((s: any) => s.title === foundTwin.surveyTitle);
        
        surveys = [{
          id: matchingSurvey?.id || 0,
          title: foundTwin.surveyTitle,
          description: matchingSurvey?.description || `Survey response that created this voter profile`,
          status: 'completed',
          created_at: foundTwin.createdAt,
          response_count: 1,
          submitted_at: foundTwin.createdAt
        }];
      }
      
      const twinDetail: DigitalTwinDetail = {
        ...foundTwin,
        surveys: surveys
      };
      
      setTwin(twinDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load voter profile');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 p-2 w-full bg-background">
        <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
          <div className="px-6 py-4">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="/digital-twins">Voter Profiles</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Loading...</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </div>
          <div className="border-b border-border" />
          <div className="p-4 flex items-center justify-center">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-muted-foreground">Loading voter profile...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !twin) {
    return (
      <div className="flex-1 p-2 w-full bg-background">
        <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
          <div className="px-6 py-4">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="/digital-twins">Voter Profiles</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Error</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </div>
          <div className="border-b border-border" />
          <div className="p-4 flex items-center justify-center">
            <Card className="max-w-md">
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground mb-4">
                  {error || 'Voter profile not found'}
                </p>
                <Button onClick={() => router.push('/digital-twins')} className="w-full">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Voter Profiles
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const twinName = twin.demographics?.name || twin.demographics?.email || 'Anonymous';

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        {/* Header */}
        <div className="px-6 py-4">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/digital-twins">Voter Profiles</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{twinName}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </div>
        
        <div className="border-b border-border" />

        <div className="p-6 space-y-6">
          {/* Twin Overview */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5" />
                    {twinName}
                  </CardTitle>
                  <p className="text-muted-foreground">
                    Voter profile created from survey: {twin.surveyTitle}
                  </p>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Created {formatDistanceToNow(new Date(twin.createdAt), { addSuffix: true })}
                    </div>
                    <Badge variant="outline">
                      Score: {twin.score.toFixed(2)}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Demographics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Demographics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {twin.demographics?.email && (
                  <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <div className="font-medium">Email</div>
                      <div className="text-muted-foreground">{twin.demographics.email}</div>
                    </div>
                  </div>
                )}
                
                {twin.demographics?.age && (
                  <div className="flex items-start gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <div className="font-medium">Age</div>
                      <div className="text-muted-foreground">{twin.demographics.age}</div>
                    </div>
                  </div>
                )}

                {twin.demographics?.gender && (
                  <div className="flex items-start gap-3">
                    <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <div className="font-medium">Gender</div>
                      <div className="text-muted-foreground">{twin.demographics.gender}</div>
                    </div>
                  </div>
                )}

                {twin.demographics?.location && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <div className="font-medium">Location</div>
                      <div className="text-muted-foreground">{twin.demographics.location}</div>
                    </div>
                  </div>
                )}

                {twin.demographics?.occupation && (
                  <div className="flex items-start gap-3">
                    <Briefcase className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <div className="font-medium">Occupation</div>
                      <div className="text-muted-foreground">{twin.demographics.occupation}</div>
                    </div>
                  </div>
                )}

                {twin.demographics?.education && (
                  <div className="flex items-start gap-3">
                    <GraduationCap className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <div className="font-medium">Education</div>
                      <div className="text-muted-foreground">{twin.demographics.education}</div>
                    </div>
                  </div>
                )}

                {twin.demographics?.income && (
                  <div className="flex items-start gap-3">
                    <DollarSign className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <div className="font-medium">Income</div>
                      <div className="text-muted-foreground">{twin.demographics.income}</div>
                    </div>
                  </div>
                )}

                {twin.demographics?.politicalViews && (
                  <div className="flex items-start gap-3">
                    <MessageCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <div className="font-medium">Political Views</div>
                      <div className="text-muted-foreground">{twin.demographics.politicalViews}</div>
                    </div>
                  </div>
                )}

                {twin.demographics?.interests && (
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <div className="font-medium">Interests</div>
                      <div className="text-muted-foreground">{twin.demographics.interests}</div>
                    </div>
                  </div>
                )}

                {twin.demographics?.ethnicity && (
                  <div className="flex items-start gap-3">
                    <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <div className="font-medium">Ethnicity</div>
                      <div className="text-muted-foreground">{twin.demographics.ethnicity}</div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Surveys Taken */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Surveys Taken
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Polls this voter profile has participated in
              </p>
            </CardHeader>
            <CardContent>
              {twin.surveys.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No surveys taken yet</p>
                </div>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-1/3">Survey Title</TableHead>
                        <TableHead className="w-24">Status</TableHead>
                        <TableHead className="w-32">Submitted</TableHead>
                        <TableHead className="w-1/3">Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {twin.surveys.map((survey, index) => (
                        <TableRow 
                          key={survey.id || index}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => survey.id > 0 && router.push(`/surveys/${survey.id}/results`)}
                        >
                          <TableCell className="font-medium max-w-xs">
                            <div className="truncate" title={survey.title}>
                              {survey.title.length > 60 ? survey.title.substring(0, 60) + '...' : survey.title}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={survey.status === 'completed' ? 'default' : 'secondary'}>
                              {survey.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {survey.submitted_at ? formatDistanceToNow(new Date(survey.submitted_at), { addSuffix: true }) : '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-sm">
                            <div className="truncate" title={survey.description}>
                              {survey.description.length > 80 ? survey.description.substring(0, 80) + '...' : survey.description}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Agent Token */}
          <Card className="bg-muted/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Voter Profile Token:</span>
                <Badge variant="secondary" className="font-mono text-xs">
                  {twin.agentToken.slice(0, 8)}...{twin.agentToken.slice(-8)}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
} 