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
  yes_total_amount: number;
  no_total_amount: number;
}

interface IBet {
  id: number;
  description: string;
  reason: string;
  choice: string;
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
  yes_bets: IBet[];
  no_bets: IBet[];
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
      className={`rounded-lg border border-white/10 shadow-md p-4 flex justify-center items-center gap-2 ${className}`}
    >
      <div className="text-primary text-sm">{icon}</div>
      <div className="flex flex-row gap-1">
        <p className="text-gray-500 text-small">{title}</p>
        <p className="text-small font-regular">{value}</p>
      </div>
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
      <div className="flex flex-row justify-between h-32">
        <div className="pr-8 pt-2">
          <h1 className="font-bold mb-2 font-kodemono ">Overview</h1>
          <p className="text-gray-500 h1paragraph">
            See how your bets and predictions are performing. Get a quick
            overview of your success rate, bet size, and more.
          </p>
        </div>
        {/* <div className="home hidden md:inline-block"></div> */}
      </div>

      {
        (!agent?.principles || agent.principles.length == 0 || !agent.interests || agent.interests.length == 0) ?
          <div className="flex flex-col items-center justify-center h-full">
            <p>Please set your principles and interests in your profile to see your stats.</p>
            <Button color="primary" variant="flat" onPress={() => router.push("/strategy")}>
              Set Principles and Interests
            </Button>
          </div> :
          <>
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-small">
              <Link href="/bets">
                <StatCard icon={<FaRocket />} title="Bets" value={totalBets.toString()}
                  className="border border-white/10" />
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

            {/* Graphs */}
            <div className="my-6 w-full hidden md:inline-block" style={{ height: "200px", width: "100%" }}>
              {bets && bets.length > 0 ? (
                <Scatter
                  data={scatterData}
                  options={scatterOptions}
                />
              ) : (
                <p>No bets to display in graph.</p>
              )}
            </div>

            {/* The rest of your existing code remains the same */}
            {/* Tabs, bet list, predictions list, etc. */}
            <div className="flex gap-4 mb-4 mt-4 font-kodemono">
              <Button
                color={activeTab === "bets" ? "primary" : "default"}
                variant="flat"
                onPress={() => setActiveTab("bets")}
              >
                Bets
              </Button>
              <Button
                color={activeTab === "predictions" ? "primary" : "default"}
                variant="flat"
                onPress={() => setActiveTab("predictions")}
              >
                Predictions
              </Button>
            </div>

            {/* BETS TAB */}
            {activeTab === "bets" && (
              <section className="rounded-lg overflow-x-auto">
                <div className="flex items-center relative mb-4">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none">
                    {/* Search Icon */}
                    <svg
                      aria-hidden="true"
                      className="w-5 h-5 text-gray-700"
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
                    value={searchTerm}
                    onChange={handleBetSearch}
                    placeholder="Search bets..."
                    className="w-full p-2 pl-9 rounded-md text-gray-500 focus:outline-none text-small input-search bg-gray-800 placeholder-gray-700"
                  />
                </div>

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
                      {filterBets(bets, searchTerm).map((bet, index) => (
                        <tr
                          key={index}
                          className="transition-colors0"
                          onClick={() => router.push(`/bets/${bet.bet_id}`)}
                        >
                          <td colSpan={5} className="p-2 backbutton cursor-pointer">
                            <div className="flex flex-row gap-4 items-start">
                              {bet.str_thumb ? (
                                <Image
                                  src={bet.str_thumb}
                                  alt={bet.description}
                                  width={40}
                                  height={40}
                                  className="w-[40px] h-[40px] rounded-full max-w-[40px] max-h-[40px] min-w-[40px] min-h-[40px]"
                                />
                              ) : (
                                <div className="w-[40px] h-[40px] rounded-full max-w-[40px] max-h-[40px] min-w-[40px] min-h-[40px] bg-gray-700"></div>
                              )}
                              <div className="flex flex-col md:flex-row gap-2 items-start w-full">
                                <p className="break-words w-full text-base">{bet.description}</p>
                                <div className="flex flex-row md:flex-row gap-2 items-start sm:items-start">
                                  <span className="icon-coin icon-text">
                                    {bet.amount}
                                  </span>
                                  <Chip
                                    color="primary"
                                    variant="flat"
                                    size="sm"
                                  >
                                    Yes: {bet.yes_bets.reduce((acc, bet) => acc + bet.amount, 0)} (
                                    {(() => {
                                      const yesTotal = bet.yes_bets.reduce((acc, bet) => acc + bet.amount, 0);
                                      const noTotal = bet.no_bets?.reduce((acc, bet) => acc + bet.amount, 0) || 0;
                                      const total = yesTotal + noTotal;
                                      const percentage = total > 0 ? (yesTotal / total) * 100 : 0;
                                      const decimalOdds = percentage > 0 ? (100 / percentage).toFixed(2) : "∞";
                                      return `${decimalOdds}x`;
                                    })()})
                                  </Chip>
                                  <Chip
                                    color="secondary"
                                    variant="flat"
                                    size="sm"
                                  >
                                    No: {bet.no_bets.reduce((acc, bet) => acc + bet.amount, 0)} (
                                    {(() => {
                                      const yesTotal = bet.yes_bets?.reduce((acc, bet) => acc + bet.amount, 0) || 0;
                                      const noTotal = bet.no_bets.reduce((acc, bet) => acc + bet.amount, 0);
                                      const total = yesTotal + noTotal;
                                      const percentage = total > 0 ? (noTotal / total) * 100 : 0;
                                      const decimalOdds = percentage > 0 ? (100 / percentage).toFixed(2) : "∞";
                                      return `${decimalOdds}x`;
                                    })()})
                                  </Chip>
                                  <Chip
                                    color={
                                      bet.status !== "open"
                                        ? bet.outcome === bet.choice
                                          ? "success"
                                          : "danger"
                                        : "primary"
                                    }
                                    variant="flat"
                                    size="sm"
                                  >
                                    {bet.status === "resolved"
                                      ? bet.outcome === bet.choice
                                        ? "Won"
                                        : "Lost"
                                      : bet.status == "awaiting_confirmation"
                                        ? "Awaiting"
                                        : bet.status}
                                  </Chip>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Show More */}
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

            {/* Predictions */}
            {activeTab === "predictions" && (
              <section className="rounded-lg overflow-x-auto mb-8">
                <div className="flex items-center relative mb-4">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none">
                    {/* Search Icon */}
                    <svg
                      aria-hidden="true"
                      className="w-5 h-5 text-gray-700"
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
                    value={searchTerm}
                    onChange={handlePredictionSearch}
                    placeholder="Search predictions..."
                    className="w-full p-2 pl-9 rounded-md text-gray-700 focus:outline-none text-small input-search bg-gray-800 placeholder-gray-700"
                  />
                </div>

                {isLoadingPredictions && predictions.length === 0 && (
                  <div className="flex justify-center items-center py-8">
                    <Spinner size="lg" />
                  </div>
                )}
                {displayedPredictions.length === 0 && !isLoadingPredictions && (
                  <div className="text-center text-gray-500 py-8">
                    No predictions found
                  </div>
                )}

                {displayedPredictions.length > 0 && (
                  <section className="rounded-lg overflow-x-auto mb-8">
                    <table className="w-full text-sm text-left">
                      <tbody>
                        {displayedPredictions.map((prediction, index) => (
                          <tr
                            key={index}
                            className="cursor-pointer backbutton"
                            onClick={() => router.push(`/predictions/${prediction.id}`)}
                          >
                            <td colSpan={5} className="p-2 backbutton cursor-pointer mb-4">
                              <div className="flex flex-row gap-4 items-start">
                                {prediction.str_thumb ? (
                                  <Image
                                    src={prediction.str_thumb}
                                    alt={prediction.description}
                                    width={40}
                                    height={40}
                                    className="w-[40px] h-[40px] min-w-[40px] min-h-[40px] rounded-full"
                                  />
                                ) : (
                                  <div className="w-[40px] h-[40px] min-w-[40px] min-h-[40px] rounded-full bg-gray-700"></div>
                                )}
                                <div className="flex flex-col w-full md:flex-row gap-2 items-start">
                                  <p className="break-words text-base w-full">
                                    {prediction.description}
                                  </p>
                                  <div className="flex flex-row gap-2 items-start sm:items-start">
                                    {/* <span className="text-default-400">
                                  {prediction.resolution_date
                                    ? format(new Date(prediction.resolution_date), "MM/dd/yy")
                                    : ""}
                                </span> */}
                                    <span className="icon-user text-primary">
                                      {prediction.bets_count}
                                    </span>
                                    <Chip
                                      color="primary"
                                      variant="flat"
                                      size="sm"
                                    >
                                      Yes: {prediction.yes_total_amount} ({(() => {
                                        const total = Number(prediction.yes_total_amount) + Number(prediction.no_total_amount);
                                        const percentage = total > 0 ? (Number(prediction.yes_total_amount) / total) * 100 : 0;
                                        const decimalOdds = percentage > 0 ? (100 / percentage).toFixed(2) : "∞";
                                        return `${decimalOdds}x`;
                                      })()})
                                    </Chip>
                                    <Chip
                                      color="secondary"
                                      variant="flat"
                                      size="sm"
                                    >
                                      No: {prediction.no_total_amount} ({(() => {
                                        const total = Number(prediction.yes_total_amount) + Number(prediction.no_total_amount);
                                        const percentage = total > 0 ? (Number(prediction.no_total_amount) / total) * 100 : 0;
                                        const decimalOdds = percentage > 0 ? (100 / percentage).toFixed(2) : "∞";
                                        return `${decimalOdds}x`;
                                      })()})
                                    </Chip>
                                    <Chip
                                      color={
                                        prediction.status === "open"
                                          ? "primary"
                                          : "secondary"
                                      }
                                      variant="flat"
                                      size="sm"
                                    >
                                      {prediction.status === "resolved"
                                        ? prediction.outcome === prediction.creator_choice
                                          ? "Win"
                                          : "Loss"
                                        : prediction.status === "open"
                                          ? "Open"
                                          : "Awaiting"}
                                    </Chip>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
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