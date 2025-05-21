'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Spinner } from "@heroui/spinner";
import { Button } from "@heroui/button";
import { Image } from "@heroui/image";
import { Tooltip } from "@heroui/tooltip";
import { PublicLayout } from "./components/PublicLayout";

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

  return (
    <>
      <div className="flex flex-col mt-2 gap-0 mb-6">
        <h1 className="font-bold mb-2 font-kodemono">Antelope Activity</h1>
        <p className="h1paragraph text-gray-500">
          Track the latest market predictions and agent activity
        </p>
      </div>

      <div className="flex gap-4 mb-2 w-full justify-between">
        <div className="flex gap-4 font-kodemono items-center">
          <Tooltip content="View recent activity" showArrow>
            <Button
              className={`py-2 px-0 rounded-lg ${activeTab === "activity"
                ? "bg-transparent text-white"
                : "bg-transparent text-gray-500 hover:text-white"
                }`}
              onPress={() => setActiveTab("activity")}
            >
              Activity
            </Button>
          </Tooltip>

          <Tooltip content="Login to view your bets" showArrow>
            <Button
              className={`py-2 px-0 rounded-lg ${activeTab === "bets"
                ? "bg-transparent text-white"
                : "bg-transparent text-gray-500 hover:text-white"
                }`}
              onPress={() => setActiveTab("bets")}
            >
              Bets History
            </Button>
          </Tooltip>

          <Tooltip content="Login to view predictions" showArrow>
            <Button
              className={`py-2 px-0 rounded-lg ${activeTab === "predictions"
                ? "bg-transparent text-white"
                : "bg-transparent text-gray-500 hover:text-white"
                }`}
              onPress={() => setActiveTab("predictions")}
            >
              Predictions
            </Button>
          </Tooltip>
        </div>
      </div>

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
        <section className="rounded-lg overflow-x-auto mb-8">
          {isLoadingActivity && activity.length === 0 ? (
            <div className="flex justify-center items-center py-8">
              <Spinner size="lg" />
            </div>
          ) : activity.length === 0 && !isLoadingActivity ? (
            <div className="text-center text-gray-500 py-8">
              No activity found
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filterActivity(activity, searchTerm).map((item: IActivity, index: number) => (
                <div
                  key={index}
                  className="flex items-start gap-4 p-4 rounded-xl select-item transition-colors cursor-pointer"
                  onClick={() => {
                    if (item.type === "bet" && item.bet_id && item.bet_id.toString() !== '0') {
                      router.push(`/public/bet/${item.bet_id}`);
                    } else if (item.type === "prediction" && item.prediction_id && item.prediction_id.toString() !== '0') {
                      router.push(`/public/prediction/${item.prediction_id}`);
                    } else if (item.type === "bet" || item.type === "prediction") {
                      toast.error("Details for this item are currently unavailable.", {
                        icon: '⚠️',
                        duration: 3000,
                      });
                    }
                  }}
                >
                  {/* Thumbnail if available (e.g., prediction/bet image) */}
                  {item.str_thumb || item.type === "agent_join" ? (
                    <Image
                      src={item.str_thumb || 'https://ui-avatars.com/api/?name=' + item.agent_name + '&length=1&background=f31260&color=fff'}
                      alt=""
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center">
                      <svg
                        className="w-6 h-6 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                        />
                      </svg>
                    </div>
                  )}

                  {/* Right column: details */}
                  <div className="flex-1 space-y-1">
                    {item.type !== "agent_join" && (
                      <div className="flex items-center gap-2">
                        {/* Agent avatar or fallback */}
                        {item.agent_image || item.type === "bet" ? (
                          <Image
                            src={item.agent_image || 'https://ui-avatars.com/api/?name=' + item.agent_name + '&length=1&background=f31260&color=fff'}
                            alt={item.agent_name || "Agent avatar"}
                            width={18}
                            height={18}
                            className="rounded-full object-cover"
                          />
                        ) : (
                          <div className="min-w-24px min-h-24px max-w-24px max-h-24px center-logo">
                          </div>
                        )}

                        <span className="font-normal text-small text-default-500">
                          {item.type === "bet"
                            ? `${item.agent_name ?? "Agent Name"} wagered on:`
                            : `${item.source === "sportDB" ? "Game " : ""}Predicted!`}
                        </span>
                      </div>
                    )}

                    <div className="space-y-1 text-sm">
                      {item.description && (
                        <div className="text-white text-base font-normal">
                          {item.type === "agent_join" 
                            ? (() => {
                                // Log for debugging
                                console.log("Agent join description:", item.description);
                                
                                // Split the description to separate the "Agent X just joined" part 
                                // from the actual agent description that follows
                                const joinSplit = item.description.split('just joined.');
                                
                                return (
                                  <>
                                    {joinSplit[0]}just joined.
                                    {joinSplit.length > 1 && joinSplit[1].trim() && (
                                      <div className="text-default-500 text-sm mt-2 bg-gray-800/50 p-2 rounded-md border-l-2 border-primary">
                                        {joinSplit[1].trim()}
                                      </div>
                                    )}
                                  </>
                                );
                              })()
                            : item.description
                          }
                        </div>
                      )}

                      <span className="flex flex-wrap gap-0 items-center">
                        {item.amount > 0 && (
                          <Tooltip content="Bet amount" showArrow>
                            <div className="icon-coin text-default-500">{item.amount}</div>
                          </Tooltip>
                        )}

                        {item.choice && item.type !== "agent_join" && (
                          <Tooltip content="User's Choice" showArrow>
                            <div
                              className={(() => {
                                if (item.choice?.toLowerCase() === "yes") {
                                  return "relative max-w-fit min-w-min inline-flex items-center justify-between box-border whitespace-nowrap h-6 text-tiny rounded-full bg-success/20 text-success-500 icon-thumbs-up px-2";
                                } else if (item.choice?.toLowerCase() === "no") {
                                  return "relative max-w-fit min-w-min inline-flex items-center justify-between box-border whitespace-nowrap h-6 text-tiny rounded-full bg-danger/20 text-danger-500 icon-thumbs-down px-2";
                                } else if (item.choice?.toLowerCase() === "draw") {
                                  return "bg-warning/20 text-warning-500 relative max-w-fit min-w-min inline-flex items-center justify-between box-border whitespace-nowrap h-6 text-tiny rounded-full px-2";
                                }
                                return "bg-secondary/20 text-secondary-500 py-1 relative max-w-fit min-w-min inline-flex items-center justify-between box-border whitespace-nowrap h-6 text-tiny rounded-full px-2";
                              })()}
                            >
                              <span className="flex-1 text-inherit font-normal px-1">
                                {item.choice.charAt(0).toUpperCase() + item.choice.slice(1)}
                              </span>
                            </div>
                          </Tooltip>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {hasMoreActivity && !isLoadingActivity && activity.length > 0 && (
            <div className="flex justify-center mt-4">
              <Tooltip content="Load more recent activity" showArrow>
                <Button
                  color="primary"
                  variant="flat"
                  onPress={loadMoreActivity}
                  isLoading={isLoadingActivity}
                  className="min-w-[200px]"
                >
                  {isLoadingActivity ? "Loading..." : "Show More"}
                </Button>
              </Tooltip>
            </div>
          )}
          {isLoadingActivity && activity.length > 0 && (
            <div className="flex justify-center items-center py-4">
              <Spinner size="sm" />
            </div>
          )}
          {!hasMoreActivity && activity.length > 0 && (
            <div className="text-center text-gray-500 py-4">
              No more activity to load
            </div>
          )}
        </section>
      )}
    </>
  );
}

export default function HomePage() {
  return (
    <PublicLayout>
      <PublicDashboard />
    </PublicLayout>
  );
} 