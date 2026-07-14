"use client"

import { useState } from "react"
import { PublicLayout } from "@/app/components/PublicLayout"
import { PricingCard } from "@/components/pricing/pricing-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import Link from "next/link"
import toast from "react-hot-toast"
import { Rocket } from "lucide-react"

// Toggle this flag to show/hide full pricing
const SHOW_FULL_PRICING = false

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("annual")

  const handleUpgrade = (planName: string) => {
    toast.success(`Upgrading to ${planName} plan...`)
    // Add actual upgrade logic here
  }

  const plans = [
    {
      name: "Basic",
      description: "Essential tools to manage finances, perfect for individuals and startups.",
      price: billingPeriod === "annual" ? 0 : 0,
      features: [
        "1x Business account & Cards",
        "1x Account",
        "3d transfer or direct debit"
      ],
      isCurrent: false,
      buttonText: "Current Plan"
    },
    {
      name: "Pro",
      description: "Advanced features to track and grow your finances with ease.",
      price: billingPeriod === "annual" ? 89 : 109,
      originalPrice: billingPeriod === "annual" ? 109 : undefined,
      features: [
        "3x Business account & Cards",
        "Unlimited Accounts",
        "500 transfer or direct debit"
      ],
      isPopular: true,
      buttonText: "Upgrade to Pro"
    },
    {
      name: "Enterprise",
      description: "Comprehensive financial tools, including integrations and deep analytics.",
      price: billingPeriod === "annual" ? 139 : 159,
      features: [
        "3x Business account & Cards",
        "Unlimited Accounts",
        "Unlimited transfer or direct debit"
      ],
      buttonText: "Upgrade to Premium"
    }
  ]

  // Beta Message Component
  if (!SHOW_FULL_PRICING) {
    return (
      <PublicLayout>
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-16">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary font-medium text-sm mb-6">
              <Rocket className="h-4 w-4" />
              Beta Testing Phase
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Free Access During Our Beta
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              We're excited to have you on board! Antelope will be completely free for the next 6 months as we work together to perfect the platform during our beta testing period.
            </p>
          </div>

          <Card className="border-2 border-primary/20 shadow-xl">
            <CardContent className="p-12">
              <div className="text-center space-y-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                  <Rocket className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-3xl font-bold">Free Beta Access</h2>
                <div className="space-y-4 text-left max-w-md mx-auto">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-muted-foreground">Unlimited surveys and responses</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-muted-foreground">Full access to AI-powered analytics</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-muted-foreground">Synthetic personas and voter profiles</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-muted-foreground">Priority support and feedback channel</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-muted-foreground">Early access to new features</p>
                  </div>
                </div>
                <div className="pt-6">
                  <div className="text-5xl font-bold mb-2">$0</div>
                  <p className="text-muted-foreground mb-6">For the next 6 months</p>
                  <Button size="lg" className="px-8" asChild>
                    <Link href="/surveys">Start Using Antelope</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="mt-12 text-center">
            <p className="text-sm text-muted-foreground">
              Have questions? <Link href="/contact" className="text-primary hover:underline">Contact us</Link>
            </p>
          </div>
        </div>
      </div>
      </PublicLayout>
    )
  }

  // Full Pricing Page
  return (
    <PublicLayout>
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Clear and Fair Pricing for Everyone.
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Over 100,000 entrepreneurs have launched their businesses effortlessly with Antelope.
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex items-center gap-2 p-1 bg-muted rounded-lg">
            <Button
              variant={billingPeriod === "monthly" ? "default" : "ghost"}
              size="sm"
              onClick={() => setBillingPeriod("monthly")}
              className={billingPeriod === "monthly" ? "bg-background text-foreground shadow-sm" : ""}
            >
              Monthly
            </Button>
            <Button
              variant={billingPeriod === "annual" ? "default" : "ghost"}
              size="sm"
              onClick={() => setBillingPeriod("annual")}
              className={billingPeriod === "annual" ? "bg-background text-foreground shadow-sm" : ""}
            >
              Annual
            </Button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {plans.map((plan) => (
            <PricingCard
              key={plan.name}
              name={plan.name}
              description={plan.description}
              price={plan.price}
              originalPrice={plan.originalPrice}
              billingPeriod={billingPeriod}
              features={plan.features}
              isPopular={plan.isPopular}
              isCurrent={plan.isCurrent}
              buttonText={plan.buttonText}
              onUpgrade={() => handleUpgrade(plan.name)}
            />
          ))}
        </div>
      </div>
    </div>
    </PublicLayout>
  )
}
