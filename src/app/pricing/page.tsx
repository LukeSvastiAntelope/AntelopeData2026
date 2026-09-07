"use client"

import { useState } from "react"
import { PublicLayout } from "@/app/components/PublicLayout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { Check } from "lucide-react"

type BillingPeriod = "monthly" | "annual"

interface Plan {
  name: string
  description: string
  monthly: number
  annual: number
  save: number
}

const PLANS: Plan[] = [
  {
    name: "Hyperlocal",
    description: "Small PACs, experimental groups, classroom & civic projects",
    monthly: 49,
    annual: 490,
    save: 98,
  },
  {
    name: "Local",
    description: "Candidates and committees active in a local race",
    monthly: 99,
    annual: 990,
    save: 198,
  },
  {
    name: "State",
    description: "State orgs, multi-county operations, and larger PACs",
    monthly: 299,
    annual: 2990,
    save: 598,
  },
  {
    name: "Federal",
    description: "Congressional campaigns, state HQs, and federal orgs",
    monthly: 499,
    annual: 4990,
    save: 998,
  },
]

const FEATURE_ROWS: { label: string; values: [string, string, string, string] }[] = [
  { label: "Publishable surveys/week", values: ["1", "2", "5", "Unlimited"] },
  { label: "Outreach/week (SMS, WhatsApp, Telegram)", values: ["50", "200", "Higher", "Highest"] },
  { label: "Analytics", values: ["Full", "Full + local", "Regional", "Federal"] },
  { label: "District data overlay & co-pilot", values: ["—", "Yes", "Yes", "Yes"] },
  { label: "Compliance, payments & volunteer tools", values: ["—", "Yes", "Yes", "Yes"] },
  { label: "Priority support", values: ["—", "—", "Yes", "Yes"] },
]

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("annual")

  return (
    <PublicLayout>
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-16">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Simple, transparent pricing</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              The same published price for everyone. Start free — no card, no commitment.
            </p>
          </div>

          {/* Try it free */}
          <div className="grid sm:grid-cols-2 gap-6 mb-16">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Trial</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The full product free for 2 weeks. Run surveys across SMS, WhatsApp, and Telegram with
                  analytics built in. No card required.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Free</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Keep a live account for good. Create surveys and see your baseline analytics, and every
                  past dataset and query stays yours — so you&apos;re ready whenever you need to run.
                </p>
              </CardContent>
            </Card>
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
                Annual — 2 months free
              </Button>
            </div>
          </div>

          {/* Pricing Cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            {PLANS.map((plan) => (
              <Card key={plan.name} className="flex flex-col">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl font-semibold">{plan.name}</CardTitle>
                  <CardDescription className="text-sm mt-1">{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold">
                      ${billingPeriod === "annual" ? plan.annual : plan.monthly}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      /{billingPeriod === "annual" ? "yr" : "mo"}
                    </span>
                  </div>
                  {billingPeriod === "annual" && (
                    <Badge variant="secondary" className="mt-2">
                      Save ${plan.save}
                    </Badge>
                  )}
                </CardContent>
                <CardFooter>
                  <Button className="w-full" asChild>
                    <Link href="/surveys">Get started</Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>

          <p className="text-center text-sm text-muted-foreground mb-16">
            Annual is two months free — pay for ten, get twelve. Enterprise and non-profit pricing
            available on request.
          </p>

          {/* Feature comparison */}
          <div className="mb-16">
            <h2 className="text-2xl font-semibold mb-6 text-center">What each plan includes</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 pr-4 text-sm font-medium text-muted-foreground">
                      What you get
                    </th>
                    {PLANS.map((plan) => (
                      <th key={plan.name} className="text-center py-3 px-4 text-sm font-semibold">
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FEATURE_ROWS.map((row) => (
                    <tr key={row.label} className="border-b border-border">
                      <td className="py-3 pr-4 text-sm text-muted-foreground">{row.label}</td>
                      {row.values.map((value, i) => (
                        <td key={i} className="text-center py-3 px-4 text-sm">
                          {value === "Yes" ? (
                            <Check className="h-4 w-4 text-primary inline-block" />
                          ) : (
                            value
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Every plan */}
          <Card className="mb-12">
            <CardContent className="p-8 text-center">
              <h3 className="font-semibold mb-2">Every plan</h3>
              <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
                Your data stays yours — full access to past datasets, queries, and survey work, always.
                Cancel anytime with 7 days&apos; notice. Full customer support included.
              </p>
            </CardContent>
          </Card>

          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              Have questions? <Link href="/contact" className="text-primary hover:underline">Contact us</Link>
            </p>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}
