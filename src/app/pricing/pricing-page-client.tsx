"use client"

import { useState } from "react"
import { PublicLayout } from "@/app/components/PublicLayout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { Check } from "lucide-react"
import type { PricingSheetContent } from "@/app/utils/database/content-sheet-repo"

type BillingPeriod = "monthly" | "annual"

export function PricingPageClient({ sheet }: { sheet: PricingSheetContent }) {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("annual")
  const plans = sheet.plans
  const featureRows = sheet.featureRows

  return (
    <PublicLayout>
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-16">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">{sheet.headline}</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {sheet.subheadline}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-6 mb-16">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{sheet.trial.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {sheet.trial.body}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{sheet.free.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {sheet.free.body}
                </p>
              </CardContent>
            </Card>
          </div>

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

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            {plans.map((plan) => (
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
            {sheet.footnote}
          </p>

          <div className="mb-16">
            <h2 className="text-2xl font-semibold mb-6 text-center">What each plan includes</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 pr-4 text-sm font-medium text-muted-foreground">
                      What you get
                    </th>
                    {plans.map((plan) => (
                      <th key={plan.name} className="text-center py-3 px-4 text-sm font-semibold">
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {featureRows.map((row) => (
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

          <Card className="mb-12">
            <CardContent className="p-8 text-center">
              <h3 className="font-semibold mb-2">{sheet.everyPlan.title}</h3>
              <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
                {sheet.everyPlan.body}
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
