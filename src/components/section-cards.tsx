"use client"

import { useState, useEffect } from "react"
import { Calculator, Coins, Dices, TrendingUp, TrendingDown } from "lucide-react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useAgent } from "@/app/context/AgentContext"
import { useFetch } from "@/app/utils/lib"
import { Badge } from "@/components/ui/badge"

interface BetsStats {
  total_bets: number
  win_count: string | number
  lose_count: string | number
  open_bets: string | number
  avg_bet_size: number
  non_secret_bets_count: number
  total_amount: string | number
}

export function SectionCards() {
  const [dashboardStats, setDashboardStats] = useState({
    totalBets: 0,
    totalPredictions: 0, 
    successRate: 0,
    avgBetSize: 0
  })
  const [isLoading, setIsLoading] = useState(true)
  const { agent } = useAgent()
  const fetch = useFetch()

  // Fetch dashboard stats
  const fetchDashboardStats = async () => {
    if (!agent) return
    
    try {
      setIsLoading(true)
      
      // Get bet history data and stats
      const betsResponse = await fetch.get("/api/getAgentBetHistory")
      // Get predictions data
      const predictionsResponse = await fetch.get("/api/getPredictions")
      
      console.log('Bets Response:', betsResponse)
      
      if (betsResponse && betsResponse.bets_stats) {
        const stats = betsResponse.bets_stats as BetsStats
        const predictions = predictionsResponse?.predictions || []
        
        // Calculate total bets
        const totalBets = stats.non_secret_bets_count || 0
        
        // Calculate total predictions
        const totalPredictions = predictions.length
        
        // Calculate success rate
        let successRate = 0
        const totalBetsWithResult = Number(stats.win_count) + Number(stats.lose_count)
        if (totalBetsWithResult > 0) {
          successRate = Math.round((Number(stats.win_count) / totalBetsWithResult) * 100)
        }
        
        // Get average bet size
        const avgBetSize = Math.round(stats.avg_bet_size || 0)
        
        console.log('Setting dashboard stats:', {
          totalBets,
          totalPredictions,
          successRate,
          avgBetSize
        })
        
        setDashboardStats({
          totalBets,
          totalPredictions,
          successRate,
          avgBetSize
        })
      } else {
        console.error("Invalid bets response structure:", betsResponse)
      }
    } catch (error) {
      console.error("Error fetching dashboard stats:", error)
    } finally {
      setIsLoading(false)
    }
  }
  
  useEffect(() => {
    if (agent) {
      fetchDashboardStats()
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
              <h3 className="text-sm font-medium text-zinc-400">Total Bets</h3>
              <TrendIndicator value={12.5} />
            </div>
            <div className="flex items-center gap-2 mt-0">
              <h2 className="data-card-text font-semibold pb-2">{isLoading ? "-" : dashboardStats.totalBets}</h2>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-zinc-100">Last 30 days activity</p>
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
              <TrendIndicator value={-20} />
            </div>
            <div className="flex items-center gap-2 mt-0">
              <h2 className="data-card-text font-semibold pb-2">{isLoading ? "-" : dashboardStats.totalPredictions}</h2>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-zinc-100">Last 30 days predictions</p>
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
              <TrendIndicator value={12.5} />
            </div>
            <div className="flex items-center gap-2 mt-0">
              <h2 className="data-card-text font-semibold pb-2">{isLoading ? "-" : `${dashboardStats.successRate}%`}</h2>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-zinc-100">30-day win rate</p>
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
              <TrendIndicator value={4.5} />
            </div>
            <div className="flex items-center gap-2 mt-0">
              <h2 className="data-card-text font-semibold pb-2">{isLoading ? "-" : dashboardStats.avgBetSize}</h2>
            </div>
            <div className="space-y-0">
              <p className="text-sm text-zinc-100">30-day average</p>
              <p className="text-xs text-zinc-400">vs previous 30 days</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  )
} 