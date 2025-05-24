'use client';

import { useState, useEffect } from "react";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { DashboardTabs } from "@/components";
import { 
  BetHistoryItem, 
  PredictionItem, 
  ActivityItem,
  PaginationState 
} from "@/components/dashboard-tabs";
import { SectionCards } from "@/components/section-cards";
import { useFetch } from "@/app/utils/lib";
import { useAgent } from "@/app/context/AgentContext";
import toast from "react-hot-toast";
import { ModeToggle } from "@/components/mode-toggle";
import { SidebarTrigger } from "@/components/ui/sidebar";

// Define interfaces for our data
interface Prediction {
  id: string;
  description: string;
  outcome: string;
  status: string;
  predicted_outcome: string;
  str_thumb?: string;
  yes_amount?: number;
  no_amount?: number;
  source?: string;
  creator_choice?: string;
  bets_count?: number;
  bet_amount?: number;
  resolution_date?: string;
  created_at?: string;
  league_id?: number;
  agent_bets?: any[];
}

interface Bet {
  id: number | string;
  prediction_id: number | string;
  user_id?: number;
  choice: string;
  amount: number;
  created_at: string;
  reason: string;
  state: string;
  winnings: number;
  prediction?: {
    id: number | string;
    description: string;
    outcome: string;
    status: string;
    predicted_outcome: string;
    probability: string;
    str_thumb?: string;
  };
}

