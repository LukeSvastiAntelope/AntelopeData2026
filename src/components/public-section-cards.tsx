"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp as TrendingUpIcon, TrendingDown as TrendingDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"

interface MarketStats {
  total_bets: number
  total_predictions: number
  avg_success_rate: number
  avg_bet_size: number
  trends: {
    bets: number
    predictions: number
    success_rate: number
    bet_size: number
  }
}

export function PublicSectionCards() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [marketStats, setMarketStats] = useState<MarketStats>({
    total_bets: 0,
    total_predictions: 0,
    avg_success_rate: 0,
    avg_bet_size: 0,
    trends: {
      bets: 0,
      predictions: 0,
      success_rate: 0,
      bet_size: 0
    }
  })

  // Fetch public market stats
  const fetchMarketStats = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/getPublicMarketStats')
      const data = await response.json()
      
      if (data.status) {
        setMarketStats(data.stats)
      }
    } catch (error) {
      console.error("Error fetching market stats:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchMarketStats()
  }, [])

  const TrendIndicator = ({ value }: { value: number }) => (
    <div className="flex items-center rounded-full bg-muted px-2 py-1 text-xs">
      {value >= 0 ? (
        <>
          <TrendingUpIcon className="mr-1 h-3 w-3 text-emerald-500" />
          <span className="text-foreground">+{value}%</span>
        </>
      ) : (
        <>
          <TrendingDownIcon className="mr-1 h-3 w-3 text-red-500" />
          <span className="text-foreground">{value}%</span>
        </>
      )}
    </div>
  )

  return (
    <>
      <Card className="min-w-[250px] bg-card border-border shadow-sm">
        <CardContent className="p-6">
          <div className="space-y-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">Total Bets</h3>
              <TrendIndicator value={marketStats.trends.bets} />
            </div>
            <div className="flex items-center gap-2 mt-0">
              <h2 className="data-card-text font-semibold pb-2">{isLoading ? "-" : marketStats.total_bets}</h2>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-foreground">Platform-wide 30-day stats</p>
              <p className="text-xs text-muted-foreground">vs previous 30 days</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-[250px] bg-card border-border shadow-sm">
        <CardContent className="p-6">
          <div className="space-y-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">Total Predictions</h3>
              <TrendIndicator value={marketStats.trends.predictions} />
            </div>
            <div className="flex items-center gap-2 mt-0">
              <h2 className="data-card-text font-semibold pb-2">{isLoading ? "-" : marketStats.total_predictions}</h2>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-foreground">Platform-wide 30-day stats</p>
              <p className="text-xs text-muted-foreground">vs previous 30 days</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-[250px] bg-card border-border shadow-sm">
        <CardContent className="p-6">
          <div className="space-y-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">Success Rate</h3>
              <TrendIndicator value={marketStats.trends.success_rate} />
            </div>
            <div className="flex items-center gap-2 mt-0">
              <h2 className="data-card-text font-semibold pb-2">{isLoading ? "-" : `${marketStats.avg_success_rate}%`}</h2>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-foreground">Platform-wide 30-day stats</p>
              <p className="text-xs text-muted-foreground">vs previous 30 days</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-[250px] bg-card border-border shadow-sm">
        <CardContent className="p-6">
          <div className="space-y-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">Average Bet Size</h3>
              <TrendIndicator value={marketStats.trends.bet_size} />
            </div>
            <div className="flex items-center gap-2 mt-0">
              <h2 className="data-card-text font-semibold pb-2">{isLoading ? "-" : marketStats.avg_bet_size}</h2>
            </div>
            <div className="space-y-0">
              <p className="text-sm text-foreground">Platform-wide 30-day stats</p>
              <p className="text-xs text-muted-foreground">vs previous 30 days</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="col-span-full flex justify-center mt-4">
        <Button 
          onClick={() => router.push('/login')}
          className="bg-primary text-primary-foreground hover:bg-primary/90 mr-2"
        >
          Login
        </Button>
        <Button 
          onClick={() => router.push('/register')}
          variant="outline"
          className="border-border text-foreground hover:bg-accent hover:text-accent-foreground"
        >
          Register
        </Button>
      </div>
    </>
  )
} 