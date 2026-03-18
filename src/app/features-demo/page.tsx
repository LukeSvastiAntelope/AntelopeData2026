'use client'

import Link from 'next/link'
import { PublicLayout } from '@/app/components/PublicLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function FeaturesDemoPage() {
  return (
    <PublicLayout>
      <div className="flex-1 p-2 w-full bg-background">
        <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
          <div className="px-6 py-4 border-b border-border">
            <h1 className="text-2xl font-semibold">Features + Demo</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Showcase core workflows and add a demo link/video later.
            </p>
          </div>
          <div className="p-6 max-w-4xl space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>What to send me</CardTitle>
                <CardDescription>
                  Send a list of 6–10 “feature cards” (title + 1–2 sentences) and any demo video URL.
                </CardDescription>
              </CardHeader>
              <CardContent>
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

