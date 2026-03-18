'use client'

import Link from 'next/link'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { HandCoins, Upload, Database, FileText } from 'lucide-react'

export default function FundraisingPage() {
  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-2">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium text-card-foreground flex items-center gap-2">
              <HandCoins className="h-4 w-4" />
              Fundraising
            </h1>
          </div>
        </div>
        <div className="border-b border-border" />

        <div className="p-6 max-w-5xl space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Upload your list
                </CardTitle>
                <CardDescription>
                  Bring your own data (CSV/Excel/TSV/TXT, and Word .docx). Segment with commands like “isolate women 35+
                  without college degrees” and export a new file.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href="/fundraising/upload">Start</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Get electoral data
                </CardTitle>
                <CardDescription>
                  Choose from data providers (e.g. NCSL and other public electoral datasets) and import into Antelope.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                <Button variant="outline" asChild>
                  <Link href="/fundraising/data">Browse options</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Fundraising reports
                </CardTitle>
                <CardDescription>
                  View analysis reports and optionally pin selected insights to the dashboard map.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                <Button variant="outline" asChild>
                  <Link href="/fundraising/reports">Open</Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="text-xs text-muted-foreground">
            Note: The “Get electoral data” path is a UI stub until we wire provider APIs/contracts and billing.
          </div>
        </div>
      </div>
    </div>
  )
}

