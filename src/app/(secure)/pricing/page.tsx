"use client"

import { useState } from "react"
import { PricingCard } from "@/components/pricing/pricing-card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import toast from "react-hot-toast"

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

  return (
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
  )
}
