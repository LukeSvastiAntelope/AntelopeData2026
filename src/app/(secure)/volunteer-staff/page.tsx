'use client'

import Link from 'next/link'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ClipboardList, FileText, Users, Sparkles } from 'lucide-react'

export default function VolunteerStaffPage() {
  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-2">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium text-card-foreground flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Volunteer/Staff management
            </h1>
          </div>
        </div>
        <div className="border-b border-border" />

        <div className="p-6 max-w-4xl space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Create a volunteer form
                </CardTitle>
                <CardDescription>
                  Build an intake form (availability, location preferences, tasks they prefer/avoid).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href="/create/survey">Create form</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  View responses
                </CardTitle>
                <CardDescription>
                  Review volunteer responses and identify who wants to do what, where, and when.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" asChild>
                  <Link href="/surveys">Open surveys</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Summarize & triage
                </CardTitle>
                <CardDescription>
                  Use AI to summarize responses, extract constraints (e.g. “won’t phonebank”), and shortlist matches.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                <Button variant="outline" asChild>
                  <Link href="/python-analysis">Open analysis</Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="text-xs text-muted-foreground">
            Next step: add a dedicated “Volunteer forms” subtype and a streamlined response summary view (rather than relying on generic surveys).
          </div>
        </div>
      </div>
    </div>
  )
}

