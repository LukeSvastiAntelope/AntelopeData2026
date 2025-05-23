"use client"

import { useState } from "react"
import Link from "next/link"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { CircleEllipsis } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { formatDistanceToNow } from "date-fns"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { ILeaderboardData } from "@/app/utils/interface"
import Image from "next/image"

export interface PredictionItem {
  id: string
  description: string
  source: string
  predicted_outcome: string
  creator_choice: string
  bets_count: number
  status: string
  bet_amount: number
  resolution_date: string
  str_thumb: string
  outcome: string
  created_at: string
  yes_amount?: number
  no_amount?: number
  agent_bets?: any[]
  league_id: number
}

interface MarketsTabsProps {
  predictionsData: {
    myPredictions: PredictionItem[]
    general: PredictionItem[]
    sports: PredictionItem[]
    crypto: PredictionItem[]
    markets: PredictionItem[]
  }
  leaderboardData?: ILeaderboardData[]
  isLoading: {
    myPredictions: boolean
    general: boolean
    sports: boolean
    crypto: boolean
    markets: boolean
    leaderboard?: boolean
    loadingMore?: {
      myPredictions: boolean
      general: boolean
      sports: boolean
      crypto: boolean
      markets: boolean
      leaderboard?: boolean
    }
  }
  pagination: {
    myPredictions: { page: number; hasMore: boolean }
    general: { page: number; hasMore: boolean }
    sports: { page: number; hasMore: boolean }
    crypto: { page: number; hasMore: boolean }
    markets: { page: number; hasMore: boolean }
    leaderboard?: { page: number; hasMore: boolean }
  }
  onLoadMore: {
    myPredictions: () => void
    general: () => void
    sports: () => void
    crypto: () => void
    markets: () => void
    leaderboard?: () => void
  }
}

