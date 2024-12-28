"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@nextui-org/button";
import { Card, CardBody, CardHeader } from "@nextui-org/card";
import { Spinner } from "@nextui-org/spinner";
import { Chip } from "@nextui-org/chip";
import { IAgentProfile, IBet, Prediction } from "@/app/utils/interface";
import { useFetch, formatDate } from "@/app/utils/lib";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";



export default function MarketsPage() {
  const [activeTab, setActiveTab] = useState<"bets" | "predictions" | "sports" | "general">("bets");
  const [searchTerm, setSearchTerm] = useState("");
  const [agent, setAgent] = useState<IAgentProfile | null>(null);

  // Bets
  const [bets, setBets] = useState<IBet[]>([]);
  const [isLoadingBets, setIsLoadingBets] = useState<boolean>(false);
  const [pageBets, setPageBets] = useState<number>(1);
  const [hasMoreBets, setHasMoreBets] = useState<boolean>(true);

  // Predictions
  const [predictions, setPredictions] = useState<IPrediction[]>([]);
  const [displayedPredictions, setDisplayedPredictions] = useState<IPrediction[]>([]);
  const [isLoadingPredictions, setIsLoadingPredictions] = useState<boolean>(false);
  const [pagePredictions, setPagePredictions] = useState<number>(1);
  const [hasMorePredictions, setHasMorePredictions] = useState<boolean>(true);

  // Additional data placeholders
  const [sportsData, setSportsData] = useState<any[]>([]);
  const [isLoadingSports, setIsLoadingSports] = useState<boolean>(false);
  const [generalData, setGeneralData] = useState<any[]>([]);
  const [isLoadingGeneral, setIsLoadingGeneral] = useState<boolean>(false);

  const ITEMS_PER_PAGE_BETS = 5;
  const ITEMS_PER_PAGE_PREDICTIONS = 5;

  const fetch = useFetch();
  const router = useRouter();

  // Fetch Agent
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
  const fetchBets = async (page: number) => {
    if (isLoadingBets) return;
    setIsLoadingBets(true);

    try {
      const response = await fetch.get("/api/getBets", { page });
      if (response.status) {
        setBets((prev) => [...prev, ...response.bets]);
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
      toast.error("Failed to fetch predictions: " + String(error));
      setHasMorePredictions(false);
    } finally {
      setIsLoadingPredictions(false);
    }
  };

  const loadMorePredictions = () => {
    if (!isLoadingPredictions && hasMorePredictions) {
      const newPage = pagePredictions + 1;
      const nextItems = predictions.slice(0, newPage * ITEMS_PER_PAGE_PREDICTIONS);
      setDisplayedPredictions(nextItems);
      setHasMorePredictions(nextItems.length < predictions.length);
      setPagePredictions(newPage);
    }
  };

  // Fetch Sports (placeholder)
  const fetchSportsData = async () => {
    if (isLoadingSports) return;
    setIsLoadingSports(true);

    try {
      // Placeholder fetch. Replace with real endpoint later.
      const response = await fetch.get("/api/getSportsData");
      if (response.status) {
        setSportsData(response.data || []);
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      toast.error("Failed to fetch sports data");
    } finally {
      setIsLoadingSports(false);
    }
  };

  // Fetch General (placeholder)
  const fetchGeneralData = async () => {
    if (isLoadingGeneral) return;
    setIsLoadingGeneral(true);

    try {
      // Placeholder fetch. Replace with real endpoint later.
      const response = await fetch.get("/api/getGeneralData");
      if (response.status) {
        setGeneralData(response.data || []);
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      toast.error("Failed to fetch general data");
    } finally {
      setIsLoadingGeneral(false);
    }
  };

  // Lazy-load data based on current tab
  useEffect(() => {
    if (activeTab === "predictions" && predictions.length === 0) {
      fetchPredictions();
    }
    if (activeTab === "sports" && sportsData.length === 0) {
      fetchSportsData();
    }
    if (activeTab === "general" && generalData.length === 0) {
      fetchGeneralData();
    }
  }, [activeTab]);

  // On first mount
  useEffect(() => {
    fetchBets(1);
  }, []);

  // Handle search
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  return (
    <div className="flex text-white">
      {/* Sidebar */}
      <aside className="w-64 fixed top-0 text-sm">
        <nav className="flex min-h-screen flex-col gap-4 text-normal justify-between py-8 px-4">
          <div>
            <div className="flex items-center mb-4">
              <Image
                src={"/assets/images/logo-text.svg"}
                alt="Markets Logo"
                width={160}
                height={40}
                className="mr-2 rounded-full w-100"
              />
            </div>

            {/* Profile Photo + Credits */}
            <Link href="/payment" className="flex items-center gap-2 mb-4">
              <Image
                src={agent?.image || "/assets/images/logo-simple.svg"}
                alt="Profile"
                width={24}
                height={24}
                className="rounded-full bg-gray-700 mr-2"
              />
              <span className="text-sm font-semibold icon-credits px-5 font-kodemono">
                <span className="text-gradient">83940</span>
              </span>
            </Link>

            {/* Sidebar Links */}
            <Link href="/dashboard" className="flex items-center gap-2 mb-4 group text-default-400">
              <span className="icon-dashboard mr-2 block group-hover:hidden" />
              <span className="icon-dashboard-active mr-2 hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono">Dashboard</span>
            </Link>
            <Link href="/markets" className="flex items-center gap-2 mb-4 group text-white">
            <span className="icon-markets-active mr-2" /> Markets
            </Link>
            <Link href="/strategy" className="flex items-center gap-2 mb-4 group text-default-400">
              <span className="icon-strategy mr-2 block group-hover:hidden" />
              <span className="icon-strategy-active mr-2 hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono">Strategy</span>
            </Link>
          </div>
          <div>
            <Link href="/about" className="flex items-center gap-2 mb-4 text-default-400 group">
              <span className="icon-about mr-2 block group-hover:hidden" />
              <span className="icon-about-active mr-2 hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono">About</span>
            </Link>
            <Link href="https://discord.gg/dSEV8YCDQ2" className="flex items-center gap-2 mb-4 text-default-400 group">
              <span className="icon-support mr-2 block group-hover:hidden" />
              <span className="icon-support-active mr-2 hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono">Community</span>
            </Link>
            <Link href="/signout" className="flex items-center gap-2 mb-4 text-default-400 group">
              <span className="icon-logout mr-2 block group-hover:hidden" />
              <span className="icon-logout-active mr-2 hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono">Sign out</span>
            </Link>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 container mx-auto px-4 py-6 md:px-8 md:py-8">
        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("bets")}
            className={`px-1 py-2 hover:text-white ${
              activeTab === "bets" ? "text-white" : "text-gray-700"
            }`}
          >
            Bets
          </button>
          <button
            onClick={() => setActiveTab("predictions")}
            className={`px-1 py-2 hover:text-white ${
              activeTab === "predictions" ? "text-white" : "text-gray-700"
            }`}
          >
            Predictions
          </button>
          <button
            onClick={() => setActiveTab("sports")}
            className={`px-1 py-2 hover:text-white ${
              activeTab === "sports" ? "text-white" : "text-gray-700"
            }`}
          >
            Sports
          </button>
          <button
            onClick={() => setActiveTab("general")}
            className={`px-1 py-2 hover:text-white ${
              activeTab === "general" ? "text-white" : "text-gray-700"
            }`}
          >
            General
          </button>
        </div>

        {/* Search Field */}
        <div className="my-4">
          <input
            type="text"
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder="Search..."
            className="w-full p-2 rounded-md focus:outline-none text-small active:outline-none input-search"
          />
        </div>

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
            {bets.length > 0 && (
              <table className="w-full text-sm text-left">
                <tbody>
                  {bets.map((bet, index) => (
                    <tr key={index}>
                      <td className="py-2 px-2">
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
                      <td className="py-2 px-4 break-words max-w-xs">{bet.description}</td>
                      <td className="py-2 px-4">{bet.source}</td>
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
          </section>
        )}

        {/* PREDICTIONS SECTION */}
        {activeTab === "predictions" && (
          <section className="rounded-lg min-w-[780px]">
            {isLoadingPredictions && predictions.length === 0 && (
              <div className="flex justify-center items-center py-8">
                <Spinner size="lg" />
              </div>
            )}
            {!isLoadingPredictions && predictions.length === 0 && (
              <div className="text-center text-gray-500 py-8 container">No predictions found</div>
            )}
            {displayedPredictions.length > 0 && (
              <div className="rounded-lg p-4 overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <tbody>
                    {displayedPredictions.map((prediction, index) => (
                      <tr
                        key={index}
                        className="cursor-pointer hover:bg-gray-600"
                        onClick={() => router.push(`/predictions/${prediction.id}`)}
                      >
                        <td className="py-2 px-2">
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
                          {formatDate(prediction.resolution_date || prediction.created_at)}
                        </td>
                        <td className="py-2 px-4">{prediction.bets_count}</td>
                        <td className="py-2 px-4">
                          <Chip
                            color={
                              prediction.status !== "open"
                                ? prediction.outcome === prediction.creator_choice
                                  ? "success"
                                  : "danger"
                                : "primary"
                            }
                            variant="flat"
                            size="sm"
                          >
                            {prediction.status !== "open"
                              ? prediction.outcome === prediction.creator_choice
                                ? "Won"
                                : "Lost"
                              : prediction.status}
                          </Chip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {hasMorePredictions && !isLoadingPredictions && displayedPredictions.length > 0 && (
              <div className="flex justify-center mt-4">
                <Button
                  color="primary"
                  variant="flat"
                  onPress={loadMorePredictions}
                  className="min-w-[200px]"
                >
                  Show More
                </Button>
              </div>
            )}
          </section>
        )}

        {/* SPORTS SECTION (Placeholder) */}
        {activeTab === "sports" && (
          <section className="rounded-lg min-w-[780px]">
            {isLoadingSports && sportsData.length === 0 && (
              <div className="flex justify-center items-center py-8">
                <Spinner size="lg" />
              </div>
            )}
            {!isLoadingSports && sportsData.length === 0 && (
              <div className="text-center text-gray-500 py-8 container">No sports data found</div>
            )}
            {sportsData.length > 0 && (
              <div className="grid gap-4">
                {/* Render your sports data here */}
                {sportsData.map((item, index) => (
                  <Card key={index} className="bg-content0">
                    <CardHeader>{item.title}</CardHeader>
                    <CardBody>{item.description}</CardBody>
                  </Card>
                ))}
              </div>
            )}
          </section>
        )}

        {/* GENERAL SECTION (Placeholder) */}
        {activeTab === "general" && (
          <section className="rounded-lg min-w-[780px]">
            {isLoadingGeneral && generalData.length === 0 && (
              <div className="flex justify-center items-center py-8">
                <Spinner size="lg" />
              </div>
            )}
            {!isLoadingGeneral && generalData.length === 0 && (
              <div className="text-center text-gray-500 py-8 container">No general data found</div>
            )}
            {generalData.length > 0 && (
              <div className="grid gap-4">
                {/* Render your general data here */}
                {generalData.map((item, index) => (
                  <Card key={index} className="bg-content0">
                    <CardHeader>{item.title}</CardHeader>
                    <CardBody>{item.description}</CardBody>
                  </Card>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
} 