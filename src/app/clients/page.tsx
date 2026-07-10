"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PublicLayout } from "@/app/components/PublicLayout"
import Link from "next/link"
import { Users, Building2, Sparkles } from "lucide-react"

export default function ClientsPage() {
  return (
    <PublicLayout>
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary font-medium text-sm mb-6">
            <Sparkles className="h-4 w-4" />
            Coming Soon Q1 2026
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Our Clients
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            We're building something amazing with early adopters and beta testers. Check back soon to see the companies and teams using Antelope to transform their survey data.
          </p>
        </div>

        {/* Placeholder Card */}
        <Card className="border-2 border-border shadow-lg">
          <CardContent className="p-12">
            <div className="text-center space-y-6">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-muted mb-4">
                <Users className="h-10 w-10 text-muted-foreground" />
              </div>
              <h2 className="text-2xl font-bold">Building Our Community</h2>
              <p className="text-muted-foreground max-w-lg mx-auto">
                We're currently in our beta phase, working closely with early adopters to refine Antelope. 
                As we grow, this page will showcase the innovative teams and organizations leveraging our platform 
                to gain deeper insights from their survey data.
              </p>
              
              <div className="pt-6 space-y-4">
                <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
                  <Building2 className="h-5 w-5" />
                  <span>Trusted by beta testers across various industries</span>
                </div>
              </div>

              <div className="pt-8 flex gap-4 justify-center">
                <Button size="lg" asChild>
                  <Link href="/auth/register">Join Our Beta</Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/contact">Contact Us</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Additional Info */}
        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Interested in being featured as a client case study?
          </p>
          <Link href="/contact" className="text-primary hover:underline font-medium">
            Get in touch with our team
          </Link>
        </div>
      </div>
    </div>
    </PublicLayout>
  )
}