export default function DashboardPage() {
  const [activityData, setActivityData] = useState<ActivityItem[]>([]);
  const [betsHistoryData, setBetsHistoryData] = useState<BetHistoryItem[]>([]);
  const [predictionsData, setPredictionsData] = useState<PredictionItem[]>([]);
  const [isLoading, setIsLoading] = useState({
    activity: true,
    bets: true,
    predictions: true,
    loadingMore: {
      activity: false,
      bets: false,
      predictions: false
    }
  });
  const [pagination, setPagination] = useState<PaginationState>({
    activity: { page: 1, hasMore: true },
    bets: { page: 1, hasMore: true },
    predictions: { page: 1, hasMore: true }
  });

  const ITEMS_PER_PAGE = 50; // Show 50 items per page
  const { agent } = useAgent();
  const fetch = useFetch();

  // Fetch activity data
  const fetchActivityData = async (page = 1, append = false) => {
    try {
      if (page === 1) {
        setIsLoading(prev => ({ ...prev, activity: true }));
      } else {
        setIsLoading(prev => ({ 
          ...prev, 
          loadingMore: { ...prev.loadingMore, activity: true } 
        }));
      }

      const response = await fetch.get(`/api/getRecentActivity?page=${page}&limit=${ITEMS_PER_PAGE}`);
      
      if (response.status) {
        const newActivity = response.activity || [];
        
        if (append) {
          setActivityData(prev => [...prev, ...newActivity]);
        } else {
          setActivityData(newActivity);
        }
        
        // Check if there might be more data
        setPagination(prev => ({
          ...prev,
          activity: {
            page,
            hasMore: newActivity.length === ITEMS_PER_PAGE
          }
        }));
      } else {
        toast.error(response.message || "Failed to load activity data");
      }
    } catch (error) {
      console.error("Error fetching activity data:", error);
      toast.error("Failed to load activity data");
    } finally {
      if (page === 1) {
        setIsLoading(prev => ({ ...prev, activity: false }));
      } else {
        setIsLoading(prev => ({ 
          ...prev, 
          loadingMore: { ...prev.loadingMore, activity: false } 
        }));
      }
    }
  };

  // Load more activity data
  const loadMoreActivity = () => {
    const nextPage = pagination.activity.page + 1;
    fetchActivityData(nextPage, true);
  };

  // Fetch bets history
  const fetchBetsHistory = async (page = 1, append = false, showAll = false) => {
    try {
      if (page === 1) {
        setIsLoading(prev => ({ ...prev, bets: true }));
      } else {
        setIsLoading(prev => ({ 
          ...prev, 
          loadingMore: { ...prev.loadingMore, bets: true } 
        }));
      }

      const response = await fetch.get(`/api/getAgentBetHistory?page=${page}&showAll=${showAll}`);
      
      if (response.bets) {
        // Get the bets from the response
        const responseBets = response.bets || [];
        
        // Transform bets to match the expected BetHistoryItem structure
        const formattedBets: BetHistoryItem[] = responseBets.map((bet: any) => ({
          id: bet.id,
          user_id: bet.user_id || 0,
          prediction_id: Number(bet.prediction_id),
          choice: bet.choice,
          amount: bet.amount,
          created_at: bet.created_at,
          reason: bet.reason,
          state: bet.state,
          winnings: bet.winnings,
          fullReasoning: bet.fullReasoning,
          prediction: {
            id: bet.prediction ? bet.prediction.id : 0,
            description: bet.prediction?.description || "Unknown Prediction",
            outcome: bet.prediction?.outcome || "",
            status: bet.prediction?.status || "",
            predicted_outcome: bet.prediction?.predicted_outcome || "",
            probability: bet.prediction?.probability || "50%",
            str_thumb: bet.prediction?.str_thumb
          }
        }));
        
        if (append) {
          setBetsHistoryData(prev => [...prev, ...formattedBets]);
        } else {
          setBetsHistoryData(formattedBets);
        }

        // Check if there might be more data
        setPagination(prev => ({
          ...prev,
          bets: {
            page,
            hasMore: response.hasMore
          }
        }));
      } else {
        toast.error("Failed to load bets history");
      }
    } catch (error) {
      console.error("Error fetching bets history:", error);
      toast.error("Failed to load bets history");
    } finally {
      if (page === 1) {
        setIsLoading(prev => ({ ...prev, bets: false }));
      } else {
        setIsLoading(prev => ({ 
          ...prev, 
          loadingMore: { ...prev.loadingMore, bets: false } 
        }));
      }
    }
  };

  // Load more bets history
  const loadMoreBets = () => {
    const nextPage = pagination.bets.page + 1;
    fetchBetsHistory(nextPage, true);
  };

  // Helper function to calculate probability
  const calculateProbability = (prediction?: Prediction): string => {
    if (!prediction || (!prediction.yes_amount && !prediction.no_amount)) return '50%';
    
    const yesAmount = prediction.yes_amount || 0;
    const noAmount = prediction.no_amount || 0;
    const total = yesAmount + noAmount;
    
    if (total === 0) return '50%';
    return `${Math.round((yesAmount / total) * 100)}%`;
  };

  // Fetch predictions with pagination
  const fetchPredictions = async (page = 1, append = false) => {
    try {
      if (page === 1) {
        setIsLoading(prev => ({ ...prev, predictions: true }));
      } else {
        setIsLoading(prev => ({ 
          ...prev, 
          loadingMore: { ...prev.loadingMore, predictions: true } 
        }));
      }

      const response = await fetch.get(`/api/getPredictions?page=${page}&limit=${ITEMS_PER_PAGE}`);
      
      if (response.status) {
        // Transform predictions to match the expected PredictionItem structure
        const transformedPredictions: PredictionItem[] = (response.predictions || []).map((pred: Prediction) => ({
          id: String(pred.id),
          description: pred.description || "",
          source: pred.source || "",
          predicted_outcome: pred.predicted_outcome || "",
          creator_choice: pred.creator_choice || "",
          bets_count: pred.bets_count || 0,
          status: pred.status || "",
          bet_amount: pred.bet_amount || 0,
          resolution_date: pred.resolution_date || "",
          str_thumb: pred.str_thumb || "",
          outcome: pred.outcome || "",
          created_at: pred.created_at || "",
          yes_amount: pred.yes_amount,
          no_amount: pred.no_amount,
          agent_bets: pred.agent_bets || [],
          league_id: pred.league_id || 0
        }));
        
        if (append) {
          setPredictionsData(prev => [...prev, ...transformedPredictions]);
        } else {
          setPredictionsData(transformedPredictions);
        }
        
        // Use server-side pagination info
        setPagination(prev => ({
          ...prev,
          predictions: {
            page,
            hasMore: response.pagination?.hasMore || false
          }
        }));
      } else {
        toast.error(response.message || "Failed to load predictions");
      }
    } catch (error) {
      console.error("Error fetching predictions:", error);
      toast.error("Failed to load predictions");
    } finally {
      if (page === 1) {
        setIsLoading(prev => ({ ...prev, predictions: false }));
      } else {
        setIsLoading(prev => ({ 
          ...prev, 
          loadingMore: { ...prev.loadingMore, predictions: false } 
        }));
      }
    }
  };

  // Load more predictions
  const loadMorePredictions = () => {
    const nextPage = pagination.predictions.page + 1;
    fetchPredictions(nextPage, true);
  };

  useEffect(() => {
    if (agent) {
      fetchActivityData();
      fetchBetsHistory();
      fetchPredictions();
    }
  }, [agent]);

  return (
    <div className="flex-1 p-2 w-full">
      <div className="mx-auto rounded-lg bg-black text-card-foreground shadow-lg">
        {/* Header */}
        <div className="px-6 py-4">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-zinc-400 hover:text-zinc-100" />
            <div className="h-4 border-l border-zinc-800 mx-4" />
            <h1 className="text-base font-medium">Dashboard</h1>
          </div>
        </div>
        
        <div className="border-b border-zinc-800" />

        <div className="p-6">
          {/* Top metrics cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SectionCards />
          </div>
          
          {/* Chart area */}
          <div className="mt-6">
            <ChartAreaInteractive />
          </div>

          {/* Tabs section */}
          <div className="mt-6">
            <DashboardTabs
              activityData={activityData}
              betsHistoryData={betsHistoryData}
              predictionsData={predictionsData}
              isLoading={isLoading}
              pagination={pagination}
              setPagination={setPagination}
              onLoadMoreActivity={loadMoreActivity}
              onLoadMoreBets={loadMoreBets}
              onLoadMorePredictions={loadMorePredictions}
              fetchBetsHistory={fetchBetsHistory}
            />
          </div>
        </div>
      </div>
    </div>
  );
} 