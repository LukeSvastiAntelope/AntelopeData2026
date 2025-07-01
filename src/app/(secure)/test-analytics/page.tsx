'use client'

import { SurveyAnalyticsDashboard } from '@/components/SurveyAnalyticsDashboard'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function TestAnalyticsPage() {
  return (
    <div className="flex-1 p-6 w-full bg-background">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/surveys" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Survey Analytics Dashboard</h1>
            <p className="text-muted-foreground">
              Advanced analytics powered by schema analysis
            </p>
          </div>
          <Badge variant="outline" className="ml-auto">
            Test Environment
          </Badge>
        </div>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>Pew Research Survey Analytics</CardTitle>
            <CardDescription>
              This dashboard demonstrates our advanced survey analytics system using the 
              Pew Research &ldquo;Social Media Use in 2021&rdquo; synthetic dataset (Survey ID: 49).
              The system automatically detects question types, generates statistical fact sheets, 
              and provides interactive visualizations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="font-medium">Key Features:</div>
                <ul className="text-muted-foreground mt-1 space-y-1">
                  <li>• Automatic question type detection</li>
                  <li>• Pre-computed statistical fact sheets</li>
                  <li>• Interactive ShadCN charts</li>
                  <li>• Smart query processing</li>
                </ul>
              </div>
              <div>
                <div className="font-medium">Performance:</div>
                <ul className="text-muted-foreground mt-1 space-y-1">
                  <li>• 80%+ token reduction</li>
                  <li>• &lt;100ms response times</li>
                  <li>• Scalable architecture</li>
                  <li>• Real-time insights</li>
                </ul>
              </div>
              <div>
                <div className="font-medium">Visualizations:</div>
                <ul className="text-muted-foreground mt-1 space-y-1">
                  <li>• Platform adoption rates</li>
                  <li>• Usage pattern analysis</li>
                  <li>• Demographic breakdowns</li>
                  <li>• Analysis recommendations</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Analytics Dashboard */}
        <SurveyAnalyticsDashboard surveyId={49} />
      </div>
    </div>
  )
} 