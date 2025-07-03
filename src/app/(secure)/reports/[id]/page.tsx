'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { ArrowLeft, Download, Share2, Clock, FileText, BarChart2, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import ChartRenderer from '@/components/ChartRenderer';

interface Report {
  id: string;
  survey_id: number;
  survey_title: string;
  query: string;
  query_type: string;
  immediate_response: string;
  full_content: string;
  metadata: {
    question_count: number;
    response_count: number;
    complexity_score: number;
    token_budget: number;
    analysis_sections: string[];
    visualizations?: any[];
  };
  status: 'initiated' | 'processing' | 'completed' | 'failed';
  created_at: string;
  completed_at?: string;
}

export default function ReportViewerPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.id as string;
  
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReport();
  }, [reportId]);

  const fetchReport = async () => {
    try {
      const response = await fetch(`/api/reports/${reportId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch report');
      }
      const data = await response.json();
      
      // Transform the API response to match our Report interface
      const transformedReport = {
        id: data.report.id,
        survey_id: data.report.surveyId,
        survey_title: data.report.metadata?.surveyTitle || data.report.survey_title || 'Survey',
        query: data.report.query,
        query_type: data.report.type,
        immediate_response: '',
        full_content: data.sections?.map((s: any) => s.content).join('\n\n') || '',
        metadata: {
          question_count: data.report.metadata?.questionCount || 0,
          response_count: data.report.metadata?.responseCount || 0,
          complexity_score: data.report.metadata?.complexity ? Math.round(data.report.metadata.complexity * 100) : 0,
          token_budget: data.report.tokenUsage || 0,
          analysis_sections: data.sections?.map((s: any) => s.title) || []
        },
        status: data.report.status,
        created_at: data.report.createdAt,
        completed_at: data.report.completedAt
      };
      
      setReport(transformedReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
      toast.error('Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!report) return;
    
    // Create a markdown file with the report content
    const content = `# ${report.survey_title} - Analysis Report

**Query:** ${report.query}  
**Generated:** ${format(new Date(report.created_at), 'PPP')}  
**Type:** ${report.query_type}

---

${report.full_content}

---

*Report ID: ${report.id}*  
*Generated with Antelope Market Maker*`;

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${report.id}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Report downloaded');
  };

  const handleShare = async () => {
    if (!report) return;
    
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Report link copied to clipboard');
    } catch (err) {
      toast.error('Failed to copy link');
    }
  };

  const handleDelete = async () => {
    if (!report) return;
    
    const confirmed = confirm(`Are you sure you want to delete this report? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete report');
      }
      
      toast.success('Report deleted successfully');
      router.push('/reports');
    } catch (err) {
      console.error('Error deleting report:', err);
      toast.error('Failed to delete report');
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
                    <BreadcrumbLink href="/reports">Reports</BreadcrumbLink>
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
            <div className="text-muted-foreground">Loading report...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !report) {
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
                    <BreadcrumbLink href="/reports">Reports</BreadcrumbLink>
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
                  {error || 'Report not found'}
                </p>
                <Button onClick={() => router.push('/reports')} className="w-full">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Reports
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const processingTime = report.completed_at 
    ? Math.round((new Date(report.completed_at).getTime() - new Date(report.created_at).getTime()) / 1000)
    : null;

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        {/* Header */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="/reports">Reports</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{report.query.length > 50 ? report.query.substring(0, 50) + '...' : report.query}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleShare}>
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDelete}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        </div>
        
        <div className="border-b border-border" />

        <div className="p-6">
          {/* Report Card */}
          <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-2xl">{report.survey_title}</CardTitle>
              <p className="text-muted-foreground">{report.query}</p>
            </div>
            <Badge variant={report.status === 'completed' ? 'default' : 'secondary'}>
              {report.status}
            </Badge>
          </div>
          
          <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {format(new Date(report.created_at), 'PPp')}
            </div>
            {processingTime && (
              <div className="flex items-center gap-1">
                <BarChart2 className="h-4 w-4" />
                Generated in {processingTime}s
              </div>
            )}
            <div className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              {report.query_type.replace('_', ' ')}
            </div>
          </div>
        </CardHeader>
        
        <Separator />
        
        <CardContent className="pt-6">
          {/* Metadata Stats */}
          {report.metadata && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{report.metadata.question_count}</div>
                <div className="text-sm text-muted-foreground">Questions</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{report.metadata.response_count}</div>
                <div className="text-sm text-muted-foreground">Responses</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{report.metadata.complexity_score}%</div>
                <div className="text-sm text-muted-foreground">Complexity</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{(report.metadata.token_budget / 1000).toFixed(1)}k</div>
                <div className="text-sm text-muted-foreground">Tokens</div>
              </div>
            </div>
          )}
          
          {/* Report Content */}
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {report.full_content}
            </ReactMarkdown>
          </div>
          
          {/* Visualizations */}
          {report.metadata?.visualizations && report.metadata.visualizations.length > 0 && (
            <>
              <Separator className="my-8" />
              <div className="space-y-6">
                <h3 className="text-lg font-semibold">Visualizations</h3>
                {report.metadata.visualizations.map((viz: any, index: number) => (
                  <div key={index} className="border rounded-lg p-4">
                    <ChartRenderer spec={viz} />
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
        </div>
      </div>
    </div>
  );
} 