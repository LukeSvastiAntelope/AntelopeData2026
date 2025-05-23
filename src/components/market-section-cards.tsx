"use client"

import { useState, useEffect } from "react"
import { TrendingUp, TrendingDown } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { useAgent } from "@/app/context/AgentContext"
import { useFetch } from "@/app/utils/lib"
import { IPrediction } from "@/app/utils/interface"

export function MarketSectionCards() {
  const [marketStats, setMarketStats] = useState({
    totalMarkets: 0,
    openMarkets: 0,
    avgProbability: 0,
    marketVolume: 0,
    trends: {
      totalMarkets: 0,
      openMarkets: 0,
      avgProbability: 0,
      marketVolume: 0
    }
  })
  const [isLoading, setIsLoading] = useState(true)
  const { agent } = useAgent()
  const fetch = useFetch()

  // Fetch market stats
  const fetchMarketStats = async () => {
    if (!agent) return
    
    try {
      setIsLoading(true)
      
      // Get current predictions data
      const currentResponse = await fetch.get("/api/getPredictions")
      // Get historical predictions data (30 days ago)
      const historicalResponse = await fetch.get("/api/getPredictions?days=30")
      
      console.log('Current Response:', currentResponse)
      console.log('Historical Response:', historicalResponse)
      
      if (currentResponse?.predictions && historicalResponse?.predictions) {
        const currentPredictions = currentResponse.predictions as IPrediction[]
        const historicalPredictions = historicalResponse.predictions as IPrediction[]
        
        // Calculate current stats
        const totalMarkets = currentPredictions.length || 0
        const openMarkets = currentPredictions.filter((p: IPrediction) => p.status === 'open').length || 0
        
        // Calculate average probability
        let avgProbability = 0
        const predictionsWithAmounts = currentPredictions.filter((p: IPrediction) => {
          const yesAmount = Number(p.yes_amount) || 0
          const noAmount = Number(p.no_amount) || 0
          return yesAmount > 0 || noAmount > 0
        })
        
        if (predictionsWithAmounts.length > 0) {
          const probabilities = predictionsWithAmounts.map((p: IPrediction) => {
            const yesAmount = Number(p.yes_amount) || 0
            const noAmount = Number(p.no_amount) || 0
            const total = yesAmount + noAmount
            // Calculate probability based on yes/no ratio
            return total > 0 ? Math.min(Math.round((yesAmount / total) * 100), 100) : 50
          }).filter(p => !isNaN(p) && p >= 0 && p <= 100) // Filter out invalid probabilities
          
          if (probabilities.length > 0) {
            avgProbability = Math.round(probabilities.reduce((a, b) => a + b, 0) / probabilities.length)
          }
        }
        
        // Calculate market volume (total amount bet across all markets)
        const marketVolume = currentPredictions.reduce((sum: number, p: IPrediction) => {
          const yesAmount = Number(p.yes_amount) || 0
          const noAmount = Number(p.no_amount) || 0
          const totalAmount = yesAmount + noAmount
          return !isNaN(totalAmount) ? sum + totalAmount : sum
        }, 0)

        // Calculate historical stats
        const historicalTotalMarkets = historicalPredictions.length || 0
        const historicalOpenMarkets = historicalPredictions.filter((p: IPrediction) => p.status === 'open').length || 0
        
        // Calculate historical average probability
        let historicalAvgProbability = 0
        const historicalPredictionsWithAmounts = historicalPredictions.filter((p: IPrediction) => {
          const yesAmount = Number(p.yes_amount) || 0
          const noAmount = Number(p.no_amount) || 0
          return yesAmount > 0 || noAmount > 0
        })
        
        if (historicalPredictionsWithAmounts.length > 0) {
          const probabilities = historicalPredictionsWithAmounts.map((p: IPrediction) => {
            const yesAmount = Number(p.yes_amount) || 0
            const noAmount = Number(p.no_amount) || 0
            const total = yesAmount + noAmount
            return total > 0 ? Math.min(Math.round((yesAmount / total) * 100), 100) : 50
          }).filter(p => !isNaN(p) && p >= 0 && p <= 100)
          
          if (probabilities.length > 0) {
            historicalAvgProbability = Math.round(probabilities.reduce((a, b) => a + b, 0) / probabilities.length)
          }
        }

        // Calculate historical market volume
        const historicalMarketVolume = historicalPredictions.reduce((sum: number, p: IPrediction) => {
          const yesAmount = Number(p.yes_amount) || 0
          const noAmount = Number(p.no_amount) || 0
          const totalAmount = yesAmount + noAmount
          return !isNaN(totalAmount) ? sum + totalAmount : sum
        }, 0)

        // Calculate trends (percentage change)
        const calculateTrend = (current: number, historical: number) => {
          if (historical === 0) return 0
          const trend = Math.round(((current - historical) / historical) * 100)
          return !isNaN(trend) ? trend : 0
        }

        const stats = {
          totalMarkets,
          openMarkets,
          avgProbability,
          marketVolume,
          trends: {
            totalMarkets: calculateTrend(totalMarkets, historicalTotalMarkets),
            openMarkets: calculateTrend(openMarkets, historicalOpenMarkets),
            avgProbability: calculateTrend(avgProbability, historicalAvgProbability),
            marketVolume: calculateTrend(marketVolume, historicalMarketVolume)
          }
        }

        console.log('Market Stats Calculation:', {
          current: {
            predictions: predictionsWithAmounts.length,
            avgProbability,
            marketVolume
          },
          historical: {
            predictions: historicalPredictionsWithAmounts.length,
            avgProbability: historicalAvgProbability,
            marketVolume: historicalMarketVolume
          },
          stats
        })
        
        setMarketStats(stats)
      } else {
        console.error("Invalid response structure:", { currentResponse, historicalResponse })
      }
    } catch (error) {
      console.error("Error fetching market stats:", error)
    } finally {
      setIsLoading(false)
    }
  }
  
  useEffect(() => {
    if (agent) {
      fetchMarketStats()
    }
  }, [agent])

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
              <h3 className="text-sm font-medium text-zinc-400">Total Markets</h3>
              <TrendIndicator value={marketStats.trends.totalMarkets} />
            </div>
            <div className="flex items-center gap-2 mt-0">
              <h2 className="data-card-text font-semibold pb-2">{isLoading ? "-" : marketStats.totalMarkets}</h2>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-zinc-100">Growing market variety</p>
              <p className="text-xs text-zinc-400">Compared to last month</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-[250px] bg-zinc-950/50 border-zinc-800 shadow-[0_0_1px_1px_rgba(0,0,0,0.2)]">
        <CardContent className="p-6">
          <div className="space-y-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-400">Open Markets</h3>
              <TrendIndicator value={marketStats.trends.openMarkets} />
            </div>
            <div className="flex items-center gap-2">
              <h2 className="data-card-text font-semibold pb-2">{isLoading ? "-" : marketStats.openMarkets}</h2>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-zinc-100">Active trading opportunities</p>
              <p className="text-xs text-zinc-400">Compared to last month</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-[250px] bg-zinc-950/50 border-zinc-800 shadow-[0_0_1px_1px_rgba(0,0,0,0.2)]">
        <CardContent className="p-6">
          <div className="space-y-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-400">Avg Probability</h3>
              <TrendIndicator value={marketStats.trends.avgProbability} />
            </div>
            <div className="flex items-center gap-2">
              <h2 className="data-card-text font-semibold pb-2">{isLoading ? "-" : `${marketStats.avgProbability}%`}</h2>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-zinc-100">Market confidence level</p>
              <p className="text-xs text-zinc-400">Compared to last month</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-[250px] bg-zinc-950/50 border-zinc-800 shadow-[0_0_1px_1px_rgba(0,0,0,0.2)]">
        <CardContent className="p-6">
          <div className="space-y-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-400">Market Volume</h3>
              <TrendIndicator value={marketStats.trends.marketVolume} />
            </div>
            <div className="flex items-center gap-2">
              <h2 className="data-card-text font-semibold pb-2">{isLoading ? "-" : marketStats.marketVolume}</h2>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-zinc-100">Total trading volume</p>
              <p className="text-xs text-zinc-400">Compared to last month</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  )
} 