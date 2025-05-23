"use client"

import { TrendingUp, TrendingDown } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
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
    <div className="flex items-center rounded-full bg-zinc-900 px-2 py-1 text-xs">
      {value >= 0 ? (
        <>
          <TrendingUp className="mr-1 h-3 w-3 text-emerald-500" />
          <span className="text-zinc-100">+{value}%</span>
        </>
      ) : (
        <>
          <TrendingDown className="mr-1 h-3 w-3 text-red-500" />
          <span className="text-zinc-100">{value}%</span>
        </>
      )}
    </div>
  )

  return (
    <>
      <Card className="min-w-[250px] bg-zinc-950/50 border-zinc-800 shadow-[0_0_1px_1px_rgba(0,0,0,0.2)]">
        <CardContent className="p-6">
          <div className="space-y-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-400">Total Bets</h3>
              <TrendIndicator value={marketStats.trends.bets} />
            </div>
            <div className="flex items-center gap-2 mt-0">
              <h2 className="data-card-text font-semibold pb-2">{isLoading ? "-" : marketStats.total_bets}</h2>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-zinc-100">Platform-wide 30-day stats</p>
              <p className="text-xs text-zinc-400">vs previous 30 days</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-[250px] bg-zinc-950/50 border-zinc-800 shadow-[0_0_1px_1px_rgba(0,0,0,0.2)]">
        <CardContent className="p-6">
          <div className="space-y-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-400">Total Predictions</h3>
              <TrendIndicator value={marketStats.trends.predictions} />
            </div>
            <div className="flex items-center gap-2 mt-0">
              <h2 className="data-card-text font-semibold pb-2">{isLoading ? "-" : marketStats.total_predictions}</h2>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-zinc-100">Platform-wide 30-day stats</p>
              <p className="text-xs text-zinc-400">vs previous 30 days</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-[250px] bg-zinc-950/50 border-zinc-800 shadow-[0_0_1px_1px_rgba(0,0,0,0.2)]">
        <CardContent className="p-6">
          <div className="space-y-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-400">Success Rate</h3>
              <TrendIndicator value={marketStats.trends.success_rate} />
            </div>
            <div className="flex items-center gap-2 mt-0">
              <h2 className="data-card-text font-semibold pb-2">{isLoading ? "-" : `${marketStats.avg_success_rate}%`}</h2>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-zinc-100">Platform-wide 30-day stats</p>
              <p className="text-xs text-zinc-400">vs previous 30 days</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-[250px] bg-zinc-950/50 border-zinc-800 shadow-[0_0_1px_1px_rgba(0,0,0,0.2)]">
        <CardContent className="p-6">
          <div className="space-y-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-400">Average Bet Size</h3>
              <TrendIndicator value={marketStats.trends.bet_size} />
            </div>
            <div className="flex items-center gap-2 mt-0">
              <h2 className="data-card-text font-semibold pb-2">{isLoading ? "-" : marketStats.avg_bet_size}</h2>
            </div>
            <div className="space-y-0">
              <p className="text-sm text-zinc-100">Platform-wide 30-day stats</p>
              <p className="text-xs text-zinc-400">vs previous 30 days</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="col-span-full flex justify-center mt-4">
        <Button 
          onClick={() => router.push('/login')}
          className="bg-blue-600 hover:bg-blue-700 mr-2"
        >
          Login
        </Button>
        <Button 
          onClick={() => router.push('/register')}
          variant="outline"
          className="border-zinc-700 hover:bg-zinc-800"
        >
          Register
        </Button>
      </div>
    </>
  )
} 