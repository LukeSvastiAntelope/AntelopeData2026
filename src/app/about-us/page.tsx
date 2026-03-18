'use client'

import Link from 'next/link'
import { PublicLayout } from '@/app/components/PublicLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function AboutUsPage() {
  return (
    <PublicLayout>
      <div className="flex-1 p-2 w-full bg-background">
        <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
          <div className="px-6 py-4 border-b border-border">
            <h1 className="text-2xl font-semibold">About Us / Blog</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Public-facing content lives here.
            </p>
          </div>
          <div className="p-6 max-w-4xl space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Upload your content</CardTitle>
                <CardDescription>
                  Paste text into chat, or add a markdown file in the repo and point me to it.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>
                  Recommended format: Markdown with sections (## headings), and optionally a short hero blurb.
                </p>
                <Button asChild variant="outline">
                  <Link href="/">Back to home</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}

