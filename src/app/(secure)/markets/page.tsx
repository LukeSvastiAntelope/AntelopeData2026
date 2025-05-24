"use client";

import { useState, useEffect } from "react";
import { Button } from "@heroui/button";
import { IPrediction, ILeaderboardData } from "@/app/utils/interface";
import { useFetch } from "@/app/utils/lib";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { MarketsTabs } from "@/components/markets-tabs";
import { MarketSectionCards } from "@/components/market-section-cards";
// import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { useAgent } from "@/app/context/AgentContext";

const ITEMS_PER_PAGE = 50;

export default function MarketsPage() {
  const router = useRouter();
  const fetch = useFetch();
  const { agent } = useAgent();

  // Data states
  const [predictionsData, setPredictionsData] = useState<{
    myPredictions: IPrediction[];
    general: IPrediction[];
    sports: IPrediction[];
    crypto: IPrediction[];
    markets: IPrediction[];
  }>({
    myPredictions: [],
    general: [],
    sports: [],
    crypto: [],
    markets: []
  });

  // Store full predictions for pagination
  const [fullPredictions, setFullPredictions] = useState<{
    myPredictions: IPrediction[];
    general: IPrediction[];
    sports: IPrediction[];
    crypto: IPrediction[];
    markets: IPrediction[];
  }>({
    myPredictions: [],
    general: [],
    sports: [],
    crypto: [],
    markets: []
  });

  // Leaderboard data
  const [leaderboardData, setLeaderboardData] = useState<ILeaderboardData[]>([]);
  const [fullLeaderboardData, setFullLeaderboardData] = useState<ILeaderboardData[]>([]);

  // Loading states
  const [isLoading, setIsLoading] = useState({
    myPredictions: false,
    general: false,
    sports: false,
    crypto: false,
    markets: false,
    leaderboard: false,
    loadingMore: {
      myPredictions: false,
      general: false,
      sports: false,
      crypto: false,
      markets: false,
      leaderboard: false
    }
  });

  // Pagination states
  const [pagination, setPagination] = useState({
    myPredictions: { page: 1, hasMore: true },
    general: { page: 1, hasMore: true },
    sports: { page: 1, hasMore: true },
    crypto: { page: 1, hasMore: true },
    markets: { page: 1, hasMore: true },
    leaderboard: { page: 1, hasMore: true }
  });

  useEffect(() => {
    fetchData();
    fetchLeaderboard();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(prev => ({
        ...prev,
        myPredictions: true,
        general: true,
        sports: true,
        crypto: true,
        markets: true
      }));

      console.log('🚀 Markets page: Starting to fetch predictions data...')
      console.log('🔍 Agent context:', { agentId: agent?.id, agentExists: !!agent })

      // Get predictions created by the user
      console.log('📡 Calling /api/getPredictionHistory...')
      const myPredictionsResponse = await fetch.get("/api/getPredictionHistory");
      console.log('📊 MyPredictions API response:', {
        status: myPredictionsResponse?.status,
        count: myPredictionsResponse?.predictions?.length,
        error: myPredictionsResponse?.error,
        message: myPredictionsResponse?.message,
        fullResponse: myPredictionsResponse
      })
      
      // Get predictions by source - make separate calls for each category
      console.log('📡 Calling APIs for each source...')
      
      const [generalResponse, sportsResponse, cryptoResponse, marketsResponse] = await Promise.all([
        fetch.get("/api/getPredictions?type=marketplace&source=google_news"),
        fetch.get("/api/getPredictions?type=marketplace&source=sportDB"),
        fetch.get("/api/getPredictions?type=marketplace&source=coinmarketcap"),
        fetch.get("/api/getPredictions?type=marketplace&source=google_finance")
      ]);

      console.log('📊 Source-specific API responses:', {
        general: { status: generalResponse?.status, count: generalResponse?.predictions?.length, total: generalResponse?.pagination?.total },
        sports: { status: sportsResponse?.status, count: sportsResponse?.predictions?.length, total: sportsResponse?.pagination?.total },
        crypto: { status: cryptoResponse?.status, count: cryptoResponse?.predictions?.length, total: cryptoResponse?.pagination?.total },
        markets: { status: marketsResponse?.status, count: marketsResponse?.predictions?.length, total: marketsResponse?.pagination?.total }
      })

      if (generalResponse.status && sportsResponse.status && cryptoResponse.status && marketsResponse.status && myPredictionsResponse.status) {
        const myPredictionsData = myPredictionsResponse.predictions || [];
        const general = generalResponse.predictions || [];
        const sports = sportsResponse.predictions || [];
        const crypto = cryptoResponse.predictions || [];
        const markets = marketsResponse.predictions || [];
        
        console.log('🔍 Processing predictions data:', {
          myPredictions: myPredictionsData.length,
          general: general.length,
          sports: sports.length,
          crypto: crypto.length,
          markets: markets.length
        })

        // Store full predictions for pagination
        setFullPredictions({
          myPredictions: myPredictionsData,
          general,
          sports,
          crypto,
          markets
        });

        setPredictionsData({
          myPredictions: myPredictionsData.slice(0, ITEMS_PER_PAGE),
          general: general.slice(0, ITEMS_PER_PAGE),
          sports: sports.slice(0, ITEMS_PER_PAGE),
          crypto: crypto.slice(0, ITEMS_PER_PAGE),
          markets: markets.slice(0, ITEMS_PER_PAGE)
        });

        console.log('📋 Final predictions data set:', {
          myPredictions: myPredictionsData.slice(0, ITEMS_PER_PAGE).length,
          general: general.slice(0, ITEMS_PER_PAGE).length,
          sports: sports.slice(0, ITEMS_PER_PAGE).length,
          crypto: crypto.slice(0, ITEMS_PER_PAGE).length,
          markets: markets.slice(0, ITEMS_PER_PAGE).length
        })

        // Update pagination based on API responses
        setPagination({
          myPredictions: { page: 1, hasMore: myPredictionsData.length > ITEMS_PER_PAGE },
          general: { page: 1, hasMore: generalResponse.pagination?.hasMore || false },
          sports: { page: 1, hasMore: sportsResponse.pagination?.hasMore || false },
          crypto: { page: 1, hasMore: cryptoResponse.pagination?.hasMore || false },
          markets: { page: 1, hasMore: marketsResponse.pagination?.hasMore || false },
          leaderboard: { page: 1, hasMore: false }
        });

        console.log('📄 Pagination state set:', {
          general: { total: generalResponse.pagination?.total, hasMore: generalResponse.pagination?.hasMore },
          sports: { total: sportsResponse.pagination?.total, hasMore: sportsResponse.pagination?.hasMore },
          crypto: { total: cryptoResponse.pagination?.total, hasMore: cryptoResponse.pagination?.hasMore },
          markets: { total: marketsResponse.pagination?.total, hasMore: marketsResponse.pagination?.hasMore }
        })
      } else {
        console.warn('⚠️ API calls failed:', {
          generalApiStatus: generalResponse?.status,
          sportsApiStatus: sportsResponse?.status,
          cryptoApiStatus: cryptoResponse?.status,
          marketsApiStatus: marketsResponse?.status,
          myPredictionsApiStatus: myPredictionsResponse?.status
        })
        
        // Set empty data but don't show toast if it's just empty data
        setPredictionsData({
          myPredictions: [],
          general: [],
          sports: [],
          crypto: [],
          markets: []
        });
        
        setFullPredictions({
          myPredictions: [],
          general: [],
          sports: [],
          crypto: [],
          markets: []
        });
        
        // Only show error toast for actual errors, not empty data
        if (generalResponse?.error || sportsResponse?.error || cryptoResponse?.error || marketsResponse?.error || myPredictionsResponse?.error) {
          toast.error('Failed to fetch predictions');
        } else {
          console.log('ℹ️ No error message, likely just empty data or authentication issue')
        }
      }
    } catch (error) {
      console.error("❌ Error in fetchData:", error);
      toast.error("Failed to fetch predictions: " + String(error));
      
      // Set empty data on error
      setPredictionsData({
        myPredictions: [],
        general: [],
        sports: [],
        crypto: [],
        markets: []
      });
      
      setFullPredictions({
        myPredictions: [],
        general: [],
        sports: [],
        crypto: [],
        markets: []
      });
    } finally {
      setIsLoading(prev => ({
        ...prev,
        myPredictions: false,
        general: false,
        sports: false,
        crypto: false,
        markets: false
      }));
    }
  };

  const fetchLeaderboard = async () => {
    try {
      setIsLoading(prev => ({
        ...prev,
        leaderboard: true
      }));

      const response = await fetch.get("/api/getLeaderboard");

      if (response.status) {
        const leaderboard = response.leaderboard || [];
        
        // Store full leaderboard data for pagination
        setFullLeaderboardData(leaderboard);
        
        // Set initial leaderboard data
        setLeaderboardData(leaderboard.slice(0, ITEMS_PER_PAGE));
        
        // Update pagination
        setPagination(prev => ({
          ...prev,
          leaderboard: { 
            page: 1, 
            hasMore: leaderboard.length > ITEMS_PER_PAGE 
          }
        }));
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      toast.error("Failed to fetch leaderboard: " + String(error));
    } finally {
      setIsLoading(prev => ({
        ...prev,
        leaderboard: false
      }));
    }
  };

  const handleLoadMore = async (category: keyof typeof predictionsData) => {
    setIsLoading(prev => ({
      ...prev,
      loadingMore: {
        ...prev.loadingMore,
        [category]: true
      }
    }));

    const nextPage = pagination[category].page + 1;
    
    try {
      let response;
      
      // Make API call based on category
      switch (category) {
        case 'myPredictions':
          // For user's own predictions, we'll keep using the existing approach
          const start = (nextPage - 1) * ITEMS_PER_PAGE;
          const end = start + ITEMS_PER_PAGE;
          const newItems = fullPredictions[category].slice(0, end);
          
          setPredictionsData(prev => ({
            ...prev,
            [category]: newItems
          }));

          setPagination(prev => ({
            ...prev,
            [category]: { 
              page: nextPage,
              hasMore: fullPredictions[category].length > end
            }
          }));
          break;
          
        case 'general':
          response = await fetch.get(`/api/getPredictions?type=marketplace&source=google_news&page=${nextPage}&limit=${ITEMS_PER_PAGE}`);
          break;
        case 'sports':
          response = await fetch.get(`/api/getPredictions?type=marketplace&source=sportDB&page=${nextPage}&limit=${ITEMS_PER_PAGE}`);
          break;
        case 'crypto':
          response = await fetch.get(`/api/getPredictions?type=marketplace&source=coinmarketcap&page=${nextPage}&limit=${ITEMS_PER_PAGE}`);
          break;
        case 'markets':
          response = await fetch.get(`/api/getPredictions?type=marketplace&source=google_finance&page=${nextPage}&limit=${ITEMS_PER_PAGE}`);
          break;
      }
      
      // Handle API response for marketplace categories
      if (response && response.status && category !== 'myPredictions') {
        const newPredictions = response.predictions || [];
        
        setPredictionsData(prev => ({
          ...prev,
          [category]: [...prev[category], ...newPredictions]
        }));

        setPagination(prev => ({
          ...prev,
          [category]: { 
            page: nextPage,
            hasMore: response.pagination?.hasMore || false
          }
        }));
        
        console.log(`📄 Loaded more for ${category}:`, {
          newCount: newPredictions.length,
          totalNow: predictionsData[category].length + newPredictions.length,
          hasMore: response.pagination?.hasMore
        });
      }
    } catch (error) {
      console.error(`Error loading more ${category}:`, error);
      toast.error(`Failed to load more ${category}`);
    } finally {
      setIsLoading(prev => ({
        ...prev,
        loadingMore: {
          ...prev.loadingMore,
          [category]: false
        }
      }));
    }
  };

  const handleLoadMoreLeaderboard = () => {
    setIsLoading(prev => ({
      ...prev,
      loadingMore: {
        ...prev.loadingMore,
        leaderboard: true
      }
    }));

    const nextPage = pagination.leaderboard.page + 1;
    const start = (nextPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    
    // Get more items from the full leaderboard data
    const newItems = fullLeaderboardData.slice(0, end);
    
    setLeaderboardData(newItems);

    setPagination(prev => ({
      ...prev,
      leaderboard: { 
        page: nextPage,
        hasMore: fullLeaderboardData.length > end
      }
    }));

    setIsLoading(prev => ({
      ...prev,
      loadingMore: {
        ...prev.loadingMore,
        leaderboard: false
      }
    }));
  };

  return (
    <div className="flex-1 p-2 w-full">
      <div className="mx-auto rounded-lg bg-black text-card-foreground shadow-lg">
        {/* Header */}
        <div className="px-6 py-4">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-zinc-400 hover:text-zinc-100" />
            <div className="h-4 border-l border-zinc-800 mx-4" />
            <h1 className="text-base font-medium">Markets</h1>
          </div>
        </div>
        
        <div className="border-b border-zinc-800" />

        <div className="p-6">
          {/* Top metrics cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MarketSectionCards />
          </div>
          
          {/* Chart area - temporarily disabled */}
          {/* <div className="mt-6">
            <ChartAreaInteractive />
          </div> */}

          {/* Markets tabs section */}
          <div className="mt-6">
            <MarketsTabs
              predictionsData={predictionsData}
              leaderboardData={leaderboardData}
              isLoading={isLoading}
              pagination={pagination}
              onLoadMore={{
                myPredictions: () => handleLoadMore('myPredictions'),
                general: () => handleLoadMore('general'),
                sports: () => handleLoadMore('sports'),
                crypto: () => handleLoadMore('crypto'),
                markets: () => handleLoadMore('markets'),
                leaderboard: handleLoadMoreLeaderboard
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
} 