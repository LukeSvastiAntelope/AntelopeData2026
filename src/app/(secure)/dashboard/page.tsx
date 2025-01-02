'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { Card, CardBody, CardHeader } from "@nextui-org/card";
import { Spinner } from "@nextui-org/spinner";
import { Chip } from "@nextui-org/chip";
import { Button } from "@nextui-org/button";
import { Image } from "@nextui-org/image";

import { useFetch } from "@/app/utils/lib";

interface IAgentProfile {
  image?: string;
  name?: string;
  // add any other fields you need from /api/getAgentProfile
}

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

// Simple fallback date formatter
const formatDate = (dateStr: string): string => {
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch (err) {
    console.log(err);
    return dateStr;
  }
};

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

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<"bets" | "predictions">("bets");
  const [searchTerm, setSearchTerm] = useState('');
  const [searchPredictions, setSearchPredictions] = useState('');
  const [agentBalance, setAgentBalance] = useState(0);

  // Agent
  const [agent, setAgent] = useState<IAgentProfile | null>(null);

  // Bets state
  const [bets, setBets] = useState<IBet[]>([]);
  const [isLoadingBets, setIsLoadingBets] = useState<boolean>(false);
  const [pageBets, setPageBets] = useState<number>(1);
  const [hasMoreBets, setHasMoreBets] = useState<boolean>(true);

  // Predictions state
  const [predictions, setPredictions] = useState<IPrediction[]>([]);
  const [isLoadingPredictions, setIsLoadingPredictions] = useState<boolean>(false);
  const [displayedPredictions, setDisplayedPredictions] = useState<IPrediction[]>([]);
  const [pagePredictions, setPagePredictions] = useState<number>(1);
  const [hasMorePredictions, setHasMorePredictions] = useState<boolean>(true);

  const fetch = useFetch();
  const router = useRouter();

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
    };
    fetchAgentProfile();
  }, []);

  // Fetch Bets
  const fetchBets = async (pageNumber: number) => {
    if (isLoadingBets) return;
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
    if (isLoadingPredictions) return;
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

  // On first mount
  useEffect(() => {
    fetchBets(1);
    fetchPredictions();
    console.log("fetching bets");
  }, []);

  // Lazy-fetch predictions
  useEffect(() => {
    if (activeTab === "predictions" && predictions.length === 0) {
      fetchPredictions();
      console.log("fetching predictions");
    }
  }, [activeTab]);

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
          <div className="flex flex-row md:flex-col justify-evenly w-full">
            <div className="flex items-center mb-4">
              {/* Large logo for md+ screens */}
              <span className="hidden md:inline-block">
                <Image
                  src={"/assets/images/logo-text.svg"}
                  alt="Dashboard Logo"
                  width={160}
                  height={40}
                  className="mr-2 w-100"
                />
              </span>

              {/* Smaller logo for mobile screens */}

            </div>
            {/* Profile Photo */}
            <Link href="/profile" className="md:flex items-center gap-2 mb-4 hidden p-2 border border-white/10 rounded-lg backbutton">
              <Image
                src={agent?.image || "/assets/images/logo-simple.svg"}
                alt="Profile"
                width={32}
                height={32}
                className="rounded-full bg-gray-700 mr-2 sm-hidden"
              />
              {/* Credits */}
              <div className="flex flex-col">
              <span className="text-sm font-semibold font-kodemono w-full"> {agent?.name || 'Agent Name'} </span>
              <span className="text-gradient">{agentBalance?.toLocaleString() || 0}</span>
              </div>

            </Link>
            <Link href="/" className="flex items-center gap-2 mb-4 text-white font-kodemono">
              <span className="icon-dashboard-active mr-2" /> <span className="hidden md:inline-block">Dashboard</span>
            </Link>
            <Link
              href="/markets"
              className="flex items-center gap-2 mb-4 group"
            >
              {/* default icon */}
              <span className="icon-markets mr-2 block group-hover:hidden " />
              {/* hover icon */}
              <span className="icon-markets-active mr-2 hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono"><span className="hidden md:inline-block">Markets</span></span>
            </Link>

            <Link href="/strategy" className="flex items-center gap-2 mb-4 group text-default-400">
              {/* default icon */}
              <span className="icon-strategy mr-2 block group-hover:hidden" />
              {/* hover icon */}
              <span className="icon-strategy-active mr-2 hidden sm:enlarge-icon group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono"><span className="hidden md:inline-block">Strategy</span></span>
            </Link>
          </div>

          <div className="md:hidden min-w-40px min-h-40px max-w-40px max-h-40px center-logo">
          </div>

          <div className="flex flex-row md:flex-col justify-evenly w-full">
            <Link href="/about" className="flex items-center gap-2 mb-4 text-default-400 group">
              {/* default icon */}
              <span className="icon-about mr-2 block group-hover:hidden" />
              {/* hover icon */}
              <span className="icon-about-active mr-2 hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono"><span className="hidden md:inline-block">About</span></span>
            </Link>
            <Link href="https://discord.gg/dSEV8YCDQ2" className="flex items-center gap-2 mb-4 text-default-400 group">
              {/* default icon */}
              <span className="icon-support mr-2 block group-hover:hidden" />
              {/* hover icon */}
              <span className="icon-support-active mr-2 hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono"><span className="hidden md:inline-block">Community</span></span>
            </Link>
            <Link href="/logout" className="flex items-center gap-2 mb-4 text-default-400 group">
              {/* default icon */}
              <span className="icon-logout mr-2 block group-hover:hidden" />
              {/* hover icon */}
              <span className="icon-logout-active mr-2 hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono"><span className="hidden md:inline-block">Log out</span></span>
            </Link>
          </div>
        </nav>
      </aside>

      {/* Main Content */}


      <main className="flex-1 ml-0 md:ml-64 container mt-14 md:mt-0  mx-auto px-4 py-6 md:px-8 md:py-8 min-w-full md:min-w-[800px] max-w-full md:max-w-[800px]">
        {/* Top bar with toggles */}


        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("bets")}
            className={`px-0 py-2 hover:text-white ${activeTab === "bets" ? "text-white" : "text-gray-700"
              }`}
          >
            Bets
          </button>
          <button
            onClick={() => setActiveTab("predictions")}
            className={`px-1 py-2 hover:text-white ${activeTab === "predictions" ? "text-white" : "text-gray-700"
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
            {!isLoadingBets && bets.length === 0 && (
              <div className="text-center text-gray-500 py-8">No bets found</div>
            )}

            {bets.length > 0 && (
              <div className="grid gap-6 md:grid-cols-3 mb-6">
                <Card className="text-white bg-content0">
                  <CardHeader className="text-sm font-medium">
                    Active Predictions
                  </CardHeader>
                  <CardBody>
                    <p className="text-2xl font-bold">
                      {predictions.filter((p) => p.status === "open").length}
                    </p>
                  </CardBody>
                </Card>
                <Card className="text-white bg-content0">
                  <CardHeader className="text-sm font-medium">
                    Bets Placed
                  </CardHeader>
                  <CardBody>
                    <p className="text-2xl font-bold">
                      {predictions.reduce((acc, curr) => acc + curr.bets_count, 0)}
                    </p>
                  </CardBody>
                </Card>
                <Card className="text-white bg-content0">
                  <CardHeader className="text-sm font-medium">
                    Win Rate
                  </CardHeader>
                  <CardBody>
                    <p className="text-2xl font-bold">
                      {(
                        (predictions.filter((p) => p.outcome === p.creator_choice).length /
                        predictions.length) *
                        100
                      ).toFixed(2)}
                      %
                    </p>
                  </CardBody>
                </Card>
              </div>
            )}

            {/* Table Header */}
            {bets.length > 0 && (
              <table className="w-full text-sm text-left">
                <tbody>
                  {filterBets(bets, searchTerm).map((bet, index) => (
                    <tr
                      key={index}
                      className=""
                      onClick={() => router.push(`/bets/${bet.bet_id}`)}
                    >
                      <div className="cursor-pointer backbutton py-2">
                      {/* Image */}
                      <td className=" px-4">
                        {bet.str_thumb && (
                          <Image
                            src={bet.str_thumb}
                            alt={bet.description}
                            width={40}
                            height={40}
                            className="w-[40px] h-[40px] min-w-[40px] min-h-[40px] rounded-full" // Remove/replace m-w-[40px]
                          />
                        )}
                      </td>
                      {/* Description */}
                      <td className=" px-2 break-words w-full">
                        {bet.description}
                      </td>
                      <td className=" px-4">
                        {bet.status === "open"
                          ? formatDate(bet.created_at)
                          : formatDate(bet.resolution_date)}
                      </td>
                      <td className=" px-4">
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
                      </td>
                      </div>
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
            {!isLoadingPredictions && predictions.length === 0 && (
              <div className="text-center text-gray-500 py-8 container">
                No predictions found
              </div>
            )}

            {/* Stats Row (original) */}
            {predictions.length > 0 && (
              <div className="grid gap-6 md:grid-cols-3 mb-6">
                <Card className=" text-white bg-content0">
                  <CardHeader className="text-sm font-medium">
                    Total Active Predictions
                  </CardHeader>
                  <CardBody>
                    <p className="text-2xl font-bold">
                      {predictions.filter((p) => p.status === "open").length}
                    </p>
                  </CardBody>
                </Card>
                <Card className=" text-white bg-content0">
                  <CardHeader className="text-sm font-medium">
                    Total Bets Placed
                  </CardHeader>
                  <CardBody>
                    <p className="text-2xl font-bold">
                      {predictions.reduce((acc, curr) => acc + curr.bets_count, 0)}
                    </p>
                  </CardBody>
                </Card>
                <Card className=" text-white bg-content0">
                  <CardHeader className="text-sm font-medium">Win Rate</CardHeader>
                  <CardBody>
                    <p className="text-2xl font-bold">
                      {(
                        (predictions.filter(
                          (p) => p.outcome === p.creator_choice
                        ).length /
                          predictions.length) *
                        100
                      ).toFixed(2)}
                      %
                    </p>
                  </CardBody>
                </Card>
              </div>
            )}

            {/* Predictions Table */}
            {displayedPredictions.length > 0 && (
              <section className="rounded-lg overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <tbody>
                    {displayedPredictions.map((prediction, index) => (
                      <tr
                        key={index}
                        className=""
                        onClick={() => router.push(`/predictions/${prediction.id}`)}
                      >
                        <div className="cursor-pointer backbutton py-2">
                        <td className="py-2 px-0">
                          {prediction.str_thumb && (
                            <Image
                              src={prediction.str_thumb}
                              alt={prediction.description}
                              width={32}
                              height={32}
                              className="w-[32px] h-[32px] min-w-[32px] min-h-[32px] rounded-full"
                            />
                          )}
                        </td>
                        <td className="px-4 break-words w-full">
                          {prediction.description}
                        </td>
                        <td className="px-4">
                          {formatDate(prediction.resolution_date)}
                        </td>
                        <td className="px-4">{prediction.bets_count}</td>
                        <td className="px-4">
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
                              : prediction.outcome ===
                                prediction.creator_choice
                              ? "Win"
                              : "Loss"}
                          </Chip>
                        </td>
                        </div>
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