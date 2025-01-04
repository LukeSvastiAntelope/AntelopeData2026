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
import { format } from 'date-fns';
import { IAgentProfile } from "@/app/utils/interface";

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
      className={`rounded-lg subtlebackground shadow-md p-4 flex items-center gap-2 ${className}`}
    >
      <div className="text-primary text-lg">{icon}</div>
      <div className="flex flex-row gap-1">
        <p className="text-default-500 text-small">{title}</p>
        <p className="text-small font-regular">{value}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<"bets" | "predictions">("bets");
  const [searchTerm, setSearchTerm] = useState('');
  const [searchPredictions, setSearchPredictions] = useState('');
  const [agentBalance, setAgentBalance] = useState(0);

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
          setPagePredictions(prev => prev + 1);
        }
      },
      { threshold: 0.1 }
    );

    const sentinel = document.getElementById("sentinel");
    if (sentinel) observer.observe(sentinel);

    // Load more predictions when page changes
    loadMorePredictions();

    return () => observer.disconnect();
  }, [activeTab, predictions, pagePredictions, searchPredictions]);

  // Reset pagination when search term changes
  useEffect(() => {
    if (activeTab === "predictions") {
      setPagePredictions(1);
      const filteredPredictions = filterPredictions(predictions, searchPredictions);
      setDisplayedPredictions(filteredPredictions.slice(0, ITEMS_PER_PAGE_PREDICTIONS));
      setHasMorePredictions(filteredPredictions.length > ITEMS_PER_PAGE_PREDICTIONS);
    }
  }, [searchPredictions, activeTab]);

  // Lazy-fetch predictions
  useEffect(() => {
    if (activeTab === "predictions" && predictions.length === 0) {
      fetchPredictions();
      console.log("fetching predictions");
    }
  }, [activeTab]);

  // Fetch Agent to show their image
  useEffect(() => {
    const fetchAgentProfile = async () => {
      try {
        const response = await fetch.get("/api/getAgentProfile");
        if (response.status) {
          setAgent(response.agent);
          setAgentBalance(response.agent.wallet_balance ?? 0);
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

  return (
    <div className="flex text-white max-w-[1200px]">
      {/* Sidebar */}
      <aside className="md:w-64 md:flex-col md:left-auto left-0 fixed top-0 text-sm w-full">
        <nav className="flex flex-row md:flex-col gap-4 text-normal justify-evenly py-8 px-4 ">
          <div className="flex flex-row md:flex-col justify-evenly w-full md:gap-4">
            <div className="flex md:inline-block items-center ">
              {/* Large logo for md+ screens */}
              <span className="hidden md:inline-block ">
                <Image
                  src={"/assets/images/logo-text.svg"}
                  alt="Dashboard Logo"
                  width={160}
                  height={40}
                  className="mr-2 w-100"
                />
              </span>
            </div>

            {/* Profile Photo */}
            <Link href="/profile" className="md:flex items-center p-2 border border-white/10 profile-border hidden gap-2 mb-2  ">
              <Image
                src={agent?.image || "/assets/images/logo-simple.svg"}
                alt="Profile"
                width={32}
                height={32}
                className="rounded-full bg-gray-700 sm-hidden"
              />
              {/* Credits */}
              <div className="flex flex-col">
                <span className="text-sm font-semibold font-kodemono w-full"> {agent?.name || 'Agent Name'} </span>
                <span className="text-gradient">{agentBalance?.toLocaleString() || 0}</span>
              </div>

            </Link>
            <Link href="/" className="flex items-center text-white font-kodemono md:gap-2">
              <span className="icon-dashboard-active md:gap-2" /> <span className="hidden md:inline-block">Overview</span>
            </Link>

            <Link
              href="/markets"
              className="flex items-center group md:gap-2"
            >
              {/* default icon */}
              <span className="icon-markets block group-hover:hidden " />
              {/* hover icon */}
              <span className="icon-markets-active  hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono"><span className="hidden md:inline-block">Markets</span></span>
            </Link>

            <Link href="/strategy" className="flex items-center group  text-default-400 md:gap-2">
              {/* default icon */}
              <span className="icon-strategy block group-hover:hidden" />
              {/* hover icon */}
              <span className="icon-strategy-active hidden sm:enlarge-icon group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono"><span className="hidden md:inline-block">Strategy</span></span>
            </Link>
          </div>

          <div className="md:hidden min-w-40px min-h-40px max-w-40px max-h-40px center-logo">
          </div>

          <div className="flex flex-row md:flex-col justify-evenly w-full md:gap-4 ">
            <Link href="/about" className="flex items-center text-default-400 group md:gap-2">
              {/* default icon */}
              <span className="icon-about  block group-hover:hidden" />
              {/* hover icon */}
              <span className="icon-about-active  hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono"><span className="hidden md:inline-block">About</span></span>
            </Link>
            <Link href="https://discord.gg/dSEV8YCDQ2" className="flex items-center md:gap-2  text-default-400 group">
              {/* default icon */}
              <span className="icon-support block group-hover:hidden" />
              {/* hover icon */}
              <span className="icon-support-active  hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono"><span className="hidden md:inline-block">Community</span></span>
            </Link>
            <Link href="/logout" className="flex items-center text-default-400 group md:gap-2">
              {/* default icon */}
              <span className="icon-logout block group-hover:hidden" />
              {/* hover icon */}
              <span className="icon-logout-active  hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono"><span className="hidden md:inline-block">Log out</span></span>
            </Link>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-0 md:ml-64 container mt-14 md:mt-0 mx-auto px-4 py-6 md:px-8 md:py-8 min-w-full md:min-w-[800px] max-w-full md:max-w-[800px]">
        {/* Top bar with toggles */}

        <div className="flex flex-row justify-between h-32">

          <div className="pr-8 pt-2">
            <h1 className="font-bold mb-2 font-kodemono ">
              Overview
            </h1>
            <p className="text-gray-500 h1paragraph">
              See how your bets and predictions are performing. Get a quick overview of your success rate, bet size, and more.
            </p>
          </div>

          <div className="home hidden md:inline-block"></div>
        </div>


        {predictions && predictions.length > 0 && (
          <div className="grid gap-6 md:grid-cols-4 mb-6">

            <StatCard
              icon={<FaRocket />}
              title="Bets"

              value={predictions
                .reduce((acc, curr) => acc + curr.bets_count, 0)
                .toString()}
              className="backbutton"
            />

            <StatCard
              icon={<FaDatabase />}
              title="Predictions"
              value={predictions.length.toString()}
              className="backbutton"
            />

            <StatCard
              icon={<FaChartLine />}
              title="Success"
              value={(
                (predictions.filter((p) => p.outcome === p.creator_choice).length /
                  (predictions.length || 1)) *
                100
              ).toFixed(2).concat("%")}
              className="backbutton"
            />

            <StatCard
              icon={<FaShieldAlt />}
              title="Bet Size"
              value={`${agent?.maxBetSize || 0}`}
              className="backbutton"
            />

          </div>
        )}

        <div className="flex gap-2 font-kodemono text-small">
          <button
            onClick={() => setActiveTab("bets")}
            className={`px-0 py-2 hover:text-white ${activeTab === "bets" ? "text-white" : "text-gray-500"
              }`}
          >
            Bets
          </button>
          <button
            onClick={() => setActiveTab("predictions")}
            className={`px-1 py-2 hover:text-white ${activeTab === "predictions" ? "text-white" : "text-gray-500"
              }`}
          >
            Predictions
          </button>
        </div>

        {/* Search Field for Bets */}
        {activeTab === "bets" && (
          <div className="my-4 relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none">
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
              className="w-full p-2 pl-9 rounded-md text-gray-700 focus:outline-none text-small input-search bg-gray-800 placeholder-gray-700"
            />
          </div>
        )}

        {/* Search Field for Predictions */}
        {activeTab === "predictions" && (
          <div className="my-4 relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none">
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
              value={searchPredictions}
              onChange={handlePredictionSearch}
              placeholder="Search predictions..."
              className="w-full p-2 pl-9 rounded-md text-gray-700 focus:outline-none text-small input-search bg-gray-800 placeholder-gray-700"
            />
          </div>
        )}

        {/* BETS SECTION */}
        {activeTab === "bets" && (
          <section className="rounded-lg overflow-x-auto mb-8">
            {isLoadingBets && bets.length === 0 && (
              <div className="flex justify-center items-center py-8">
                <Spinner size="lg" />
              </div>
            )}

            {!isLoadingBets && (
              (!agent || !agent.interests || agent.interests.length === 0) ? (
                <div className="flex items-center justify-center text-center text-gray-500 w-full h-[500px] border border-gray-500 p-4 rounded-lg">
                  <div className="flex flex-col items-center">
                    <div className="map-center items-center "></div>
                    <p className="text-gray-500 py-4 w-80">
                      You haven’t created your AI agents strategy yet. Before it can bet create the strategy and choose your area of interest.
                    </p>
                    <Button onPress={() => router.push("/editProfile")} color="primary" variant="flat" className="min-w-[200px] h-[40px] text-white background-gradient-red">
                      Create Strategy
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {bets.length === 0 && (
                    <div className="text-center text-gray-500 py-8">No bets found</div>
                  )}
                </>
              )
            )}

            {/* Table Header */}
            {bets.length > 0 && (
              <table className="w-full text-sm text-left">
                <tbody>
                  {filterBets(bets, searchTerm).map((bet, index) => (
                    <tr
                      key={index}
                      className="cursor-pointer backbutton"
                      onClick={() => router.push(`/bets/${bet.bet_id}`)}
                    >
                      <td colSpan={4} className="p-2 cursor-pointer backbutton">
                        <div className="flex flex-row gap-4 items-start">
                          {/* Thumbnail */}
                          {bet.str_thumb && (
                            <Image
                              src={bet.str_thumb}
                              alt={bet.description}
                              width={40}
                              height={40}
                              className="w-[40px] h-[40px] rounded-full max-w-[40px] max-h-[40px] min-w-[40px] min-h-[40px]"
                            />
                          )}

                          {/* Text block */}
                          <div className="flex flex-col md:flex-row gap-2 items-start w-full">
                            {/* Description on its own line */}
                            <p className="break-words w-full">
                              {bet.description}
                            </p>

                            {/* A second line for date and chip, side by side at md */}
                            <div className="flex flex-row md:flex-row gap-2 items-start sm:items-start">
                              <span className="text-default-400">
                                {bet.resolution_date
                                  ? format(new Date(bet.resolution_date), "MM/dd/yy")
                                  : ""}
                              </span>
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
                                {bet.status !== "open"
                                  ? bet.outcome === bet.choice
                                    ? "Won"
                                    : "Lost"
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

            {/* Show More Button */}
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

        {/* PREDICTIONS SECTION */}
        {activeTab === "predictions" && (
          <section className="rounded-lg overflow-x-auto mb-8">
            {isLoadingPredictions && predictions.length === 0 && (
              <div className="flex justify-center items-center py-8">
                <Spinner size="lg" />
              </div>
            )}

            {!isLoadingPredictions && (
              (!agent || !agent.interests || agent.interests.length === 0) ? (
                <div className="flex items-center justify-center text-center text-gray-500 w-full h-[500px] border border-gray-500 p-4 rounded-lg">
                  <div className="flex flex-col items-center">
                    <div className="map-center items-center "></div>
                    <p className="text-gray-500 py-4 w-80">
                      You haven’t created your AI agents strategy yet. Before it can bet create the strategy and choose your area of interest.
                    </p>
                    <Button onPress={() => router.push("/editProfile")} color="primary" variant="flat" className="min-w-[200px] h-[40px] text-white background-gradient-red">
                      Create Strategy
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {predictions.length === 0 && (
                    <div className="text-center text-gray-500 py-8">No predictions found</div>
                  )}
                </>
              )
            )}

            {/* Predictions Table */}
            {displayedPredictions.length > 0 && (
              <section className="rounded-lg overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <tbody>
                    {displayedPredictions.map((prediction, index) => (
                      <tr
                        key={index}
                        className="cursor-pointer backbutton"
                        onClick={() => router.push(`/predictions/${prediction.id}`)}
                      >
                        <td colSpan={5} className="p-2">
                          <div className="flex flex-row gap-4 items-start w-full">
                            {/* Thumbnail */}
                            {prediction.str_thumb && (
                              <Image
                                src={prediction.str_thumb}
                                alt={prediction.description}
                                width={40}
                                height={40}
                                className="w-[40px] h-[40px] min-w-[40px] min-h-[40px] rounded-full"
                              />
                            )}

                            {/* Text + details */}
                            <div className="flex flex-col w-full md:flex-row gap-2 items-start">
                              {/* Description on its own line */}
                              <p className="break-words w-full">
                                {prediction.description}
                              </p>

                              {/* Date, bet count, and Chip row */}
                              <div className="flex flex-row gap-2 items-start sm:items-start">
                                <span className="text-default-400">
                                  {prediction.resolution_date
                                    ? format(new Date(prediction.resolution_date), "MM/dd/yy")
                                    : ""}
                                </span>
                                <span className="text-default-400">
                                  {prediction.bets_count}
                                </span>
                                <Chip
                                  color={
                                    prediction.status === "open"
                                      ? "primary"
                                      : "secondary"
                                  }
                                  variant="flat"
                                  size="sm"
                                >
                                  {prediction.status === "open"
                                    ? "Open"
                                    : prediction.outcome === prediction.creator_choice
                                      ? "Win"
                                      : "Loss"}
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

            {/* Sentinel */}
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
      </main>
    </div>
  );
} 