export function MarketsTabs({ 
  predictionsData,
  leaderboardData = [],
  isLoading,
  pagination,
  onLoadMore
}: MarketsTabsProps) {
  const [activeTab, setActiveTab] = useState("sports")
  const [searchTerm, setSearchTerm] = useState("")
  
  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true })
    } catch (e) {
      return dateString
    }
  }

  // Calculate probability from yes/no amounts
  const calculateProbability = (item: PredictionItem) => {
    if (!item.yes_amount && !item.no_amount) return '50%'
    
    const yesAmount = item.yes_amount || 0
    const noAmount = item.no_amount || 0
    const total = yesAmount + noAmount
    
    if (total === 0) return '50%'
    return `${Math.round((yesAmount / total) * 100)}%`
  }

  const filterPredictions = (predictions: PredictionItem[]) => {
    if (!searchTerm) return predictions
    const term = searchTerm.toLowerCase()
    return predictions.filter(p => p.description.toLowerCase().includes(term))
  }

  const renderPredictionsTable = (predictions: PredictionItem[], category: keyof typeof predictionsData) => (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Input
          placeholder="Search predictions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
      </div>
      
      <div className="rounded-lg border border-zinc-800">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Market</TableHead>
              <TableHead className="w-[15%]">Odds</TableHead>
              <TableHead className="w-[15%]">Status</TableHead>
              <TableHead className="w-[15%]">Resolution</TableHead>
              <TableHead className="w-[15%]">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading[category] ? (
              Array(5).fill(0).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5} className="h-14">
                    <div className="flex items-center justify-center">
                      <Skeleton className="h-4 w-full" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : filterPredictions(predictions).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <CircleEllipsis className="h-10 w-10 text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No predictions available</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filterPredictions(predictions).map((prediction) => (
                <TableRow key={prediction.id}>
                  <TableCell className="font-medium max-w-0">
                    <Link 
                      href={`/predictions/${prediction.id}`}
                      className="truncate block hover:text-white transition-colors"
                    >
                      {prediction.description}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{calculateProbability(prediction)}</TableCell>
                  <TableCell>
                    <Badge variant={prediction.status === 'open' ? 'outline' : 'secondary'}>
                      {prediction.status === 'open' ? 'Open' : 'Resolved'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {prediction.status === 'resolved' && (
                      <Badge variant="outline" 
                        className={prediction.outcome === 'YES' ? 'border-emerald-500 text-emerald-500' : 'border-red-500 text-red-500'}>
                        {prediction.outcome}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(prediction.created_at)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        
        {pagination[category].hasMore && (
          <div className="flex justify-center p-4 border-t border-zinc-800">
            <Button 
              onClick={onLoadMore[category]}
              disabled={isLoading.loadingMore?.[category]}
              variant="outline"
            >
              {isLoading.loadingMore?.[category] ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-current border-r-transparent animate-spin"></span>
                  Loading...
                </span>
              ) : (
                "Load More"
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  )

  const renderLeaderboardTable = () => (
    <div className="rounded-lg border border-zinc-800">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[10%]">Rank</TableHead>
            <TableHead className="w-[30%]">Agent</TableHead>
            <TableHead className="w-[15%]">Win Rate</TableHead>
            <TableHead className="w-[15%]">Total Bets</TableHead>
            <TableHead className="w-[15%]">Wins</TableHead>
            <TableHead className="w-[15%]">Total Winnings</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading.leaderboard ? (
            Array(5).fill(0).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={6} className="h-14">
                  <div className="flex items-center justify-center">
                    <Skeleton className="h-4 w-full" />
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : leaderboardData.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-32 text-center">
                <div className="flex flex-col items-center justify-center">
                  <CircleEllipsis className="h-10 w-10 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No leaderboard data available</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            leaderboardData.map((agent) => (
              <TableRow key={agent.id}>
                <TableCell className="font-medium">#{agent.rank}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Image
                      src={agent.image || "/assets/images/logo-simple.svg"}
                      alt={`${agent.name}'s profile picture`}
                      width={32}
                      height={32}
                      className="rounded-full"
                    />
                    <span className="font-medium">{agent.name}</span>
                  </div>
                </TableCell>
                <TableCell>{(agent.win_rate * 100).toFixed(1)}%</TableCell>
                <TableCell>{agent.bets_count}</TableCell>
                <TableCell>{agent.wins}</TableCell>
                <TableCell>{agent.total_winnings.toLocaleString()}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      
      {pagination.leaderboard?.hasMore && (
        <div className="flex justify-center p-4 border-t border-zinc-800">
          <Button 
            onClick={onLoadMore.leaderboard}
            disabled={isLoading.loadingMore?.leaderboard}
            variant="outline"
          >
            {isLoading.loadingMore?.leaderboard ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-current border-r-transparent animate-spin"></span>
                Loading...
              </span>
            ) : (
              "Load More"
            )}
          </Button>
        </div>
      )}
    </div>
  )

  return (
    <div>
      <div className="flex items-center space-x-1 border-b border-zinc-800 mb-4">
        <Button 
          variant="ghost" 
          onClick={() => setActiveTab("sports")} 
          className={`rounded-none border-b-2 px-4 ${activeTab === "sports" ? "border-b-primary text-foreground" : "border-b-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Sports
        </Button>
        <Button 
          variant="ghost" 
          onClick={() => setActiveTab("general")} 
          className={`rounded-none border-b-2 px-4 ${activeTab === "general" ? "border-b-primary text-foreground" : "border-b-transparent text-muted-foreground hover:text-foreground"}`}
        >
          General
        </Button>
        <Button 
          variant="ghost" 
          onClick={() => setActiveTab("crypto")} 
          className={`rounded-none border-b-2 px-4 ${activeTab === "crypto" ? "border-b-primary text-foreground" : "border-b-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Crypto
        </Button>
        <Button 
          variant="ghost" 
          onClick={() => setActiveTab("markets")} 
          className={`rounded-none border-b-2 px-4 ${activeTab === "markets" ? "border-b-primary text-foreground" : "border-b-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Markets
        </Button>
        <Button 
          variant="ghost" 
          onClick={() => setActiveTab("leaderboard")} 
          className={`rounded-none border-b-2 px-4 ${activeTab === "leaderboard" ? "border-b-primary text-foreground" : "border-b-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Leaderboard
        </Button>
      </div>

      {activeTab === "general" && renderPredictionsTable(predictionsData.general, "general")}
      {activeTab === "sports" && renderPredictionsTable(predictionsData.sports, "sports")}
      {activeTab === "crypto" && renderPredictionsTable(predictionsData.crypto, "crypto")}
      {activeTab === "markets" && renderPredictionsTable(predictionsData.markets, "markets")}
      {activeTab === "leaderboard" && renderLeaderboardTable()}
    </div>
  )
} 