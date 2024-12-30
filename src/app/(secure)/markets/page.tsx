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
            <Link href="/payment" className="md:flex items-center gap-2 mb-4 hidden">
              <Image
                src={agent?.image || "/assets/images/logo-simple.svg"}
                alt="Profile"
                width={24}
                height={24}
                className="rounded-full bg-gray-700 mr-2 sm-hidden"
              />
              {/* Credits */}
              <span className="text-sm font-semibold font-kodemono">
                <span className="text-gradient">83940</span>
              </span>

            </Link>
            <Link
              href="/dashboard"
              className="flex items-center gap-2 mb-4 group"
            >
              <span className="icon-dashboard mr-2 block group-hover:hidden" />
              <span className="icon-dashboard-active mr-2 hidden sm:enlarge-icon group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono"><span className="hidden md:inline-block">Dashboard</span>
              </span>
            </Link>
          
            <Link href="/markets" className="flex items-center gap-2 mb-4 text-white font-kodemono">
            <span className="icon-markets-active mr-2" /> <span className="hidden md:inline-block">Markets</span>
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
          <section className="rounded-lg ">
            {isLoadingPredictions && predictions.length === 0 && (
              <div className="flex justify-center items-center py-8">
                <Spinner size="lg" />
              </div>
            )}
            {!isLoadingPredictions && predictions.length === 0 && (
              <div className="text-center text-gray-500 py-8 container">No predictions found</div>
            )}
            {displayedPredictions.length > 0 && (
              <div className="rounded-lg p-0 overflow-x-auto">
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
                              className="rounded-full min-w-[40px] min-h-[40px] max-w-[40px] max-h-[40px]"
                            />
                          )}
                        </td>
                        <td className="py-2 px-4 break-words">{prediction.description}</td>
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
                                className="rounded-full min-w-[40px] min-h-[40px] w-[40px] h-[40px]"
                              />
                            )}
                          </td>
                          <td className="py-2 px-4 break-words">{item.description}</td>
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
                                className="rounded-md min-w-[40px] min-h-[40px] w-[40px] h-[40px]"
                              />
                            )}
                          </td>
                          <td className="py-2 px-4 break-words">{item.description}</td>
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
          <section className="rounded-lg max-w-[780px]">
            {isLoadingLeaderboard && (
              <div className="flex justify-center items-center py-8">
                <Spinner size="lg" />
              </div>
            )}
            {!isLoadingLeaderboard && leaderboardData.length === 0 && (
              <div className="text-center text-gray-500 py-8 container">No leaderboard data found</div>
            )}
            {leaderboardData.length > 0 && (
              <div className=" rounded-xl shadow-medium overflow-hidden border border-content3">
                {/* Header */}
                <div className="bg-content2 px-6 py-4 border-b border-content3 grid grid-cols-12 gap-4">
                  <div className="col-span-1 font-semibold text-foreground">Rank</div>
                  <div className="col-span-6 font-semibold text-foreground">Agent</div>
                  <div className="col-span-1 font-semibold text-foreground">Wins</div>
                  <div className="col-span-2 font-semibold text-foreground">Bets </div>
                  <div className="col-span-2 font-semibold text-foreground">Win Rate</div>
                </div>

                {/* Rows */}
                {leaderboardData.map((item) => (
                  <div 
                    key={item.id}
                    className={`px-6 py-4 grid grid-cols-12 gap-4 border-b border-content3 hover:bg-content2 transition-colors
                      ${item.rank === 1 ? 'bg-content0' : ''} 
                      ${item.rank === 2 ? 'bg-content2' : ''} 
                      ${item.rank === 3 ? 'bg-danger-50' : ''}`}
                  >
                    <div className="col-span-1 p-2 font-medium">
                      {item.rank <= 3 ? (
                        <span className={`
                          inline-flex items-center justify-center w-6 h-6 rounded-full font-bold
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
                    <div className="col-span-6 flex items-center gap-3">
                      <Image
                        src={item.image || '/assets/images/default-agent.png'}
                        alt={item.name}
                        width={40}
                        height={40}
                        className="rounded-full min-w-[40px] min-h-[40px] w-[40px] h-[40px]"
                      />
                      <span className="text-foreground font-medium">{item.name}</span>
                    </div>
                    <div className="col-span-1 text-success font-medium">
                      {item.total_winnings}
                    </div>
                    <div className="col-span-2 text-foreground-600">{item.bets_count}</div>
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