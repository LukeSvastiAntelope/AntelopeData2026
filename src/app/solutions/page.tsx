'use client'

import Link from 'next/link'
import { PublicLayout } from '@/app/components/PublicLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function SolutionsPricingPage() {
  return (
    <PublicLayout>
      <div className="flex-1 p-2 w-full bg-background">
        <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
          <div className="px-6 py-4 border-b border-border">
            <h1 className="text-2xl font-semibold">Solutions / Pricing</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Describe your packages, what’s included, and how pricing works.
            </p>
          </div>
          <div className="p-6 max-w-4xl space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Content placeholder</CardTitle>
                <CardDescription>
                  Send me your pricing tiers + a short “who it’s for” per tier and I’ll format it.
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

