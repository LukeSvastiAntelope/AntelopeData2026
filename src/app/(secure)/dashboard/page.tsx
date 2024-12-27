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
    return dateStr;
  }
};

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<"bets" | "predictions">("bets");

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
      }, [fetch]);

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
      const newPage = pagePredictions + 1;
      const nextItems = predictions.slice(0, newPage * ITEMS_PER_PAGE_PREDICTIONS);
      setDisplayedPredictions(nextItems);
      setHasMorePredictions(nextItems.length < predictions.length);
      setPagePredictions(newPage);
    };

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
  }, [activeTab, hasMorePredictions, predictions, pagePredictions]);

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

  return (
    <div className="flex text-white">
      {/* Sidebar */}
      <aside className="w-64">
      <nav className="flex min-h-screen flex-col gap-4 justify-between p-4">
        
        
           <div>
           <div className="flex items-center mb-4">
          {/* Logo (image) */}
          <Image
            src={"/assets/images/logo-simple.svg"}
            alt="Dashboard Logo"
            width={40}
            height={40}
            className="mr-2 rounded-full"
          />
          <span className="text-xl font-bold">ANTELOPE</span>
        </div>
            {/* Profile Photo */}
            <Link href="/" className="flex items-center gap-2 mb-4 "> 
            <Image
                src={agent?.image || "/assets/images/logo-simple.svg"}
                alt="Profile"
                width={32}
                height={32}
                className="rounded-full bg-gray-700"
              />
            {/* Credits */}
            <span className="text-sm font-regular text-gradient icon-credits">83940</span>    

            </Link>
          <Link href="/" className="flex items-center gap-2 mb-4">
            <span className="icon-dashboard mr-2" /> Dashboard
          </Link>
          <Link href="/markets" className="flex items-center gap-2 mb-4">
            <span className="icon-markets mr-2" /> Markets
          </Link>
          <Link href="/strategy" className="flex items-center gap-2 mb-4">
            <span className="icon-strategy mr-2" /> Strategy
          </Link>
          </div>
          <div>
          <Link href="/about" className="flex items-center gap-2 mb-4">
            <span className="icon-about mr-2" /> About
          </Link>
          <Link href="/community" className="flex items-center gap-2 mb-4">
            <span className="icon-support mr-2" /> Community
          </Link>
          <Link href="/signout" className="flex items-center gap-2 mb-4">
            <span className="icon-logout mr-2" /> Sign out
          </Link>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8">
        {/* Top bar with toggles */}
        <div className="flex justify-between items-center mb-4">
         
         
        </div>

        <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("bets")}
              className={`px-1 py-2 ${
                activeTab === "bets" ? "text-white" : "text-gray-700"
              }`}
            >
              Bets
            </button>
            <button
              onClick={() => setActiveTab("predictions")}
              className={`px-1 py-2 ${
                activeTab === "predictions" ? "text-white" : "text-gray-700"
              }`}
            >
              Predictions
            </button>
          </div>

        {/* BETS SECTION */}
        {activeTab === "bets" && (
          <section className="px-0 py-3 rounded-lg">
            

            {isLoadingBets && bets.length === 0 && (
              <div className="flex justify-center items-center py-8">
                <Spinner size="lg" />
              </div>
            )}
            {!isLoadingBets && bets.length === 0 && (
              <div className="text-center text-gray-500 py-8">No bets found</div>
            )}

            {bets.map((bet, index) => {
              // short reason snippet
              const words = bet.reason?.split(" ") || [];
              const truncatedReason =
                words.length > 5 ? words.slice(0, 5).join(" ") + "..." : bet.reason;

              return (
                <Card key={index} className="mb-2 hover:bg-gray-600">
                  <CardBody className="p-2">
                    <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                      {/* Event Image */}
                      <div className="w-12 h-12 relative rounded-lg overflow-hidden flex-shrink-0">
                        {bet.str_thumb && (
                          <Image
                            src={bet.str_thumb}
                            alt="Event"
                            className="w-12 h-12"
                          />
                        )}
                      </div>
                      {/* Title / Reason */}
                      <div className="flex-grow min-w-0 max-w-[400px]">
                        <h3 className="text-sm font-regular">{bet.description}</h3>
                        <p className="text-xs text-gray-400 mt-1">
                          Reason: {truncatedReason}
                        </p>
                      </div>
                      {/* Choices & Stake */}
                      {/* <div className="flex flex-row md:flex-col gap-1 min-w-[80px]">
                        <span className="text-xs">
                          <span className="text-gray-500">Creator:</span>{" "}
                          {bet.predicted_outcome || bet.creator_choice}
                        </span>
                        <span className="text-xs">
                          <span className="text-gray-500">You:</span> {bet.choice}
                        </span>
                        <span className="text-xs text-gray-500">{bet.amount} credits</span>
                      </div> */}
                      {/* Source */}
                      <div className="min-w-[80px]">
                        <Chip size="sm" variant="flat" color="default" className="text-xs">
                          {bet.source}
                        </Chip>
                      </div>
                      {/* Status */}
                      <div className="min-w-[70px]">
                        <Chip
                          size="sm"
                          color={
                            bet.status !== "open"
                              ? bet.outcome === bet.choice
                                ? "success"
                                : "danger"
                              : "primary"
                          }
                          variant="flat"
                        >
                          {bet.status !== "open"
                            ? bet.outcome === bet.choice
                              ? "Won"
                              : "Lost"
                            : bet.status}
                        </Chip>
                      </div>
                      {/* Date */}
                      <div className="min-w-[90px] text-right">
                        <span className="text-xs text-gray-400">
                          {bet.status === "open"
                            ? formatDate(bet.created_at)
                            : formatDate(bet.resolution_date)}
                        </span>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              );
            })}

            {/* Show More Button */}
            {hasMoreBets && !isLoadingBets && (
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
          <section className="bg-gray-800 p-4 rounded-lg">
            <h1 className="text-xl font-bold mb-6">Active Predictions</h1>

            {isLoadingPredictions && predictions.length === 0 && (
              <div className="flex justify-center items-center py-8">
                <Spinner size="lg" />
              </div>
            )}
            {!isLoadingPredictions && predictions.length === 0 && (
              <div className="text-center text-gray-500 py-8">No predictions found</div>
            )}

            {/* Stats Row */}
            {predictions.length > 0 && (
              <div className="grid gap-6 md:grid-cols-3 mb-6">
                <Card className="bg-gray-700 text-white">
                  <CardHeader className="text-sm font-medium">Total Active Predictions</CardHeader>
                  <CardBody>
                    <p className="text-2xl font-bold">
                      {predictions.filter((p) => p.status === "open").length}
                    </p>
                  </CardBody>
                </Card>
                <Card className="bg-gray-700 text-white">
                  <CardHeader className="text-sm font-medium">Total Bets Placed</CardHeader>
                  <CardBody>
                    <p className="text-2xl font-bold">
                      {predictions.reduce((acc, curr) => acc + curr.bets_count, 0)}
                    </p>
                  </CardBody>
                </Card>
                <Card className="bg-gray-700 text-white">
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
              <section className="rounded-lg bg-gray-700 p-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-600">
                      <th className="py-2 px-4">Image</th>
                      <th className="py-2 px-4">Description</th>
                      <th className="py-2 px-4">Source</th>
                      <th className="py-2 px-4">Creator Choice</th>
                      <th className="py-2 px-4">Bet Amount</th>
                      <th className="py-2 px-4">Resolution Date</th>
                      <th className="py-2 px-4">Bets Count</th>
                      <th className="py-2 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedPredictions.map((prediction, index) => (
                      <tr
                        key={index}
                        className="cursor-pointer hover:bg-gray-600 border-b border-gray-600"
                        onClick={() => router.push(`/predictions/${prediction.id}`)}
                      >
                        <td className="py-2 px-4">
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
                        <td className="py-2 px-4">
                          {prediction.predicted_outcome || prediction.creator_choice}
                        </td>
                        <td className="py-2 px-4">{prediction.bet_amount}</td>
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