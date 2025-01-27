"use client";

import { useState, useEffect } from "react";
import { Image } from "@heroui/image";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { IPrediction, ILeaderboardData, IAgentProfile } from "@/app/utils/interface";
import { useFetch } from "@/app/utils/lib";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { PredictionItem } from "@/app/components/PredictionItem";
import { Tooltip } from "@heroui/tooltip";

export default function MarketsPage() {
  const [activeTab, setActiveTab] = useState<"predictions" | "sports" | "general" | "crypto" | "markets" | "leaderboard">("predictions");
  const [searchPredictions, setSearchPredictions] = useState("");
  const [searchSports, setSearchSports] = useState("");
  const [searchGeneral, setSearchGeneral] = useState("");
  const [searchCrypto, setSearchCrypto] = useState("");
  const [searchMarkets, setSearchMarkets] = useState("");

  // Predictions
  const [, setAgent] = useState<IAgentProfile | null>(null);
  const [predictions, setPredictions] = useState<IPrediction[]>([]);
  const [displayedPredictions, setDisplayedPredictions] = useState<IPrediction[]>([]);
  const [isLoadingPredictions, setIsLoadingPredictions] = useState<boolean>(false);
  const [pagePredictions, setPagePredictions] = useState<number>(1);
  const [hasMorePredictions, setHasMorePredictions] = useState<boolean>(true);

  // Additional data placeholders
  const [sportsData, setSportsData] = useState<IPrediction[]>([]);
  const [cryptoData, setCryptoData] = useState<IPrediction[]>([]);
  const [generalData, setGeneralData] = useState<IPrediction[]>([]);
  const [marketsData, setMarketsData] = useState<IPrediction[]>([]);
  const [isLoadingSports, setIsLoadingSports] = useState<boolean>(false);
  const [isLoadingCrypto, setIsLoadingCrypto] = useState<boolean>(false);
  const [isLoadingGeneral, setIsLoadingGeneral] = useState<boolean>(false);
  const [isLoadingMarkets, setIsLoadingMarkets] = useState<boolean>(false);

  const [pageSports, setPageSports] = useState<number>(1);
  const [pageGeneral, setPageGeneral] = useState<number>(1);
  const [pageMarkets, setPageMarkets] = useState<number>(1);
  const [pageCrypto, setPageCrypto] = useState<number>(1);
  const [hasMoreSports, setHasMoreSports] = useState<boolean>(true);
  const [hasMoreGeneral, setHasMoreGeneral] = useState<boolean>(true);
  const [hasMoreMarkets, setHasMoreMarkets] = useState<boolean>(true);
  const [hasMoreCrypto, setHasMoreCrypto] = useState<boolean>(true);
  const [displayedSports, setDisplayedSports] = useState<IPrediction[]>([]);
  const [displayedGeneral, setDisplayedGeneral] = useState<IPrediction[]>([]);
  const [displayedMarkets, setDisplayedMarkets] = useState<IPrediction[]>([]);
  const [displayedCrypto, setDisplayedCrypto] = useState<IPrediction[]>([]);
  // Add leaderboard states (after other state declarations)
  const [leaderboardData, setLeaderboardData] = useState<ILeaderboardData[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState<boolean>(false);

  const ITEMS_PER_PAGE_PREDICTIONS = 50;

  const router = useRouter();
  const fetch = useFetch();

  // Fetch Predictions
  const fetchPredictions = async (category: string) => {
    if (isLoadingPredictions) return;
    setIsLoadingPredictions(true);
    setIsLoadingSports(true);
    setIsLoadingGeneral(true);
    setIsLoadingCrypto(true);
    setIsLoadingMarkets(true);

    try {
      const response = await fetch.get("/api/getPredictions");
      if (response.status) {
        let source = "";
        if (category == "general") {
          source = "google_news";
        } else if (category == "markets") {
          source = "google_finance";
        } else if (category == "crypto") {
          source = "coinmarketcap";
        } else {
          source = "sportDB";
        }
        let interest = response.predictions.filter((prediction: IPrediction) => prediction.source == source);
        if (source == "sportDB") {
          if (category == "nba") {
            interest = interest.filter((prediction: IPrediction) => prediction.league_id == 4387);
          } else if (category == "nfl") {
            interest = interest.filter((prediction: IPrediction) => prediction.league_id == 4391);
          } else if (category == "english premier league") {
            interest = interest.filter((prediction: IPrediction) => prediction.league_id == 4328);
          } else {
            interest = interest.filter((prediction: IPrediction) => prediction.league_id != 4387 && prediction.league_id != 4391);
          }
        }
        setPredictions(interest);
        setDisplayedPredictions(interest.slice(0, ITEMS_PER_PAGE_PREDICTIONS));
        setHasMorePredictions(interest.length > ITEMS_PER_PAGE_PREDICTIONS);
        const sports = response.predictions.filter((prediction: IPrediction) => prediction.source === "sportDB");
        setSportsData(sports || []);
        setDisplayedSports(sports.slice(0, ITEMS_PER_PAGE_PREDICTIONS));
        setHasMoreSports(sports.length > ITEMS_PER_PAGE_PREDICTIONS);
        const general = response.predictions.filter((prediction: IPrediction) => prediction.source === "google_news");
        setGeneralData(general || []);
        setDisplayedGeneral(general.slice(0, ITEMS_PER_PAGE_PREDICTIONS));
        setHasMoreGeneral(general.length > ITEMS_PER_PAGE_PREDICTIONS);
        const crypto = response.predictions.filter((prediction: IPrediction) => prediction.source === "coinmarketcap");
        setCryptoData(crypto || []);
        setDisplayedCrypto(crypto.slice(0, ITEMS_PER_PAGE_PREDICTIONS));
        setHasMoreCrypto(crypto.length > ITEMS_PER_PAGE_PREDICTIONS);
        const markets = response.predictions.filter((prediction: IPrediction) => prediction.source === "google_finance");
        setMarketsData(markets || []);
        setDisplayedMarkets(markets.slice(0, ITEMS_PER_PAGE_PREDICTIONS));
        setHasMoreMarkets(markets.length > ITEMS_PER_PAGE_PREDICTIONS);
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      toast.error("Failed to fetch predictions: " + String(error));
      setHasMorePredictions(false);
    } finally {
      setIsLoadingPredictions(false);
      setIsLoadingSports(false);
      setIsLoadingGeneral(false);
      setIsLoadingCrypto(false);
      setIsLoadingMarkets(false);
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

  const fetchAgentProfile = async () => {
    try {
      const response = await fetch.get('/api/getAgentProfile');
      if (response.status) {
        setAgent(response.agent);
      } else {
        toast.error(response.message);
      }
      fetchPredictions(response.agent.category);
    } catch (error) {
      console.log(error);
      toast.error('Failed to fetch agent profile');
    }
  };


  // Lazy-load data based on current tab
  useEffect(() => {
    if (activeTab === "leaderboard" && leaderboardData.length === 0 && !isLoadingLeaderboard) {
      fetchLeaderboardData();
    }
  }, [activeTab, leaderboardData.length, isLoadingLeaderboard]);

  useEffect(() => {
    fetchAgentProfile();
  }, []);

  // Handle search
  const handlePredictionSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchPredictions(e.target.value);
    setPagePredictions(1); // reset pagination or infinite scroll
  };

  const handleSportsSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchSports(e.target.value);
    setPageSports(1);
  };

  const handleGeneralSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchGeneral(e.target.value);
    setPageGeneral(1);
  };

  const handleCryptoSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchCrypto(e.target.value);
    setPageCrypto(1);
  };

  const handleMarketsSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchMarkets(e.target.value);
    setPageMarkets(1);
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

  const loadMoreCrypto = () => {
    if (!isLoadingCrypto && hasMoreCrypto) {
      const newPage = pageCrypto + 1;
      const nextItems = cryptoData.slice(0, newPage * ITEMS_PER_PAGE_PREDICTIONS);
      setDisplayedCrypto(nextItems);
      setHasMoreCrypto(nextItems.length < cryptoData.length);
      setPageCrypto(newPage);
    }
  };

  const loadMoreMarkets = () => {
    if (!isLoadingMarkets && hasMoreMarkets) {
      const newPage = pageMarkets + 1;
      const nextItems = marketsData.slice(0, newPage * ITEMS_PER_PAGE_PREDICTIONS);
      setDisplayedMarkets(nextItems);
      setHasMoreMarkets(nextItems.length < marketsData.length);
      setPageMarkets(newPage);
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
    <>
      <div className="flex flex-row justify-between h-32">
        <div className="pr-8 pt-2">
          <h1 className="font-bold mb-2 font-kodemono ">
            Markets
          </h1>
          <p className="text-gray-500 h1paragraph">
            Explore other categories, find interesting predictions, refine your approach, and see how top bettors fare.
          </p>
        </div>
      </div>
      {/* Tabs */}
      <div className="flex gap-2 font-kodemono mb-2 text-small">
        <Tooltip
          content="View overall predictions."
          showArrow
        >
          <button
            onClick={() => setActiveTab("predictions")}
            className={`px-1 py-2 hover:text-white ${activeTab === "predictions" ? "text-white" : "text-default-400"
              }`}
          >
            Predictions
          </button>
        </Tooltip>
        <Tooltip
          content="Bet on sports events."
          showArrow
        >
          <button
            onClick={() => setActiveTab("sports")}
            className={`px-1 py-2 hover:text-white ${activeTab === "sports" ? "text-white" : "text-default-400"
              }`}
          >
            Sports
          </button>
        </Tooltip>
        <Tooltip
          content="Broader topics and forecasts."
          showArrow
        >
          <button
            onClick={() => setActiveTab("general")}
            className={`px-1 py-2 hover:text-white ${activeTab === "general" ? "text-white" : "text-default-400"
              }`}
          >
            General
          </button>
        </Tooltip>
        <Tooltip
          content="Cryptocurrency predictions."
          showArrow
        >
          <button
            onClick={() => setActiveTab("crypto")}
            className={`px-1 py-2 hover:text-white ${activeTab === "crypto" ? "text-white" : "text-default-400"
              }`}
          >
            Crypto
          </button>
        </Tooltip>
        <Tooltip
          content="Market predictions (stocks, etc)."
          showArrow
        >
          <button
            onClick={() => setActiveTab("markets")}
            className={`px-1 py-2 hover:text-white ${activeTab === "markets" ? "text-white" : "text-default-400"
              }`}
          >
            Markets
          </button>
        </Tooltip>
        <Tooltip
          content="View the leaderboards."
          showArrow
        >
          <button
            onClick={() => setActiveTab("leaderboard")}
            className={`px-1 py-2 hover:text-white ${activeTab === "leaderboard" ? "text-white" : "text-default-400"
              }`}
          >
            Leaderboard
          </button>
        </Tooltip>
      </div>

      {/* Search Field for Predictions */}
      {activeTab === "predictions" && (
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
            value={searchPredictions}
            onChange={handlePredictionSearch}
            placeholder="Search predictions..."
            className="w-full p-2 pl-9 rounded-md text-gray-700 focus:outline-none text-small input-search bg-gray-800 placeholder-gray-700"
          />
        </div>
      )}

      {/* Search Field for Sports */}
      {activeTab === "sports" && (
        <div className="relative mb-6 group">
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
            value={searchSports}
            onChange={handleSportsSearch}
            placeholder="Search sports..."
            className="w-full p-2 pl-9 rounded-md text-gray-700 focus:outline-none text-small input-search bg-gray-800 placeholder-gray-700"
          />
        </div>
      )}

      {/* Search Field for General */}
      {activeTab === "general" && (
        <div className="relative mb-6 group">
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
            value={searchGeneral}
            onChange={handleGeneralSearch}
            placeholder="Search general..."
            className="w-full p-2 pl-9 rounded-md text-gray-700 focus:outline-none text-small input-search bg-gray-800 placeholder-gray-700"
          />
        </div>
      )}

      {/* Search Field for General */}
      {activeTab === "crypto" && (
        <div className="relative mb-6 group">
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
            value={searchCrypto}
            onChange={handleCryptoSearch}
            placeholder="Search crypto..."
            className="w-full p-2 pl-9 rounded-md text-gray-700 focus:outline-none text-small input-search bg-gray-800 placeholder-gray-700"
          />
        </div>
      )}

      {activeTab === "markets" && (
        <div className="relative mb-6 group">
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
            value={searchMarkets}
            onChange={handleMarketsSearch}
            placeholder="Search markets..."
            className="w-full p-2 pl-9 rounded-md text-gray-700 focus:outline-none text-small input-search bg-gray-800 placeholder-gray-700"
          />
        </div>
      )}

      {/* PREDICTIONS SECTION */}
      {activeTab === "predictions" && (
        <section className="rounded-lg">
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

          {displayedPredictions.length > 0 && (
            <div className="rounded-lg p-0 overflow-x-auto">
              <table className="w-full text-sm text-left">
                <tbody>
                  {displayedPredictions.map((prediction, index) => (
                    <PredictionItem
                      key={index}
                      prediction={prediction}
                      onClick={(id) => router.push(`/predictions/${id}`)}
                
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Show More Button */}
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
        <section className="rounded-lg">
          {isLoadingSports && sportsData.length === 0 && (
            <div className="flex justify-center items-center py-8">
              <Spinner size="lg" />
            </div>
          )}
          {!isLoadingSports && sportsData.length === 0 && (
            <div className="text-center text-gray-500 py-8 container">
              No sports data found
            </div>
          )}

          {displayedSports.length > 0 && (
            <div className="rounded-lg p-0 overflow-x-auto">
              <table className="w-full text-sm text-left">
                <tbody>
                  {displayedSports.map((item, index) => (
                    <PredictionItem
                      key={index}
                      prediction={item}
                      onClick={(id) => router.push(`/predictions/${id}`)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

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
        </section>
      )}

      {/* GENERAL SECTION */}
      {activeTab === "general" && (
        <section className="rounded-lg">
          {isLoadingGeneral && generalData.length === 0 && (
            <div className="flex justify-center items-center py-8">
              <Spinner size="lg" />
            </div>
          )}
          {!isLoadingGeneral && generalData.length === 0 && (
            <div className="text-center text-gray-500 py-8 container">
              No general data found
            </div>
          )}
          {displayedGeneral.length > 0 && (
            <div className="rounded-lg p-0 overflow-x-auto">
              <table className="w-full text-sm text-left">
                <tbody>
                  {displayedGeneral.map((item, index) => (
                    <PredictionItem
                      key={index}
                      prediction={item}
                      onClick={(id) => router.push(`/predictions/${id}`)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
        </section>
      )}

      {/* CRYPTO SECTION */}
      {activeTab === "crypto" && (
        <section className="rounded-lg">
          {isLoadingCrypto && cryptoData.length === 0 && (
            <div className="flex justify-center items-center py-8">
              <Spinner size="lg" />
            </div>
          )}
          {!isLoadingCrypto && cryptoData.length === 0 && (
            <div className="text-center text-gray-500 py-8 container">
              No crypto data found
            </div>
          )}
          {displayedCrypto.length > 0 && (
            <div className="rounded-lg p-0 overflow-x-auto">
              <table className="w-full text-sm text-left">
                <tbody>
                  {displayedCrypto.map((item, index) => (
                    <PredictionItem
                      key={index}
                      prediction={item}
                      onClick={(id) => router.push(`/predictions/${id}`)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {hasMoreCrypto && !isLoadingCrypto && displayedCrypto.length > 0 && (
            <div className="flex justify-center mt-4">
              <Button
                color="primary"
                variant="flat"
                onPress={loadMoreCrypto}
                className="min-w-[200px]"
              >
                Show More
              </Button>
            </div>
          )}
        </section>
      )}

      {/* MARKETS SECTION */}
      {activeTab === "markets" && (
        <section className="rounded-lg">
          {isLoadingMarkets && marketsData.length === 0 && (
            <div className="flex justify-center items-center py-8">
              <Spinner size="lg" />
            </div>
          )}
          {!isLoadingMarkets && marketsData.length === 0 && (
            <div className="text-center text-gray-500 py-8 container">
              No markets data found
            </div>
          )}
          {displayedMarkets.length > 0 && (
            <div className="rounded-lg p-0 overflow-x-auto">
              <table className="w-full text-sm text-left">
                <tbody>
                  {displayedMarkets.map((item, index) => (
                    <PredictionItem
                      key={index}
                      prediction={item}
                      onClick={(id) => router.push(`/predictions/${id}`)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {hasMoreMarkets && !isLoadingMarkets && displayedMarkets.length > 0 && (
            <div className="flex justify-center mt-4">
              <Button
                color="primary"
                variant="flat"
                onPress={loadMoreMarkets}
                className="min-w-[200px]"
              >
                Show More
              </Button>
            </div>
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
            <div className=" rounded-xl overflow-hidden border-none">
              {/* Header */}
              <div className="bg-content2 px-6 py-4 border-b border-content3 grid grid-cols-12 gap-4">
                <div className="col-span-1 font-semibold ">Rank</div>
                <div className="col-span-6 font-semibold ">Agent</div>
                <div className="col-span-1 font-semibold ">Wins</div>
                <div className="col-span-2 font-semibold ">Bets </div>
                <div className="col-span-2 font-semibold ">Win Rate</div>
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
                  <div className="col-span-2 text-primary font-medium">{(item.total_winnings * 100 / item.bets_count).toFixed(2)}%</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
} 