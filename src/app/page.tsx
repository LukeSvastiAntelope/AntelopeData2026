'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Spinner } from "@heroui/spinner";
import { Button } from "@heroui/button";
import { Image } from "@heroui/image";
import { Tooltip } from "@heroui/tooltip";
import { PublicLayout } from "./components/PublicLayout";
import { PublicSectionCards } from "@/components/public-section-cards"
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { formatDistanceToNow } from "date-fns"

interface IActivity {
  id: number;
  description?: string;
  created_at: string;
  source?: string;
  user_id?: number;
  agent_id?: number;
  prediction_id?: number;
  bet_amount?: number;
  creator_choice?: string;
  str_thumb?: string;
  username?: string;
  amount: number;
  choice?: string;
  type?: string;
  bet_id?: number;
  user_avatar?: string;
  agent_name?: string;
  agent_image?: string;
}

const ITEMS_PER_PAGE_ACTIVITY = 50;

const filterActivity = (activity: IActivity[], searchTerm: string): IActivity[] => {
  const term = searchTerm.toLowerCase();
  return activity.filter(item =>
    item.description?.toLowerCase().includes(term) ||
    item.source?.toLowerCase().includes(term) ||
    item.type?.toLowerCase().includes(term)
  );
};

function PublicDashboard() {
  const [activeTab, setActiveTab] = useState<"bets" | "predictions" | "activity">("activity");
  const [searchTerm, ] = useState('');
  
  // Activity state
  const [isLoadingActivity, setIsLoadingActivity] = useState<boolean>(true);
  const [activity, setActivity] = useState<IActivity[]>([]);
  const [pageActivity, setPageActivity] = useState<number>(1);
  const [hasMoreActivity, setHasMoreActivity] = useState<boolean>(true);
  
  const router = useRouter();

  const fetchActivity = async (pageNumber: number) => {
    setIsLoadingActivity(true);
    try {
      const response = await fetch(`/api/getRecentActivity?page=${pageNumber}&limit=${ITEMS_PER_PAGE_ACTIVITY}`);
      if (!response.ok) {
        throw new Error('Failed to fetch activity');
      }
      const data = await response.json();
      if (data.status) {
        if (pageNumber === 1) {
          setActivity(data.activity);
        } else {
          setActivity((prev) => [...prev, ...data.activity]);
        }
        setHasMoreActivity(data.activity.length === ITEMS_PER_PAGE_ACTIVITY);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.error("Failed to fetch activity:", error);
      toast.error("Failed to fetch activity");
      setHasMoreActivity(false);
    } finally {
      setIsLoadingActivity(false);
    }
  }

  const loadMoreActivity = () => {
    if (!isLoadingActivity && hasMoreActivity) {
      const nextPage = pageActivity + 1;
      setPageActivity(nextPage);
      fetchActivity(nextPage);
    }
  }

  // Initial data fetch
  useEffect(() => {
    fetchActivity(1);
  }, []);

  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true })
    } catch (e) {
      return dateString
    }
  }

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
            <PublicSectionCards />
          </div>

          {/* Tabs section */}
          <div className="mt-6">
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
                onClick={() => setActiveTab("bets")} 
                className={`rounded-none border-b-2 px-4 ${activeTab === "bets" ? "border-b-primary text-foreground" : "border-b-transparent text-muted-foreground hover:text-foreground"}`}
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

            {/* Content based on active tab */}
            {(activeTab === "bets" || activeTab === "predictions") && (
              <div className="flex flex-col gap-2 mb-8 border border-white/10 rounded-xl p-6 text-center empty-state place-content-center">
                <div className="map-center"></div>
                <h1 className="font-bold mb-1 font-kodemono">Login to access {activeTab}</h1>
                <p className="text-gray-400 pb-2">
                  Create an account or login to view your {activeTab === "bets" ? "bet history" : "predictions"}.
                </p>
                <div className="flex justify-center gap-4 mt-2">
                  <Button 
                    onPress={() => router.push('/login')} 
                    className="bg-blue-600 hover:bg-blue-700"
                    color="primary"
                  >
                    Login
                  </Button>
                  <Button 
                    onPress={() => router.push('/register')} 
                    className=""
                    variant="bordered"
                  >
                    Register
                  </Button>
                </div>
              </div>
            )}

            {activeTab === "activity" && (
              <div className="space-y-4 overflow-x-auto">
                {isLoadingActivity && activity.length === 0 ? (
                  Array(5).fill(0).map((_, i) => (
                    <Card key={i} className="bg-zinc-950/50 border border-zinc-800/50 shadow-[0_0_1px_1px_rgba(0,0,0,0.2)]">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <div className="h-10 w-10 rounded-full bg-zinc-800 animate-pulse" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 bg-zinc-800 rounded animate-pulse w-3/4" />
                            <div className="h-4 bg-zinc-800 rounded animate-pulse w-full" />
                            <div className="h-4 bg-zinc-800 rounded animate-pulse w-1/3" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : activity.length === 0 && !isLoadingActivity ? (
                  <Card className="bg-zinc-950/50 border border-zinc-800/50 shadow-[0_0_1px_1px_rgba(0,0,0,0.2)]">
                    <CardContent className="p-6 flex flex-col items-center justify-center">
                      <div className="text-zinc-400 mb-2">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                      </div>
                      <p className="text-zinc-400 text-center">No activity found</p>
                    </CardContent>
                  </Card>
                ) : (
                  filterActivity(activity, searchTerm).map((item, index) => (
                    <Card key={`${item.type}_${item.prediction_id}_${index}`} className="bg-zinc-950/50 border border-zinc-800/50 shadow-[0_0_1px_1px_rgba(0,0,0,0.2)]">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
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
                              <div 
                                className="mt-1 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                                onClick={() => {
                                  if (item.type === "bet" && item.bet_id) {
                                    router.push(`/public/bet/${item.bet_id}`);
                                  } else if (item.prediction_id) {
                                    router.push(`/public/prediction/${item.prediction_id}`);
                                  }
                                }}
                              >
                                {item.description}
                              </div>
                              
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
                
                {hasMoreActivity && !isLoadingActivity && activity.length > 0 && (
                  <div className="flex justify-center mt-6">
                    <Button
                      variant="bordered"
                      onClick={loadMoreActivity}
                      disabled={isLoadingActivity}
                      className="border-zinc-700 hover:bg-zinc-800 min-w-[200px]"
                    >
                      {isLoadingActivity ? (
                        <span className="flex items-center gap-2">
                          <div className="h-4 w-4 rounded-full border-2 border-current border-r-transparent animate-spin" />
                          Loading...
                        </span>
                      ) : (
                        "Load More"
                      )}
                    </Button>
                  </div>
                )}
                
                {isLoadingActivity && activity.length > 0 && (
                  <div className="flex justify-center items-center py-4">
                    <div className="h-4 w-4 rounded-full border-2 border-current border-r-transparent animate-spin" />
                  </div>
                )}
                
                {!hasMoreActivity && activity.length > 0 && (
                  <div className="text-center text-zinc-500 py-4">
                    No more activity to load
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <PublicLayout>
      <PublicDashboard />
    </PublicLayout>
  );
} 