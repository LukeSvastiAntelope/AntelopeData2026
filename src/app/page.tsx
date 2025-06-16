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
import { CircleEllipsis } from "lucide-react"

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
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        {/* Header */}
        <div className="px-6 py-4">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium text-card-foreground">Dashboard</h1>
          </div>
        </div>
        
        <div className="border-b border-border" />

        <div className="p-6">
          {/* Top metrics cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <PublicSectionCards />
          </div>

          {/* Tabs section */}
          <div className="mt-6">
            <div className="flex items-center space-x-1 border-b border-border mb-4">
              <Button 
                variant="ghost" 
                onPress={() => setActiveTab("activity")} 
                className={`rounded-none border-b-2 px-4 ${activeTab === "activity" ? "border-b-primary text-foreground" : "border-b-transparent text-muted-foreground hover:text-foreground"}`}
              >
                Activity
              </Button>
              <Button 
                variant="ghost" 
                onPress={() => setActiveTab("bets")} 
                className={`rounded-none border-b-2 px-4 ${activeTab === "bets" ? "border-b-primary text-foreground" : "border-b-transparent text-muted-foreground hover:text-foreground"}`}
              >
                Bets History
              </Button>
              <Button 
                variant="ghost" 
                onPress={() => setActiveTab("predictions")} 
                className={`rounded-none border-b-2 px-4 ${activeTab === "predictions" ? "border-b-primary text-foreground" : "border-b-transparent text-muted-foreground hover:text-foreground"}`}
              >
                Predictions
              </Button>
            </div>

            {/* Content based on active tab */}
            {(activeTab === "bets" || activeTab === "predictions") && (
              <div className="flex flex-col gap-2 mb-8 border border-border rounded-xl p-6 text-center empty-state place-content-center bg-card">
                <div className="map-center"></div>
                <h1 className="font-bold mb-1 font-kodemono text-card-foreground">Login to access {activeTab}</h1>
                <p className="text-muted-foreground pb-2">
                  Create an account or login to view your {activeTab === "bets" ? "bet history" : "predictions"}.
                </p>
                <div className="flex justify-center gap-4 mt-2">
                  <Button 
                    onPress={() => router.push('/login')} 
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                    color="primary"
                  >
                    Login
                  </Button>
                  <Button 
                    onPress={() => router.push('/register')} 
                    className="border-border text-foreground hover:bg-accent hover:text-accent-foreground"
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
                  Array(3).fill(0).map((_, i) => (
                    <Card key={i} className="bg-card border border-border shadow-sm">
                      <CardContent className="p-6">
                        <div className="space-y-3">
                          <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
                          <div className="space-y-2">
                            <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                            <div className="h-4 bg-muted rounded animate-pulse w-full" />
                            <div className="h-4 bg-muted rounded animate-pulse w-1/3" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : activity.length === 0 && !isLoadingActivity ? (
                  <Card className="bg-card border border-border shadow-sm">
                    <CardContent className="p-12 text-center">
                      <div className="flex flex-col items-center space-y-2">
                        <CircleEllipsis className="h-10 w-10 text-muted-foreground" />
                        <h3 className="text-lg font-medium">No activity found</h3>
                        <p className="text-muted-foreground">
                          Bets and predictions will appear here as they are created.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  filterActivity(activity, searchTerm).map((item, index) => (
                    <Card key={`${item.type}_${item.prediction_id}_${index}`} className="bg-card border border-border shadow-sm">
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
                                <span className="font-medium text-foreground">
                                  {item.type === 'bet' ? item.username : item.agent_name}
                                </span>
                                <span className="ml-2 text-muted-foreground">
                                  {item.type === 'bet' ? 'wagered on:' : 'created prediction:'}
                                </span>
                              </div>
                              <div 
                                className="mt-1 text-foreground hover:text-primary transition-colors cursor-pointer"
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
                                  <Badge variant="secondary" className="bg-muted text-foreground">
                                    {item.amount} ANML
                                  </Badge>
                                  <Badge variant="outline" className={item.choice === 'YES' ? 'border-emerald-500 text-emerald-500' : 'border-red-500 text-red-500'}>
                                    {item.choice}
                                  </Badge>
                                </div>
                              )}
                              
                              <div className="text-xs text-muted-foreground mt-2">
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
                      onPress={loadMoreActivity}
                      disabled={isLoadingActivity}
                      className="min-w-[200px]"
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
                  <div className="text-center text-muted-foreground py-4">
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