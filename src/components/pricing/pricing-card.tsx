"use client"

import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface PricingCardProps {
  name: string
  description: string
  price: number
  originalPrice?: number
  billingPeriod: "monthly" | "annual"
  features: string[]
  isPopular?: boolean
  isCurrent?: boolean
  buttonText?: string
  onUpgrade?: () => void
}

export function PricingCard({
  name,
  description,
  price,
  originalPrice,
  billingPeriod,
  features,
  isPopular = false,
  isCurrent = false,
  buttonText,
  onUpgrade
}: PricingCardProps) {
  const displayPrice = billingPeriod === "annual" ? price : price
  const periodText = billingPeriod === "annual" ? "per agent, per year, billed annually" : "per agent, per year, billed monthly"

  return (
    <Card className={`relative flex flex-col ${isPopular ? 'border-primary shadow-lg scale-105' : 'border-border'}`}>
      {isPopular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground px-4 py-1">
            ⭐ Most Popular
          </Badge>
        </div>
      )}
      
      <CardHeader className="pb-8 pt-6">
        <CardTitle className="text-xl font-semibold">{name}</CardTitle>
        <CardDescription className="text-sm text-muted-foreground mt-2">
          {description}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="flex-1">
        <div className="mb-6">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold">${displayPrice}</span>
            {originalPrice && (
              <span className="text-lg text-muted-foreground line-through">
                ${originalPrice}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{periodText}</p>
        </div>
        
        <ul className="space-y-3">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-3">
              <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <span className="text-sm text-foreground">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      
      <CardFooter className="flex flex-col gap-4 pt-6">
        <Button
          onClick={onUpgrade}
          disabled={isCurrent}
          className={`w-full ${isPopular ? 'bg-foreground text-background hover:bg-foreground/90' : ''}`}
          variant={isPopular ? 'default' : 'outline'}
        >
          {isCurrent ? 'Current Plan' : buttonText || `Upgrade to ${name}`}
        </Button>
        <p className="text-xs text-center text-muted-foreground">
          30-day money-back guarantee
        </p>
      </CardFooter>
    </Card>
  )
}
