"use client"

import { useState } from "react"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Check, X, ArrowRight, CircleEllipsis, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { formatDistanceToNow } from "date-fns"
import { Skeleton } from "@/components/ui/skeleton"
import Link from "next/link"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"

export interface ActivityItem {
  type: string
  bet_id?: string
  user_id: number
  prediction_id: number
  created_at: string
  amount: number
  str_thumb?: string
  choice: string
  description: string
  source: string
  username: string
  agent_name: string
  agent_image: string
}

export interface BetHistoryItem {
  id: number | string
  user_id: number
  prediction_id: number
  choice: string
  amount: number
  created_at: string
  reason: string
  state: string
  winnings: number
  prediction: {
    id: number | string // Allow both number and string
    description: string
    outcome: string
    status: string
    predicted_outcome: string
    probability: string
    str_thumb?: string
  }
  fullReasoning?: { step: string; reasoning: string }[]
}

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

export interface PaginationState {
  activity: {
    page: number;
    hasMore: boolean;
  };
  bets: {
    page: number;
    hasMore: boolean;
  };
  predictions: {
    page: number;
    hasMore: boolean;
  };
}

interface DashboardTabsProps {
  activityData: ActivityItem[]
  betsHistoryData: BetHistoryItem[]
  predictionsData: PredictionItem[]
  isLoading: {
    activity: boolean
    bets: boolean
    predictions: boolean
    loadingMore?: {
      activity: boolean
      bets: boolean
      predictions: boolean
    }
  }
  pagination: PaginationState
  setPagination: React.Dispatch<React.SetStateAction<PaginationState>>
  onLoadMoreActivity: () => void
  onLoadMoreBets: () => void
  onLoadMorePredictions: () => void
  fetchBetsHistory: (page?: number, append?: boolean, showAll?: boolean) => Promise<void>
}

