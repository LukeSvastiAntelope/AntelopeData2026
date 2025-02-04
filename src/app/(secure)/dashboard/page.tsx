'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Spinner } from "@heroui/spinner";
import { Chip } from "@heroui/chip";
import { Button } from "@heroui/button";
import { Image } from "@heroui/image";
import { FaRocket, FaDatabase, FaChartLine, FaShieldAlt } from "react-icons/fa";
import { useFetch } from "@/app/utils/lib";
import { IAgentProfile } from "@/app/utils/interface";
import { Tooltip } from "@heroui/tooltip";


// ------------- ADDED: Chart.js imports -------------
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  PointElement,
  LineElement,
  TimeScale,
  TooltipItem,
} from "chart.js";
import { Scatter } from "react-chartjs-2";
import 'chartjs-adapter-date-fns';

ChartJS.register(
  BarElement,
  CategoryScale,
  LinearScale,
  Title,
  ChartTooltip,
  Legend,
  PointElement,
  LineElement,
  TimeScale
);
// ----------------------------------------------------

interface IPrediction {
  id: string;
  description: string;
  source: string;
  predicted_outcome: string;
  creator_choice: string;
  bets_count: number;
  status: string;
  bet_amount: number;
  resolution_date: string;
  str_thumb: string;
  outcome: string;
  agent_bets: IBet[];
}

interface IBet {
  id: number;
  description: string;
  reason: string;
  choice: string;
  agent_bets: IBet[];
  predicted_outcome?: string;
  creator_choice?: string;
  amount: number;
  source: string;
  status: string;
  outcome: string;
  created_at: string;
  resolution_date: string;
  str_thumb?: string;
  bet_id: number;
}

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

const ITEMS_PER_PAGE_BETS = 50;
const ITEMS_PER_PAGE_PREDICTIONS = 50;
const ITEMS_PER_PAGE_ACTIVITY = 50;

const filterBets = (bets: IBet[], searchTerm: string): IBet[] => {
  const term = searchTerm.toLowerCase();
  return bets.filter(bet =>
    bet.description.toLowerCase().includes(term) ||
    bet.source.toLowerCase().includes(term) ||
    bet.status.toLowerCase().includes(term)
  );
};

const filterPredictions = (predictions: IPrediction[], searchTerm: string): IPrediction[] => {
  const term = searchTerm.toLowerCase();
  return predictions.filter(prediction =>
    prediction.description.toLowerCase().includes(term) ||
    prediction.source.toLowerCase().includes(term) ||
    prediction.status.toLowerCase().includes(term) ||
    prediction.bets_count.toString().includes(term)
  );
};

const filterActivity = (activity: IActivity[], searchTerm: string): IActivity[] => {
  const term = searchTerm.toLowerCase();
  return activity.filter(item =>
    item.description?.toLowerCase().includes(term) ||
    item.source?.toLowerCase().includes(term) ||
    item.type?.toLowerCase().includes(term)
  );
};

