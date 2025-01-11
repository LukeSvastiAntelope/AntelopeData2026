'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { Spinner } from "@nextui-org/spinner";
import { Chip } from "@nextui-org/chip";
import { Button } from "@nextui-org/button";
import { Image } from "@nextui-org/image";
import { FaRocket, FaDatabase, FaChartLine, FaShieldAlt } from "react-icons/fa";
import { useFetch } from "@/app/utils/lib";
import { IAgentProfile } from "@/app/utils/interface";

// ------------- ADDED: Chart.js imports -------------
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
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
  Tooltip,
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

const ITEMS_PER_PAGE_BETS = 50;
const ITEMS_PER_PAGE_PREDICTIONS = 50;

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
    prediction.status.toLowerCase().includes(term)
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
      className={`rounded-xl border border-white/10 bg-gray-900/50 shadow-lg p-6 flex justify-between items-center ${className}`}
    >
      <div className="flex flex-col gap-1">
        <p className="text-gray-400 text-sm">{title}</p>
        <p className="text-xl font-semibold">{value}</p>
      </div>
      <div className="text-primary text-2xl">{icon}</div>
    </div>
  );
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<"bets" | "predictions">("bets");
  const [searchTerm, setSearchTerm] = useState('');
  const [searchPredictions, setSearchPredictions] = useState('');
  // Agent
  const [agent, setAgent] = useState<IAgentProfile | null>(null);
  // Bets state
  const [bets, setBets] = useState<IBet[]>([]);
  const [isLoadingBets, setIsLoadingBets] = useState<boolean>(true);
  const [pageBets, setPageBets] = useState<number>(1);
  const [hasMoreBets, setHasMoreBets] = useState<boolean>(true);

  // Predictions state
  const [predictions, setPredictions] = useState<IPrediction[]>([]);
  const [isLoadingPredictions, setIsLoadingPredictions] = useState<boolean>(true);
  const [displayedPredictions, setDisplayedPredictions] = useState<IPrediction[]>([]);
  const [pagePredictions, setPagePredictions] = useState<number>(1);
  const [hasMorePredictions, setHasMorePredictions] = useState<boolean>(true);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const totalBets = bets.length;
  const totalPredictions = predictions.length;

  // For success rate -- example approach
  const closedBets = bets.filter((bet) => bet.status !== "open");
  const wonBets = closedBets.filter((bet) => bet.outcome === bet.choice);
  const successRate = closedBets.length > 0
    ? (wonBets.length / closedBets.length) * 100
    : 0;

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

  // Lazy-fetch predictions
  useEffect(() => {
    if (activeTab === "predictions" && predictions.length === 0) {
      fetchPredictions();
      console.log("fetching predictions");
    }
  }, [activeTab, predictions]);

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
    };
    fetchAgentProfile();
  }, []);

  const handleBetSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handlePredictionSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchPredictions(e.target.value);
  };

  // --------------------------- CREATE SCATTER DATA --------------------------
  // For each bet, create a single dot with x= resolution date, y= index
  // We'll show the bet description in a custom tooltip.
  const scatterData = {
    datasets: [
      {
        label: "Bets Timeline",
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
      {
        !agent || !agent.interests || agent.interests.length === 0 || !agent.principles || agent.principles.length === 0 ?
          <div className="flex flex-col gap-2 mb-8 border border-white/10 rounded-xl p-6 text-center">
            <div className="map-center"></div>
            <h1 className="font-bold mb-2 font-kodemono">Create your strategy</h1>
            <p className="text-gray-400">
              You haven’t created your AI agents strategy yet. Before it can bet create the strategy and choose your area of interest.
            </p>
            <Button color="primary" variant="flat" onPress={() => router.push("/strategy")}>
              Create Strategy
            </Button>
          </div> :
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <Link href="/bets">
                <StatCard
                  icon={<FaRocket />}
                  title="Total Bets"
                  value={totalBets.toString()}
                />
              </Link>
              <Link href="/predictions">
                <StatCard
                  icon={<FaDatabase />}
                  title="Predictions"
                  value={totalPredictions.toString()}
                />
              </Link>
              <StatCard
                icon={<FaChartLine />}
                title="Success"
                value={`${Number(successRate || 0).toFixed(2)}%`}
              />
              <StatCard
                icon={<FaShieldAlt />}
                title="Bet Size"
                value={`${agent?.maxBetSize || 0}`}
              />
            </div>

            <div className="bg-gray-900/50 border border-white/10 rounded-xl p-6 mb-8">
              <h2 className="text-lg font-semibold mb-4">Betting Timeline</h2>
              <div className="h-[300px]">
                {bets && bets.length > 0 ? (
                  <Scatter data={scatterData} options={scatterOptions} />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    No bets to display in graph
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-4 mb-6 w-full justify-between">
              <div className="flex gap-4">
                <Button
                  className={`px-6 py-2 rounded-lg ${activeTab === "bets"
                    ? "bg-primary text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                    }`}
                  onPress={() => setActiveTab("bets")}
                >
                  Bets History
                </Button>
                <Button
                  className={`px-6 py-2 rounded-lg ${activeTab === "predictions"
                    ? "bg-primary text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                    }`}
                  onPress={() => setActiveTab("predictions")}
                >
                  Predictions
                </Button>
              </div>
            </div>

            <div className="relative mb-6">
              <input
                type="text"
                value={activeTab === "bets" ? searchTerm : searchPredictions}
                onChange={activeTab === "bets" ? handleBetSearch : handlePredictionSearch}
                placeholder={`Search ${activeTab}...`}
                className="w-full px-12 py-3 bg-gray-900/50 border border-white/10 rounded-xl text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <svg
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {activeTab === "bets" && (
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
                          acc[b.choice] = (acc[b.choice] || 0) + b.amount;
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
                            className="transition-all hover:bg-gray-800/50 border-b border-gray-800/50"
                            onClick={() => router.push(`/bets/${bet.bet_id}`)}
                          >
                            <td className="p-4 cursor-pointer">
                              <div className="flex items-start gap-4">
                                {/* Thumbnail */}
                                {bet.str_thumb ? (
                                  <Image
                                    src={bet.str_thumb}
                                    alt={bet.description}
                                    width={48}
                                    height={48}
                                    className="rounded-lg object-cover w-12 h-12"
                                  />
                                ) : (
                                  <div className="rounded-lg bg-gray-700/50 w-12 h-12 flex items-center justify-center">
                                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                  </div>
                                )}

                                {/* Content */}
                                <div className="flex-1 space-y-2">
                                  {/* Description */}
                                  <p className="text-sm text-gray-200 font-medium leading-snug">
                                    {bet.description}
                                  </p>

                                  {/* Stats & Chips */}
                                  <div className="flex flex-wrap items-center gap-2">
                                    {/* Bet Amount */}
                                    <div className="flex items-center gap-1 bg-gray-700/30 px-2 py-1 rounded-md">
                                      <span className="icon-coin text-amber-500" />
                                      <span className="text-sm text-gray-300">{bet.amount}</span>
                                    </div>

                                    {/* Market Odds */}
                                    {choiceOdds.map(({ choice, amount, odds, percentage }) => (
                                      <Chip
                                        key={choice}
                                        className={`${choice === bet.choice
                                          ? 'bg-primary/20 text-primary-500'
                                          : 'bg-gray-700/30 text-gray-300'
                                          }`}
                                        size="sm"
                                      >
                                        {choice}: {amount} ({odds}x) {percentage}%
                                      </Chip>
                                    ))}

                                    {/* Status */}
                                    <Chip
                                      className={`${bet.status === "resolved"
                                        ? bet.outcome === bet.choice
                                          ? "bg-green-500/20 text-green-400"
                                          : "bg-red-500/20 text-red-400"
                                        : bet.status === "awaiting_confirmation"
                                          ? "bg-yellow-500/20 text-yellow-400"
                                          : "bg-blue-500/20 text-blue-400"
                                        }`}
                                      size="sm"
                                    >
                                      {bet.status === "resolved"
                                        ? bet.outcome === bet.choice
                                          ? "Won"
                                          : "Lost"
                                        : bet.status === "awaiting_confirmation"
                                          ? "Awaiting"
                                          : bet.status}
                                    </Chip>
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
                    {
                      displayedPredictions.map((prediction, index) => {
                        const choiceTotals = prediction.agent_bets?.reduce((acc, b) => {
                          acc[b.choice] = (acc[b.choice] || 0) + b.amount;
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
                            className="flex items-center gap-4 p-4 bg-gray-900/30 rounded-xl hover:bg-gray-900/50 transition-colors cursor-pointer"
                          >
                            <div className="flex-shrink-0">
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
                            </div>

                            <div className="flex flex-col flex-grow gap-2">
                              <div className="text-sm text-gray-100">
                                {prediction.description}
                              </div>

                              <div className="flex flex-wrap gap-2 items-center">
                                {/* Bets count */}
                                <div className="flex items-center gap-1 text-sm text-gray-400">
                                  <span>{prediction.agent_bets.length}</span>
                                  <span>bets</span>
                                </div>
                                {choiceOdds.map(({ choice, amount, odds, percentage }) => (
                                  <Chip
                                    key={choice}
                                    className={`${choice === prediction.creator_choice
                                      ? 'bg-primary/20 text-primary-500'
                                      : 'bg-gray-700/30 text-gray-300'
                                      }`}
                                    size="sm"
                                  >
                                    {choice}: {amount} ({odds}x) {percentage}%
                                  </Chip>
                                ))}

                                {/* Status */}
                                <Chip
                                  className={`${prediction.status === "open"
                                    ? "bg-green-500/20 text-green-400"
                                    : "bg-gray-500/20 text-gray-400"
                                    }`}
                                  size="sm"
                                >
                                  {prediction.status}
                                </Chip>
                              </div>
                            </div>
                          </div>)
                      })
                    }
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
          </>
      }
    </>
  );
} 