export function DashboardTabs({ 
  activityData = [], 
  betsHistoryData = [], 
  predictionsData = [],
  isLoading,
  pagination,
  setPagination,
  onLoadMoreActivity,
  onLoadMoreBets,
  onLoadMorePredictions,
  fetchBetsHistory
}: DashboardTabsProps) {
  const [activeTab, setActiveTab] = useState("activity")
  
  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true })
    } catch (e) {
      return dateString
    }
  }

  // Define the source to category mapping
  const getCategory = (source: string) => {
    switch(source) {
      case 'google_news': return 'General'
      case 'google_finance': return 'Markets'
      case 'coinmarketcap': return 'Crypto'
      case 'sportDB': return 'Sports'
      default: return 'Other'
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

  return (
    <div>
      <div className="flex items-center space-x-1 border-b mb-4">
        <Button 
          variant="ghost" 
          onClick={() => setActiveTab("activity")} 
          className={`rounded-none border-b-2 px-4 ${activeTab === "activity" ? "border-b-primary text-foreground" : "border-b-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Activity
        </Button>
        <Button 
          variant="ghost" 
          onClick={() => setActiveTab("bets-history")} 
          className={`rounded-none border-b-2 px-4 ${activeTab === "bets-history" ? "border-b-primary text-foreground" : "border-b-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Bets History
        </Button>
        <Button 
          variant="ghost" 
          onClick={() => setActiveTab("predictions")} 
          className={`rounded-none border-b-2 px-4 ${activeTab === "predictions" ? "border-b-primary text-foreground" : "border-b-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Predictions
        </Button>
      </div>
        
      {/* Activity Tab */}
      {activeTab === "activity" && (
        <div className="space-y-4 overflow-x-auto">
          {isLoading.activity ? (
            Array(5).fill(0).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-start space-x-4">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : activityData.length === 0 ? (
            <Card className="border border-zinc-800">
              <CardContent className="p-6 flex flex-col items-center justify-center">
                <CircleEllipsis className="h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-center">No activity data available</p>
              </CardContent>
            </Card>
          ) : (
            activityData.map((item, index) => (
              <Card key={`${item.type}_${item.prediction_id}_${index}`} className="bg-zinc-950/50 border border-zinc-800/50 shadow-[0_0_1px_1px_rgba(0,0,0,0.2)]">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Avatar section */}
                    <Avatar>
                      {item.agent_image ? (
                        <AvatarImage src={item.agent_image} alt={item.agent_name} />
                      ) : (
                        <AvatarFallback>
                          {item.agent_name?.charAt(0) || 'A'}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-col">
                        <div className="flex items-center">
                          <span className="font-medium text-zinc-100">
                            {item.type === 'bet' ? item.username : item.agent_name}
                          </span>
                          <span className="ml-2 text-zinc-400">
                            {item.type === 'bet' ? 'wagered on:' : 'created prediction:'}
                          </span>
                        </div>
                        <Link 
                          href={`/predictions/${item.prediction_id}`}
                          className="mt-1 text-zinc-300 hover:text-white transition-colors"
                        >
                          {item.description}
                        </Link>
                        
                        {item.type === 'bet' && (
                          <div className="flex items-center mt-2 space-x-2">
                            <Badge variant="secondary" className="bg-zinc-900 text-zinc-100">
                              {item.amount} ANML
                            </Badge>
                            <Badge variant="outline" className={item.choice === 'YES' ? 'border-emerald-500 text-emerald-500' : 'border-red-500 text-red-500'}>
                              {item.choice}
                            </Badge>
                          </div>
                        )}
                        
                        <div className="text-xs text-zinc-500 mt-2">
                          {formatDate(item.created_at)}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
          
          {pagination.activity.hasMore && (
            <div className="flex justify-center mt-6">
              <Button 
                onClick={onLoadMoreActivity}
                disabled={isLoading.loadingMore?.activity}
                variant="outline"
              >
                {isLoading.loadingMore?.activity ? (
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
      )}
      
      {/* Bets History Tab */}
      {activeTab === "bets-history" && (
        <div className="overflow-x-auto">
          <div className="min-w-full rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30%]">Market</TableHead>
                  <TableHead className="w-[10%]">Position</TableHead>
                  <TableHead className="w-[10%]">Amount</TableHead>
                  <TableHead className="w-[10%]">Odds</TableHead>
                  <TableHead className="w-[10%]">Status</TableHead>
                  <TableHead className="w-[10%]">Result</TableHead>
                  <TableHead className="w-[10%]">Payout</TableHead>
                  <TableHead className="w-[10%]">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading.bets ? (
                  Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={8} className="h-14">
                        <div className="flex items-center justify-center">
                          <Skeleton className="h-4 w-full" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : betsHistoryData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <CircleEllipsis className="h-10 w-10 text-muted-foreground mb-2" />
                        <p className="text-muted-foreground">No bet history available</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  betsHistoryData.map((bet) => (
                    <TableRow key={bet.id}>
                      <TableCell className="font-medium max-w-0">
                        <Link 
                          href={`/bets/${bet.id}`}
                          className="truncate block hover:text-white transition-colors"
                        >
                          {bet.prediction?.description || "Loading prediction..."}
                        </Link>
                        {bet.fullReasoning && (
                          <div className="mt-2 text-sm text-muted-foreground">
                            <Collapsible>
                              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-white transition-colors">
                                <ChevronRight className="h-3 w-3" />
                                View Reasoning Steps
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-2 space-y-2">
                                {bet.fullReasoning.map((step: { step: string; reasoning: string }, index: number) => (
                                  <div key={index} className="pl-2 border-l border-muted">
                                    <div className="text-xs font-medium">{step.step}</div>
                                    <div className="text-xs text-muted-foreground">{step.reasoning}</div>
                                  </div>
                                ))}
                              </CollapsibleContent>
                            </Collapsible>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="outline" className={bet.choice === 'YES' ? 'border-emerald-500 text-emerald-500' : 'border-red-500 text-red-500'}>
                          {bet.choice}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{bet.amount} ANML</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {bet.prediction?.probability || '50%'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={bet.state === 'active' || (bet.prediction && bet.prediction.status === 'open') ? 'outline' : 'secondary'}>
                          {(bet.state === 'active' || (bet.prediction && bet.prediction.status === 'open')) ? 'Active' : 'Completed'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {bet.prediction && bet.prediction.status === 'resolved' && (
                          <span className={`inline-flex items-center ${bet.choice === bet.prediction.outcome ? 'text-emerald-500' : 'text-red-500'}`}>
                            {bet.choice === bet.prediction.outcome ? (
                              <>
                                <Check className="mr-1 h-4 w-4" />
                                Won
                              </>
                            ) : (
                              <>
                                <X className="mr-1 h-4 w-4" />
                                Lost
                              </>
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {bet.prediction && bet.prediction.status === 'resolved' && bet.choice === bet.prediction.outcome && (
                          <span className="text-emerald-500">
                            +{bet.winnings || bet.amount * 2} ANML
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(bet.created_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          
          {pagination.bets.hasMore && (
            <div className="flex justify-center mt-6">
              <Button 
                onClick={onLoadMoreBets}
                disabled={isLoading.loadingMore?.bets}
                variant="outline"
              >
                {isLoading.loadingMore?.bets ? (
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
      )}
      
      {/* Predictions Tab */}
      {activeTab === "predictions" && (
        <div className="overflow-x-auto">
          <div className="min-w-full rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30%]">Market</TableHead>
                  <TableHead className="w-[10%]">Category</TableHead>
                  <TableHead className="w-[10%]">Odds</TableHead>
                  <TableHead className="w-[10%]">Status</TableHead>
                  <TableHead className="w-[15%]">Resolution</TableHead>
                  <TableHead className="w-[12.5%]">Expires</TableHead>
                  <TableHead className="w-[12.5%]">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading.predictions ? (
                  Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7} className="h-14">
                        <div className="flex items-center justify-center">
                          <Skeleton className="h-4 w-full" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : predictionsData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <CircleEllipsis className="h-10 w-10 text-muted-foreground mb-2" />
                        <p className="text-muted-foreground">No predictions available</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  predictionsData.map((prediction) => (
                    <TableRow key={prediction.id}>
                      <TableCell className="font-medium max-w-0">
                        <Link 
                          href={`/predictions/${prediction.id}`}
                          className="truncate block hover:text-white transition-colors"
                        >
                          {prediction.description}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="outline" className="border-violet-500 text-violet-500">
                          {getCategory(prediction.source)}
                        </Badge>
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
                        {formatDate(prediction.resolution_date)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(prediction.created_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            
            {pagination.predictions.hasMore && (
              <div className="flex justify-center p-4 border-t">
                <Button 
                  onClick={onLoadMorePredictions}
                  disabled={isLoading.loadingMore?.predictions}
                  variant="outline"
                >
                  {isLoading.loadingMore?.predictions ? (
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
      )}
    </div>
  )
} 