function StatCard({
  icon,
  title,
  value,
  className = "",
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-white/10  shadow-lg px-4 py-2 flex justify-between items-center ${className}`}
    >
      <div className="flex flex-row gap-1">
        <p className="text-gray-500 text-sm">{title}</p>
        <p className="font-semibold text-sm">{value}</p>
      </div>
      <div className="text-primary text-1xl">{icon}</div>
    </div>
  );
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<"bets" | "predictions" | "activity">("activity");
  const [searchTerm, setSearchTerm] = useState('');
  const [searchPredictions, setSearchPredictions] = useState('');
  // Agent
  const [agent, setAgent] = useState<IAgentProfile | null>(null);
  // Bets state
  const [bets, setBets] = useState<IBet[]>([]);
  const [isLoadingBets, setIsLoadingBets] = useState<boolean>(true);
  const [isLoadingActivity, setIsLoadingActivity] = useState<boolean>(true);
  const [activity, setActivity] = useState<IActivity[]>([]);
  const [pageBets, setPageBets] = useState<number>(1);
  const [hasMoreBets, setHasMoreBets] = useState<boolean>(true);


  // Predictions state
  const [predictions, setPredictions] = useState<IPrediction[]>([]);
  const [isLoadingPredictions, setIsLoadingPredictions] = useState<boolean>(true);
  const [displayedPredictions, setDisplayedPredictions] = useState<IPrediction[]>([]);
  const [pagePredictions, setPagePredictions] = useState<number>(1);
  const [hasMorePredictions, setHasMorePredictions] = useState<boolean>(true);

  // Activity state
  const [pageActivity, setPageActivity] = useState<number>(1);
  const [hasMoreActivity, setHasMoreActivity] = useState<boolean>(true);

  const totalBets = bets.length;
  const totalPredictions = predictions.length;

  // Recalculate success rate exactly as in markets:
  // Only consider bets that are marked as "resolved" then compare outcome and choice case-insensitively.
  const resolvedBets = bets.filter((bet) => bet.status === "resolved");
  const wonBets = resolvedBets.filter((bet) =>
    bet.outcome?.toLowerCase() === bet.choice?.toLowerCase()
  );
  const successRate =
    resolvedBets.length > 0 ? (wonBets.length / resolvedBets.length) * 100 : 0;

  const fetch = useFetch();
  const router = useRouter();

  // Fetch Bets
  const fetchBets = async (pageNumber: number) => {
    setIsLoadingBets(true);
    try {
      const response = await fetch.get(
        `/api/getAgentBetHistory?page=${pageNumber}&limit=${ITEMS_PER_PAGE_BETS}`
      );
      if (response.status) {
        if (pageNumber === 1) {
          setBets(response.bets);
        } else {
          setBets((prev) => [...prev, ...response.bets]);
        }
        setHasMoreBets(response.bets.length === ITEMS_PER_PAGE_BETS);
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      console.error("Failed to fetch bets:", error);
      toast.error("Failed to fetch bets");
      setHasMoreBets(false);
    } finally {
      setIsLoadingBets(false);
    }
  };

  const loadMoreBets = () => {
    if (!isLoadingBets && hasMoreBets) {
      const nextPage = pageBets + 1;
      setPageBets(nextPage);
      fetchBets(nextPage);
    }
  };

  // Fetch Predictions
  const fetchPredictions = async () => {
    setIsLoadingPredictions(true);

    try {
      const response = await fetch.get("/api/getPredictionHistory");
      if (response.status) {
        setPredictions(response.predictions);
        setDisplayedPredictions(response.predictions.slice(0, ITEMS_PER_PAGE_PREDICTIONS));
        setHasMorePredictions(response.predictions.length > ITEMS_PER_PAGE_PREDICTIONS);
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      toast.error("Failed to fetch predictions: " + error);
      setHasMorePredictions(false);
    } finally {
      setIsLoadingPredictions(false);
    }
  };

  const fetchActivity = async (pageNumber: number) => {
    setIsLoadingActivity(true);
    try {
      const response = await fetch.get(`/api/getRecentActivity?page=${pageNumber}&limit=${ITEMS_PER_PAGE_ACTIVITY}`);
      if (response.status) {
        if (pageNumber === 1) {
          setActivity(response.activity);
        } else {
          setActivity((prev) => [...prev, ...response.activity]);
        }
        setHasMoreActivity(response.activity.length === ITEMS_PER_PAGE_ACTIVITY);
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      toast.error("Failed to fetch activity: " + error);
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

  // Infinite scroll for predictions
  useEffect(() => {
    if (activeTab !== "predictions") return;

    const loadMorePredictions = () => {
      const filteredPredictions = filterPredictions(predictions, searchPredictions);
      const startIndex = (pagePredictions - 1) * ITEMS_PER_PAGE_PREDICTIONS;
      const endIndex = startIndex + ITEMS_PER_PAGE_PREDICTIONS;
      const nextItems = filteredPredictions.slice(0, endIndex);

      setDisplayedPredictions(nextItems);
      setHasMorePredictions(nextItems.length < filteredPredictions.length);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMorePredictions) {
          setPagePredictions((prev) => prev + 1);
        }
      },
      { threshold: 0.1 }
    );

    const sentinel = document.getElementById("sentinel");
    if (sentinel) observer.observe(sentinel);

    // Load more predictions when page changes
    loadMorePredictions();
    return () => observer.disconnect();
  }, [activeTab, predictions, pagePredictions, searchPredictions, hasMorePredictions]);

  // Reset pagination when search term changes
  useEffect(() => {
    if (activeTab === "predictions") {
      setPagePredictions(1);
      const filteredPredictions = filterPredictions(predictions, searchPredictions);
      setDisplayedPredictions(filteredPredictions.slice(0, ITEMS_PER_PAGE_PREDICTIONS));
      setHasMorePredictions(filteredPredictions.length > ITEMS_PER_PAGE_PREDICTIONS);
    }
  }, [searchPredictions, activeTab, predictions]);

  // Fetch Agent + Bets + Predictions
  useEffect(() => {
    const fetchAgentProfile = async () => {
      try {
        const response = await fetch.get("/api/getAgentProfile");
        if (response.status) {
          setAgent(response.agent);
        } else {
          toast.error(response.message);
        }
      } catch (error) {
        console.error("Failed to fetch agent profile:", error);
        toast.error("Failed to fetch agent profile");
      }
      fetchBets(1);
      fetchPredictions();
      fetchActivity(1);
    };
    fetchAgentProfile();
  }, []);

  const handleBetSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handlePredictionSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchPredictions(e.target.value);
  };

  const scatterData = {
    datasets: [
      {
        label: "",
        data: bets.map((bet, index) => {
          return {
            x: bet.resolution_date ? new Date(bet.resolution_date) : null,
            y: index + 1, // or any number that spaces them out
            betName: bet.description,
          };
        }),
        backgroundColor: "#36A2EB",
      },
    ],
  };

  const scatterOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        callbacks: {
          label: function (context: TooltipItem<'scatter'>) {
            return (context.raw as { betName: string }).betName || "Unknown Bet";
          },
        },
      },
      legend: {
        display: false,
      },
      title: {
        display: false,
        text: "Bet Resolution Timeline",
        color: "#fff",
      },
    },
    scales: {
      x: {
        type: 'time' as const,
        time: {
          unit: 'day' as const,
        },
        ticks: { color: '#6b7280' }
      },
      y: {
        ticks: { color: '#6b7280' }
      }
    }
  };
  // -------------------------------------------------------------------------

  return (
    <>
      <div className="flex flex-col mt-2 gap-0 mb-6">
        <h1 className="font-bold mb-2 font-kodemono">Dashboard Overview</h1>
        <p className="h1paragraph text-gray-500">
          Track your betting performance and prediction accuracy
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          icon={<FaRocket />}
          title="Bets"
          value={totalBets.toString()}
        />
        <StatCard
          icon={<FaDatabase />}
          title="Predictions"
          value={totalPredictions.toString()}
        />
        <StatCard
          icon={<FaChartLine />}
          title="Success"
          value={`${successRate.toFixed(2)}%`}
        />
        <StatCard
          icon={<FaShieldAlt />}
          title="Avg. Bet Size"
          value={`${agent?.maxBetSize || 0}`}
        />
      </div>
      <div className="py-0 mb-4">
        <div className="h-[160px]">
          {bets && bets.length > 0 ? (
            <Scatter data={scatterData} options={scatterOptions} />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              No bets to display in graph
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-4 mb-2 w-full justify-between">
        <div className="flex gap-4 font-kodemono items-center">
          <Tooltip content="View your recent activity" showArrow>
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

          <Tooltip content="Review your bets history" showArrow>
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

          <Tooltip content="Check out predictions" showArrow>
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

      {activeTab === "bets" && (
        !agent || !agent.interests || agent.interests.length === 0 || !agent.principles || agent.principles.length === 0 ?
          <div>
            <div className="relative mb-6 group">
              <span className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none">
                {/* Search Icon */}
                <svg
                  aria-hidden="true"
                  className="w-5 h-5 text-gray-700 group-focus-within:text-white transition-colors duration-200"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="10" cy="10" r="7"></circle>
                  <path d="M21 21l-4.35-4.35"></path>
                </svg>
              </span>
              <input
                type="text"
                value={activeTab === "bets" ? searchTerm : searchPredictions}
                onChange={activeTab === "bets" ? handleBetSearch : handlePredictionSearch}
                placeholder={`Search ${activeTab}...`}
                className="w-full p-2 pl-9 rounded-md focus:outline-none text-small input-search bg-gray-800"
              />
            </div>
            <div className="flex flex-col gap-2 mb-8 border border-white/10 rounded-xl p-6 text-center empty-state place-content-center">
              <div className="map-center"></div>
              <h1 className="font-bold mb-1 font-kodemono">Create your strategy</h1>
              <p className="text-gray-400 pb-2 ">
                You haven&apos;t created your AI agents strategy yet. Before it can bet create the strategy and choose your area of interest.
              </p>
              <Button onPress={() => router.push('/strategy')} className="w-fit mx-auto" color="primary" variant="flat">Create Strategy</Button>
            </div>
          </div>
          :
          <section className="rounded-lg overflow-x-auto">
            {isLoadingBets && bets.length === 0 && (
              <div className="flex justify-center items-center py-8">
                <Spinner size="lg" />
              </div>
            )}
            {!isLoadingBets && bets.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                No bets found
              </div>
            )}

            {bets.length > 0 && (
              <table className="w-full text-sm text-left">
                <tbody>
                  {filterBets(bets, searchTerm).map((bet, index) => {
                    // Group bets by choice and calculate totals
                    const choiceTotals = bet.agent_bets?.reduce((acc, b) => {
                      acc[b.choice.toLowerCase()] = (acc[b.choice.toLowerCase()] || 0) + b.amount;
                      return acc;
                    }, {} as Record<string, number>) || {};

                    const totalAmount = Object.values(choiceTotals).reduce((sum, amount) => sum + amount, 0);

                    // Calculate odds for each choice
                    const choiceOdds = Object.entries(choiceTotals).map(([choice, amount]) => {
                      const percentage = totalAmount > 0 ? (amount / totalAmount) * 100 : 0;
                      const odds = percentage > 0 ? (100 / percentage).toFixed(2) : "∞";
                      return {
                        choice,
                        amount,
                        odds,
                        percentage: percentage.toFixed(1)
                      };
                    });

                    return (
                      <tr
                        key={index}
                        className="transition-all select-item"
                        onClick={() => router.push(`/bets/${bet.bet_id}`)}
                      >
                        <td className="p-2 rounded-lg cursor-pointer">
                          <div className="flex items-start gap-4">
                            {/* Thumbnail */}
                            {bet.str_thumb ? (
                              <Image
                                src={bet.str_thumb}
                                alt={bet.description}
                                width={48}
                                height={48}
                                className="rounded-full object-cover w-12 h-12"
                              />
                            ) : (
                              <div className="rounded-lg bg-gray-700/50 w-12 h-12 flex items-center justify-center">
                                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </div>
                            )}

                            {/* Content */}
                            <div className="flex-1 space-y-1">
                              {/* Description */}
                              <p className="text-base text-gray-200 font-regular leading-snug">
                                {bet.description}
                              </p>

                              {/* Stats & Chips */}
                              <div className="flex flex-wrap items-center gap-1">
                                {/* Bet Amount */}
                                <Tooltip content="Bet amount" showArrow>
                                  <div className="flex items-center gap-1 py-1">
                                    <span className="text-sm icon-coin text-gray-300">{bet.amount}</span>
                                  </div></Tooltip>

                                {/* Market Odds */}
                                {choiceOdds.map(({ choice, percentage }, index) => (
                                  <Tooltip
                                    key={index}
                                    content={
                                      choice.toLowerCase() === bet.creator_choice?.toLowerCase()
                                        ? "Agents betting Yes"
                                        : "Agents betting No"
                                    }
                                    showArrow
                                  >
                                    <Chip
                                      className={
                                        choice.toLowerCase() === bet.creator_choice?.toLowerCase()
                                          ? "bg-success/20 text-success-500 icon-thumbs-up px-2"
                                          : "bg-danger/20 text-danger-500 icon-thumbs-down px-2"
                                      }
                                      size="sm"
                                    >
                                      {percentage}%
                                    </Chip>
                                  </Tooltip>
                                ))}

                                {/* Status */}
                                <Tooltip
                                  content={
                                    bet.status === "resolved"
                                      ? bet.outcome === bet.choice
                                        ? "Won"
                                        : "Lost"
                                      : bet.status === "Pending"
                                        ? "Awaiting"
                                        : bet.status
                                  }
                                  showArrow
                                >
                                  <Chip
                                    className={`${bet.status === "resolved"
                                      ? bet.outcome?.toLowerCase() === bet.choice?.toLowerCase()
                                        ? "bg-green-500/20 text-green-400"
                                        : "bg-red-500/20 text-red-400"
                                      : bet.status === "Pending"
                                        ? "bg-yellow-500/20 text-yellow-400"
                                        : "bg-blue-500/20 text-blue-400"
                                      }`}
                                    size="sm"
                                  >
                                    {bet.status === "resolved"
                                      ? bet.outcome?.toLowerCase() === bet.choice?.toLowerCase()
                                        ? "Won"
                                        : "Lost"
                                      : bet.status === "Pending"
                                        ? "Awaiting"
                                        : bet.status
                                    }
                                  </Chip>
                                </Tooltip>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {hasMoreBets && !isLoadingBets && bets.length > 0 && (
              <div className="flex justify-center mt-4">
                <Button
                  color="primary"
                  variant="flat"
                  onPress={loadMoreBets}
                  isLoading={isLoadingBets}
                  className="min-w-[200px]"
                >
                  {isLoadingBets ? "Loading..." : "Show More"}
                </Button>
              </div>
            )}
            {isLoadingBets && bets.length > 0 && (
              <div className="flex justify-center items-center py-4">
                <Spinner size="sm" />
              </div>
            )}
            {!hasMoreBets && bets.length > 0 && (
              <div className="text-center text-gray-500 py-4">
                No more bets to load
              </div>
            )}
          </section>
      )}

      {activeTab === "predictions" && (
        !agent || !agent.interests || agent.interests.length === 0 || !agent.principles || agent.principles.length === 0 ?
          <div>
            <div className="relative mb-6 group">
              <span className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none">
                {/* Search Icon */}
                <svg
                  aria-hidden="true"
                  className="w-5 h-5 text-gray-700 group-focus-within:text-white transition-colors duration-200"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="10" cy="10" r="7"></circle>
                  <path d="M21 21l-4.35-4.35"></path>
                </svg>
              </span>
              <input
                type="text"
                value={activeTab === "predictions" ? searchTerm : searchPredictions}
                onChange={activeTab === "predictions" ? handleBetSearch : handlePredictionSearch}
                placeholder={`Search ${activeTab}...`}
                className="w-full p-2 pl-9 rounded-md focus:outline-none text-small input-search bg-gray-800"
              />
            </div>
            <div className="flex flex-col gap-2 mb-8 border border-white/10 rounded-xl p-6 text-center empty-state place-content-center">
              <div className="map-center"></div>
              <h1 className="font-bold mb-1 font-kodemono">Create your strategy</h1>
              <p className="text-gray-400 pb-2 ">
                You haven&apos;t created your AI agents strategy yet. Before it can bet create the strategy and choose your area of interest.
              </p>
              <Button onPress={() => router.push('/strategy')} className="w-fit mx-auto" color="primary" variant="flat">Create Strategy</Button>
            </div>
          </div> :
          <section className="rounded-lg overflow-x-auto mb-8">
            {isLoadingPredictions && predictions.length === 0 ? (
              <div className="flex justify-center items-center py-8">
                <Spinner size="lg" />
              </div>
            ) : displayedPredictions.length === 0 && !isLoadingPredictions ? (
              <div className="text-center text-gray-500 py-8">
                No predictions found
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {displayedPredictions.map((prediction, index) => {
                  const choiceTotals = prediction.agent_bets?.reduce((acc, b) => {
                    acc[b.choice.toLowerCase()] = (acc[b.choice.toLowerCase()] || 0) + b.amount;
                    return acc;
                  }, {} as Record<string, number>) || {};

                  const totalAmount = Object.values(choiceTotals).reduce((sum, amount) => sum + amount, 0);

                  // Calculate odds for each choice
                  const choiceOdds = Object.entries(choiceTotals).map(([choice, amount]) => {
                    const percentage = totalAmount > 0 ? (amount / totalAmount) * 100 : 0;
                    const odds = percentage > 0 ? (100 / percentage).toFixed(2) : "∞";
                    return {
                      choice,
                      amount,
                      odds,
                      percentage: percentage.toFixed(1)
                    };
                  });

                  return (
                    <div
                      key={index}
                      onClick={() => router.push(`/predictions/${prediction.id}`)}
                      className="flex items-center gap-4 p-2 bg-gray-900/30 rounded-xl select-item transition-colors cursor-pointer"
                    >
                      {prediction.str_thumb ? (
                        <Image
                          src={prediction.str_thumb}
                          alt=""
                          width={40}
                          height={40}
                          className="w-10 h-10 rounded-full"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-800" />
                      )}

                      <div className="flex flex-col flex-grow gap-2">
                        <div className="text-base text-gray-100">{prediction.description}</div>

                        <div className="flex flex-wrap gap-2 items-center">

                          {choiceOdds.map(({ choice, percentage }, index) => (
                            <Tooltip
                              content={
                                choice.toLowerCase() === prediction.creator_choice.toLowerCase()
                                  ? "Agents betting Yes"
                                  : "Agents betting No"
                              }
                              showArrow
                              key={index}
                            >
                              <Chip
                                className={`${choice === prediction.creator_choice
                                  ? 'bg-success/20 text-success-500 icon-thumbs-up px-2'
                                  : 'bg-danger/20 text-danger-500 icon-thumbs-down px-2'
                                  }`}
                                size="sm"
                              >
                                {/* {choice}: {amount} ({odds}x)  */}
                                {percentage}%
                              </Chip>
                            </Tooltip>
                          ))}

                          {/* Status */}
                          <Tooltip
                            content={
                              prediction.status === "open"
                                ? "Open"
                                : "Closed"
                            }
                            showArrow
                          >
                            <Chip
                              className={`${prediction.status === "open"
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-yellow-500/20 text-yellow-400"
                                }`}
                              size="sm"
                            >
                              {/* make sure first letter is upper case */}
                              {prediction.status.charAt(0).toUpperCase() + prediction.status.slice(1)}
                            </Chip>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div id="sentinel" className="flex justify-center p-4">
              {hasMorePredictions && displayedPredictions.length > 0 && (
                <Spinner size="sm" />
              )}
              {!hasMorePredictions && predictions.length > 0 && (
                <p className="text-gray-500">No more predictions to load</p>
              )}
            </div>
          </section>
      )}

      {
        activeTab === "activity" && (
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
                    onClick={() =>
                      item.type === "bet"
                        ? router.push(`/bets/${item.bet_id}`)
                        : item.type === "prediction"
                        && router.push(`/predictions/${item.prediction_id}`)
                    }
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
                            {item.description}
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
                                  if (item.choice.toLowerCase() === "yes") {
                                    return "relative max-w-fit min-w-min inline-flex items-center justify-between box-border whitespace-nowrap h-6 text-tiny rounded-full bg-success/20 text-success-500 icon-thumbs-up px-2";
                                  } else if (item.choice.toLowerCase() === "no") {
                                    return "relative max-w-fit min-w-min inline-flex items-center justify-between box-border whitespace-nowrap h-6 text-tiny rounded-full bg-danger/20 text-danger-500 icon-thumbs-down px-2";
                                  } else if (item.choice.toLowerCase() === "draw") {
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
        )
      }
    </>
  );
} 