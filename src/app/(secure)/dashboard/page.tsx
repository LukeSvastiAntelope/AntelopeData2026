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
}

const ITEMS_PER_PAGE_BETS = 10;
const ITEMS_PER_PAGE_PREDICTIONS = 15;

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
      const newPage = pagePredictions + 1;
      const nextItems = filteredPredictions.slice(0, newPage * ITEMS_PER_PAGE_PREDICTIONS);
      setDisplayedPredictions(nextItems);
      setHasMorePredictions(nextItems.length < filteredPredictions.length);
      setPagePredictions(newPage);
    };

    // Reset pagination when search term changes
    setPagePredictions(1);
    const filteredPredictions = filterPredictions(predictions, searchPredictions);
    setDisplayedPredictions(filteredPredictions.slice(0, ITEMS_PER_PAGE_PREDICTIONS));
    setHasMorePredictions(filteredPredictions.length > ITEMS_PER_PAGE_PREDICTIONS);

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMorePredictions) {
          // Use requestAnimationFrame to avoid running outside the main thread
          requestAnimationFrame(() => {
            loadMorePredictions();
          });
        }
      },
      { threshold: 0.5 }
    );

    const sentinel = document.getElementById("sentinel");
    if (sentinel) observer.observe(sentinel);

    return () => observer.disconnect();
  }, [activeTab, hasMorePredictions, predictions, pagePredictions, searchPredictions]);

  // On first mount
  useEffect(() => {
    fetchBets(1);
  }, []);

  // Lazy-fetch predictions
  useEffect(() => {
    if (activeTab === "predictions" && predictions.length === 0) {
      fetchPredictions();
    }
  }, [activeTab]);

  const handleBetSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handlePredictionSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchPredictions(e.target.value);
  };

  return (
    <div className="flex text-white">
      {/* Sidebar */}
      <aside className="w-64 fixed top-0 text-sm">
        <nav className="flex min-h-screen flex-col gap-4 text-normal justify-between py-8 px-4 ">
          <div>
            <div className="flex items-center mb-4">
              {/* Logo (image) */}
              <Image
                src={"/assets/images/logo-text.svg"}
                alt="Dashboard Logo"
                width={160}
                height={40}
                className="mr-2 rounded-full w-100"
              />
              {/* <span className="text-xl font-bold">ANTELOPE</span> */}
            </div>
            {/* Profile Photo */}
            <Link href="/payment" className="flex items-center gap-2 mb-4">
              <Image
                src={agent?.image || "/assets/images/logo-simple.svg"}
                alt="Profile"
                width={24}
                height={24}
                className="rounded-full bg-gray-700 mr-2 "
              />
              {/* Credits */}
              <span className="text-sm font-semibold icon-credits px-5 font-kodemono">
                <span className="text-gradient">83940</span>
              </span>

            </Link>
            <Link href="/" className="flex items-center gap-2 mb-4 text-white font-kodemono">
              <span className="icon-dashboard mr-2" /> Dashboard
            </Link>
            <Link
              href="/markets"
              className="flex items-center gap-2 mb-4 group"
            >
              {/* default icon */}
              <span className="icon-markets mr-2 block group-hover:hidden " />
              {/* hover icon */}
              <span className="icon-markets-active mr-2 hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono">Markets</span>
            </Link>

            <Link href="/strategy" className="flex items-center gap-2 mb-4 group text-default-400">
              {/* default icon */}
              <span className="icon-strategy mr-2 block group-hover:hidden" />
              {/* hover icon */}
              <span className="icon-strategy-active mr-2 hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono">Strategy</span>
            </Link>
          </div>
          <div>
            <Link href="/about" className="flex items-center gap-2 mb-4 text-default-400 group">
              {/* default icon */}
              <span className="icon-about mr-2 block group-hover:hidden" />
              {/* hover icon */}
              <span className="icon-about-active mr-2 hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono">About</span>
            </Link>
            <Link href="https://discord.gg/dSEV8YCDQ2" className="flex items-center gap-2 mb-4 text-default-400 group">
              {/* default icon */}
              <span className="icon-support mr-2 block group-hover:hidden" />
              {/* hover icon */}
              <span className="icon-support-active mr-2 hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono">Community</span>
            </Link>
            <Link href="/signout" className="flex items-center gap-2 mb-4 text-default-400 group">
              {/* default icon */}
              <span className="icon-logout mr-2 block group-hover:hidden" />
              {/* hover icon */}
              <span className="icon-logout-active mr-2 hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono">Sign out</span>
            </Link>
          </div>
        </nav>
      </aside>

      {/* Main Content */}


      <main className="flex-1 ml-64 container mx-auto px-4 py-6 md:px-8 md:py-8">
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
        {activeTab == "bets" && (
          <div className="my-4">
            <input
              type="text"
              value={searchTerm}
              onChange={handleBetSearch}
              placeholder="Search bets..."
              className="w-full p-2 rounded-md focus:outline-none text-small active:outline-none input-search"
            />
          </div>
        )}

        {/* Search Field for Predictions */}
        {activeTab == "predictions" && (
          <div className="my-4">
            <input
              type="text"
              value={searchPredictions}
              onChange={handlePredictionSearch}
              placeholder="Search predictions..."
              className="w-full p-2 rounded-md focus:outline-none text-small active:outline-none input-search"
            />
          </div>
        )}

        {/* BETS SECTION */}
        {activeTab === "bets" && (
          <section className="rounded-lg min-w-[780px]">


            {isLoadingBets && bets.length === 0 && (
              <div className="flex justify-center items-center py-8">
                <Spinner size="lg" />
              </div>
            )}

            {!isLoadingBets && bets.length === 0 && (
              <div className="text-center text-gray-500 py-8">No bets found</div>
            )}

            {/* Table Header */}
            {bets.length > 0 && (
              <table className="w-full text-sm text-left">
                <tbody>
                  {filterBets(bets, searchTerm).map((bet, index) => (
                    <tr
                      key={index}
                      className=""
                    >
                      {/* Image */}
                      <td className="py-2 px-0">
                        {bet.str_thumb && (
                          <Image
                            src={bet.str_thumb}
                            alt={bet.description}
                            width={40}
                            height={40}
                            className="rounded-md"
                          />
                        )}
                      </td>
                      {/* Description */}
                      <td className="py-2 px-4 break-words max-w-xs">
                        {bet.description}
                      </td>
                      {/* Source */}
                      <td className="py-2 px-4">{bet.source}</td>
                      {/* Stake */}
                      {/* <td className="py-2 px-4">{bet.amount}</td> */}
                      {/* Status */}
                      <td className="py-2 px-4">
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
                      {/* Date (created_at or resolution_date depending on status) */}
                      <td className="py-2 px-4">
                        {bet.status === "open"
                          ? formatDate(bet.created_at)
                          : formatDate(bet.resolution_date)}
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
              <div className="text-center text-gray-500 py-4">No more bets to load</div>
            )}
          </section>
        )}

        {/* PREDICTIONS SECTION */}
        {activeTab === "predictions" && (
          <section className="rounded-lg min-w-[780px]">
            {/* <h1 className="text-xl font-bold mb-6">Active Predictions</h1> */}

            {isLoadingPredictions && predictions.length === 0 && (
              <div className="flex justify-center items-center py-8">
                <Spinner size="lg" />
              </div>
            )}
            {!isLoadingPredictions && predictions.length === 0 && (
              <div className="text-center text-gray-500 py-8 container">No predictions found</div>
            )}

            {/* Stats Row */}
            {predictions.length > 0 && (
              <div className="grid gap-6 md:grid-cols-3 mb-6">
                <Card className=" text-white bg-content0">
                  <CardHeader className="text-sm font-medium">Total Active Predictions</CardHeader>
                  <CardBody>
                    <p className="text-2xl font-bold">
                      {predictions.filter((p) => p.status === "open").length}
                    </p>
                  </CardBody>
                </Card>
                <Card className=" text-white bg-content0">
                  <CardHeader className="text-sm font-medium">Total Bets Placed</CardHeader>
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

            {/* Predictions Table */}
            {displayedPredictions.length > 0 && (
              <section className="rounded-lg p-4 overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="text-left text-white">
                      <th className="py-2 px-0">Image</th>
                      <th className="py-2 px-4">Description</th>
                      <th className="py-2 px-4">Source</th>

                      <th className="py-2 px-4">Resolves</th>
                      <th className="py-2 px-4">Bets</th>
                      <th className="py-2 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedPredictions.map((prediction, index) => (
                      <tr
                        key={index}
                        className="cursor-pointer hover:bg-gray-600 "
                        onClick={() => router.push(`/predictions/${prediction.id}`)}
                      >
                        <td className="py-2 px-0">
                          {prediction.str_thumb && (
                            <Image
                              src={prediction.str_thumb}
                              alt={prediction.description}
                              width={40}
                              height={40}
                              className="rounded-md"
                            />
                          )}
                        </td>
                        <td className="py-2 px-4 break-words max-w-xs">{prediction.description}</td>
                        <td className="py-2 px-4">{prediction.source}</td>
                        {/* <td className="py-2 px-4">
                          {prediction.predicted_outcome || prediction.creator_choice}
                        </td>
                        <td className="py-2 px-4">{prediction.bet_amount}</td> */}
                        <td className="py-2 px-4">{formatDate(prediction.resolution_date)}</td>
                        <td className="py-2 px-4">{prediction.bets_count}</td>
                        <td className="py-2 px-4">
                          <Chip
                            color={prediction.status === "open" ? "primary" : "secondary"}
                            variant="flat"
                            size="sm"
                          >
                            {prediction.status === "open"
                              ? "Open"
                              : prediction.outcome === prediction.creator_choice
                                ? "Win"
                                : "Loss"}
                          </Chip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Sentinel */}
            <div id="sentinel" className="flex justify-center p-4">
              {hasMorePredictions && displayedPredictions.length > 0 && <Spinner size="sm" />}
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