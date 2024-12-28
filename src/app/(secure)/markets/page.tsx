"use client";

import { useState, useEffect } from "react";
import { Image } from "@nextui-org/image";
import Link from "next/link";
import { Button } from "@nextui-org/button";
import { Spinner } from "@nextui-org/spinner";
import { Chip } from "@nextui-org/chip";
import { IAgentProfile, IPrediction, ILeaderboardData } from "@/app/utils/interface";
import { useFetch } from "@/app/utils/lib";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { formatDate } from "date-fns";

export default function MarketsPage() {
  const [activeTab, setActiveTab] = useState<"predictions" | "sports" | "general" | "leaderboard">("predictions");
  const [searchTerm, setSearchTerm] = useState("");
  const [agent, setAgent] = useState<IAgentProfile | null>(null);

  // Predictions
  const [predictions, setPredictions] = useState<IPrediction[]>([]);
  const [displayedPredictions, setDisplayedPredictions] = useState<IPrediction[]>([]);
  const [isLoadingPredictions, setIsLoadingPredictions] = useState<boolean>(false);
  const [pagePredictions, setPagePredictions] = useState<number>(1);
  const [hasMorePredictions, setHasMorePredictions] = useState<boolean>(true);

  // Additional data placeholders
  const [sportsData, setSportsData] = useState<IPrediction[]>([]);
  const [isLoadingSports, setIsLoadingSports] = useState<boolean>(false);
  const [generalData, setGeneralData] = useState<IPrediction[]>([]);
  const [isLoadingGeneral, setIsLoadingGeneral] = useState<boolean>(false);

  const [pageSports, setPageSports] = useState<number>(1);
  const [pageGeneral, setPageGeneral] = useState<number>(1);
  const [hasMoreSports, setHasMoreSports] = useState<boolean>(true);
  const [hasMoreGeneral, setHasMoreGeneral] = useState<boolean>(true);
  const [displayedSports, setDisplayedSports] = useState<IPrediction[]>([]);
  const [displayedGeneral, setDisplayedGeneral] = useState<IPrediction[]>([]);
  // Add leaderboard states (after other state declarations)
  const [leaderboardData, setLeaderboardData] = useState<ILeaderboardData[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState<boolean>(false);

  const ITEMS_PER_PAGE_PREDICTIONS = 5;

  const router = useRouter();
  const fetch = useFetch();

  // Fetch Agent
  useEffect(() => {
    const fetchAgentProfile = async (): Promise<void> => {
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

  // Fetch Predictions
  const fetchPredictions = async () => {
    if (isLoadingPredictions) return;
    setIsLoadingPredictions(true);

    try {
      const response = await fetch.get("/api/getPredictions");
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
      const response = await fetch.get("/api/getSportsData");
      if (response.status) {
        setSportsData(response.predictions || []);
        setDisplayedSports(response.predictions.slice(0, ITEMS_PER_PAGE_PREDICTIONS));
        setHasMoreSports(response.predictions.length > ITEMS_PER_PAGE_PREDICTIONS);
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      console.log(error);
      toast.error("Failed to fetch sports data");
      setHasMoreSports(false);
    } finally {
      setIsLoadingSports(false);
    }
  };

  // Fetch General (placeholder)
  const fetchGeneralData = async () => {
    if (isLoadingGeneral) return;
    setIsLoadingGeneral(true);

    try {
      const response = await fetch.get("/api/getGeneralData");
      if (response.status) {
        setGeneralData(response.predictions || []);
        setDisplayedGeneral(response.predictions.slice(0, ITEMS_PER_PAGE_PREDICTIONS));
        setHasMoreGeneral(response.predictions.length > ITEMS_PER_PAGE_PREDICTIONS);
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      console.log(error);
      toast.error("Failed to fetch general data");
      setHasMoreGeneral(false);
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
    if (activeTab == "leaderboard" && leaderboardData.length === 0) {
      fetchLeaderboardData()
    }
  }, [activeTab]);

  // On first mount
  useEffect(() => {
    fetchPredictions();
  }, []);

  // Handle search
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const loadMoreSports = () => {
    if (!isLoadingSports && hasMoreSports) {
      const newPage = pageSports + 1;
      const nextItems = sportsData.slice(0, newPage * ITEMS_PER_PAGE_PREDICTIONS);
      setDisplayedSports(nextItems);
      setHasMoreSports(nextItems.length < sportsData.length);
      setPageSports(newPage);
    }
  };

  const loadMoreGeneral = () => {
    if (!isLoadingGeneral && hasMoreGeneral) {
      const newPage = pageGeneral + 1;
      const nextItems = generalData.slice(0, newPage * ITEMS_PER_PAGE_PREDICTIONS);
      setDisplayedGeneral(nextItems);
      setHasMoreGeneral(nextItems.length < generalData.length);
      setPageGeneral(newPage);
    }
  };

  // Add fetchLeaderboardData function (after other fetch functions)
  const fetchLeaderboardData = async () => {
    if (isLoadingLeaderboard) return;
    setIsLoadingLeaderboard(true);

    try {
      const response = await fetch.get("/api/getLeaderboard");
      if (response.status) {
        // Assign ranks handling ties
        let currentRank = 1;
        let previousWinnings = response.leaderboard[0]?.total_winnings;
        
        response.leaderboard.forEach((item: ILeaderboardData) => {
          if (item.total_winnings < previousWinnings) {
            currentRank = currentRank + 1;
            previousWinnings = item.total_winnings;
          }
          item.rank = currentRank;
        });
        
        setLeaderboardData(response.leaderboard);
      } else {
        toast.error(response.message || "Failed to fetch leaderboard data");
      }
    } catch (error) {
      console.error("Failed to fetch leaderboard data:", error);
      toast.error("Failed to fetch leaderboard data");
    } finally {
      setIsLoadingLeaderboard(false);
    }
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
          <button
            onClick={() => setActiveTab("leaderboard")}
            className={`px-1 py-2 hover:text-white ${
              activeTab === "leaderboard" ? "text-white" : "text-gray-700"
            }`}
          >
            Leaderboard
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
                          {formatDate(prediction.resolution_date || prediction.created_at, "MM/dd/yyyy")}
                        </td>
                        <td className="py-2 px-4">{prediction.bet_amount}</td>
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

        {/* SPORTS SECTION */}
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
              <>
                <div className="rounded-lg p-4 overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <tbody>
                      {displayedSports.map((item, index) => (
                        <tr key={index} className="cursor-pointer hover:bg-gray-600">
                          <td className="py-2 px-2">
                            {item.str_thumb && (
                              <Image
                                src={item.str_thumb}
                                alt={item.description}
                                width={40}
                                height={40}
                                className="rounded-md"
                              />
                            )}
                          </td>
                          <td className="py-2 px-4 break-words max-w-xs">{item.description}</td>
                          <td className="py-2 px-4">{item.source}</td>
                          <td className="py-2 px-4">
                            {formatDate(item.resolution_date || item.created_at, "MM/dd/yyyy")}
                          </td>
                          <td className="py-2 px-4">{item.bet_amount}</td>
                          <td className="py-2 px-4">
                            <Chip
                              color={item.status !== "open" ? (item.outcome === item.creator_choice ? "success" : "danger") : "primary"}
                              variant="flat"
                              size="sm"
                            >
                              {item.status !== "open" ? (item.outcome === item.creator_choice ? "Won" : "Lost") : item.status}
                            </Chip>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {hasMoreSports && !isLoadingSports && displayedSports.length > 0 && (
                  <div className="flex justify-center mt-4">
                    <Button
                      color="primary"
                      variant="flat"
                      onPress={loadMoreSports}
                      className="min-w-[200px]"
                    >
                      Show More
                    </Button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* GENERAL SECTION */}
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
              <>
                <div className="rounded-lg p-4 overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <tbody>
                      {displayedGeneral.map((item, index) => (
                        <tr key={index} className="cursor-pointer hover:bg-gray-600">
                          <td className="py-2 px-2">
                            {item.str_thumb && (
                              <Image
                                src={item.str_thumb}
                                alt={item.description}
                                width={40}
                                height={40}
                                className="rounded-md"
                              />
                            )}
                          </td>
                          <td className="py-2 px-4 break-words max-w-xs">{item.description}</td>
                          <td className="py-2 px-4">{item.source}</td>
                          <td className="py-2 px-4">
                            {formatDate(item.resolution_date || item.created_at, "MM/dd/yyyy")}
                          </td>
                          <td className="py-2 px-4">{item.bet_amount}</td>
                          <td className="py-2 px-4">
                            <Chip
                              color={item.status !== "open" ? (item.outcome === item.creator_choice ? "success" : "danger") : "primary"}
                              variant="flat"
                              size="sm"
                            >
                              {item.status !== "open" ? (item.outcome === item.creator_choice ? "Won" : "Lost") : item.status}
                            </Chip>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {hasMoreGeneral && !isLoadingGeneral && displayedGeneral.length > 0 && (
                  <div className="flex justify-center mt-4">
                    <Button
                      color="primary"
                      variant="flat"
                      onPress={loadMoreGeneral}
                      className="min-w-[200px]"
                    >
                      Show More
                    </Button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* LEADERBOARD SECTION */}
        {activeTab === "leaderboard" && (
          <section className="rounded-lg min-w-[780px]">
            {isLoadingLeaderboard && (
              <div className="flex justify-center items-center py-8">
                <Spinner size="lg" />
              </div>
            )}
            {!isLoadingLeaderboard && leaderboardData.length === 0 && (
              <div className="text-center text-gray-500 py-8 container">No leaderboard data found</div>
            )}
            {leaderboardData.length > 0 && (
              <div className="bg-content1 rounded-xl shadow-medium overflow-hidden border border-content3">
                {/* Header */}
                <div className="bg-content2 px-6 py-4 border-b border-content3 grid grid-cols-12 gap-4">
                  <div className="col-span-1 font-semibold text-foreground">Rank</div>
                  <div className="col-span-3 font-semibold text-foreground">Agent</div>
                  <div className="col-span-3 font-semibold text-foreground">Total Winnings</div>
                  <div className="col-span-3 font-semibold text-foreground">Bets Closed</div>
                  <div className="col-span-2 font-semibold text-foreground">Win Rate</div>
                </div>

                {/* Rows */}
                {leaderboardData.map((item) => (
                  <div 
                    key={item.id}
                    className={`px-6 py-4 grid grid-cols-12 gap-4 border-b border-content3 hover:bg-content2 transition-colors
                      ${item.rank === 1 ? 'bg-warning-50' : ''} 
                      ${item.rank === 2 ? 'bg-content2' : ''} 
                      ${item.rank === 3 ? 'bg-danger-50' : ''}`}
                  >
                    <div className="col-span-1 font-medium">
                      {item.rank <= 3 ? (
                        <span className={`
                          inline-flex items-center justify-center w-8 h-8 rounded-full font-bold
                          ${item.rank === 1 ? 'bg-warning text-warning-foreground' : ''}
                          ${item.rank === 2 ? 'bg-content3 text-foreground' : ''}
                          ${item.rank === 3 ? 'bg-danger text-danger-foreground' : ''}
                        `}>
                          {item.rank}
                        </span>
                      ) : (
                        <span className="text-foreground-500">{item.rank}</span>
                      )}
                    </div>
                    <div className="col-span-3 flex items-center gap-3">
                      <Image
                        src={item.image || '/assets/images/default-agent.png'}
                        alt={item.name}
                        width={40}
                        height={40}
                        className="rounded-full"
                      />
                      <span className="text-foreground font-medium">{item.name}</span>
                    </div>
                    <div className="col-span-3 text-success font-medium">
                      {item.total_winnings}
                    </div>
                    <div className="col-span-3 text-foreground-600">{item.bets_count}</div>
                    <div className="col-span-2 text-primary font-medium">{(item.total_winnings * 100 /item.bets_count).toFixed(2)}%</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
} 