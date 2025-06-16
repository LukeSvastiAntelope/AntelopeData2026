'use client';

import { Card, CardBody } from "@heroui/card";
import { Image } from "@heroui/image";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { useEffect, useState } from "react";
import { useFetch } from "@/app/utils/lib";
import { toast } from "react-hot-toast";
import { useParams, useRouter } from "next/navigation";
import { IBet, PredictionDB, IAgentProfile } from "@/app/utils/interface";
import { format as formatDateFn } from "date-fns";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Tooltip } from "@heroui/tooltip";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Link2, Bookmark } from "lucide-react";

interface ChoiceOdds {
  choice: string;
  amount: number;
  odds: string;
  percentage: string; // e.g. "45.0"
  count: number;
}

// MultiChoiceOddsBar with "no" on left, "yes" on right, "combined" label in the middle.
function MultiChoiceOddsBar({ choices }: { choices: ChoiceOdds[] }) {
  // Separate out yes/no from other potential choices
  const noObj = choices.find(
    (c) => c.choice.toLowerCase() === "no"
  );
  const yesObj = choices.find(
    (c) => c.choice.toLowerCase() === "yes"
  );
  const otherChoices = choices.filter(
    (c) =>
      c.choice.toLowerCase() !== "yes" &&
      c.choice.toLowerCase() !== "no"
  );

  // Sort so that "No" is first, then other choices, then "Yes"
  const sortedChoices: ChoiceOdds[] = [
    ...(noObj ? [noObj] : []),
    ...otherChoices,
    ...(yesObj ? [yesObj] : []),
  ];

  let accumulated = 0;

  // Helper to format the "x" label (∞ => ∞x, normal => 2.00x, etc.)
  function formatOdds(odds: string) {
    return odds === "∞" ? "∞x" : `${odds}x`;
  }

  return (
    <div className="w-full mb-6">
      {/* Label row: No on left, combined label centered, Yes on right */}
      <div className="flex items-center justify-between px-2 mb-2">
        <div className="text-sm text-red-400/90 min-w-[80px]">
          {noObj ? `No: ${noObj.percentage}% (${formatOdds(noObj.odds)})` : ""}
        </div>
        <div className="text-sm text-white/60 text-center flex-1">
          Combined Market Odds
        </div>
        <div className="text-sm text-emerald-400/90 min-w-[80px] text-right">
          {yesObj ? `Yes: ${yesObj.percentage}% (${formatOdds(yesObj.odds)})` : ""}
        </div>
      </div>

      {/* Single progress bar */}
      <div className="relative w-full bg-white/10 rounded-lg overflow-hidden h-2">
        {sortedChoices.map((c) => {
          let segmentColor = "bg-sky-400/90";
          if (c.choice.toLowerCase() === "no") {
            segmentColor = "bg-danger";
          } else if (c.choice.toLowerCase() === "yes") {
            segmentColor = "bg-success";
          } else if (c.choice.toLowerCase() === "draw") {
            segmentColor = "bg-warning";
          }

          const widthFraction = parseFloat(c.percentage) || 0;
          const style = {
            left: `${accumulated}%`,
            width: `${widthFraction}%`,
          };

          accumulated += widthFraction;

          // Build a tooltip string with relevant stats
          // e.g.: "Choice: No | 45.0% | 2.22x | Bets: 12"
          const tooltipContent = `${c.choice[0]?.toUpperCase() + c.choice.slice(1)
            }: ${c.percentage}% (${formatOdds(c.odds)}) | Bets: ${c.count}`;

          return (
            <Tooltip
              key={c.choice}
              content={tooltipContent}
              showArrow
              color="primary"
              placement="top"
            >
              <div
                className={`absolute top-0 bottom-0 ${segmentColor} transition-all duration-300 cursor-pointer`}
                style={style}
              />
            </Tooltip>
          );
        })}
      </div>

      {/* If you want to show other choices below the bar with their odds */}
      {otherChoices.length > 0 && (
        <div className="mt-2 px-2 flex flex-wrap gap-4">
          {otherChoices.map((c) => (
            <div key={c.choice} className="text-sm text-white/80">
              {c.choice}: {c.percentage}% ({formatOdds(c.odds)})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PredictionDetail() {
  const params = useParams();
  const fetchData = useFetch();
  const router = useRouter();

  // Local state
  const [prediction, setPrediction] = useState<PredictionDB | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [choiceOdds, setChoiceOdds] = useState<ChoiceOdds[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState("");
  const [betAmount, setBetAmount] = useState<string>("");
  const [betReason, setBetReason] = useState("");
  const [choiceList, setChoiceList] = useState<string[]>([]);
  const [agent, setAgent] = useState<IAgentProfile | null>(null);
  const [selectedSide, setSelectedSide] = useState<'buy' | 'sell'>('buy');

  const quickAddAmounts = [1, 20, 100];

  // fetch prediction details
  const fetchPredictionDetails = async (id: string, category: string) => {
    try {
      const response = await fetch(`/api/getPrediction/${id}`);
      const data = await response.json();
      if (data.status) {
        setPrediction(data.prediction);
        if (data.prediction?.bets) {
          const betsArray: IBet[] = data.prediction.bets;
          const choiceTotals = betsArray.reduce((acc, b) => {
            const lowerChoice = b.choice.toLowerCase();
            acc[lowerChoice] = (acc[lowerChoice] || 0) + b.amount;
            return acc;
          }, {} as Record<string, number>);

          const totalAmount = Object.values(choiceTotals).reduce(
            (sum, amount) => sum + amount,
            0
          );

          // Calculate odds and percentages for each choice
          const newChoiceOdds = Object.entries(choiceTotals).map(
            ([choice, amount]) => {
              const percentage =
                totalAmount > 0 ? (amount / totalAmount) * 100 : 0;
              const odds =
                percentage > 0 ? (100 / percentage).toFixed(2) : "∞";
              return {
                choice,
                amount,
                odds,
                percentage: percentage.toFixed(1),
                count: betsArray.filter(
                  (bet) => bet.choice.toLowerCase() === choice
                ).length,
              };
            }
          );
          setChoiceOdds(newChoiceOdds);
        }

        // Logic to set the correct choiceList
        let source = "";
        if (category) {
          if (category === "general") {
            source = "google_news";
          } else if (category === "markets") {
            source = "google_finance";
          } else if (category === "crypto") {
            source = "coinmarketcap";
          } else {
            source = "sportDB";
          }
          let interest = data.prediction.source === source;
          if (source === "sportDB" && interest) {
            if (category === "nba") {
              interest = data.prediction.league_id === 4387;
            } else if (category === "nfl") {
              interest = data.prediction.league_id === 4391;
            } else if (category === "english premier league") {
              interest = data.prediction.league_id === 4328;
            } else if (category === "soccer") {
              interest =
                data.prediction.league_id !== 4387 &&
                data.prediction.league_id !== 4391;
            }
          }
          if (interest) {
            if (data.prediction.source !== "sportDB") {
              setChoiceList(["yes", "no"]);
            } else {
              // handle sports choices
              if (
                data.prediction.league_id == "4391" ||
                data.prediction.league_id == "4387"
              ) {
                setChoiceList([
                  data.prediction.team_a,
                  data.prediction.team_b,
                ]);
              } else {
                setChoiceList([
                  data.prediction.team_a,
                  data.prediction.team_b,
                  "Draw",
                ]);
              }
            }
          }
        }
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error("Failed to fetch prediction details: " + error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAgentProfile = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") ?? "" : "";
      const response = await fetch('/api/getAgentProfile', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      });
      const data = await response.json();
      if (data.status) {
        setAgent(data.agent);
      }
      fetchPredictionDetails(params.id as string, data?.agent?.category ?? "");  
    } catch (error: unknown) {
      toast.error("Failed to fetch agent profile: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  useEffect(() => {
    if (params.id) {
      fetchAgentProfile();
    }
  }, [params.id]);

  const handleBet = async () => {
    try {
      if (!agent?.wallet_balance || agent?.wallet_balance < Number(betAmount)) {
        toast.error("Insufficient balance");
        return;
      }
      if (selectedChoice === "") {
        toast.error("Please select a choice");
        return;
      }
      if (Number(betAmount) <= 0) {
        toast.error("Bet amount must be greater than 0");
        return;
      }
      if (betReason === "") {
        toast.error("Please enter a reason for your bet");
        return;
      }

      const response = await fetchData.post(`/api/placeBet`, {
        predictionId: params.id,
        choice: selectedChoice,
        amount: Number(betAmount),
        reason: betReason,
      });

      if (response.status) {
        toast.success("Bet placed successfully!");
        setIsModalOpen(false);
        // Refresh data
        fetchPredictionDetails(params.id as string, agent?.category as string);
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      toast.error("Failed to place bet: " + error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!prediction) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p>Prediction not found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-2 w-full">
      <div className="mx-auto rounded-lg bg-background text-foreground shadow-lg border border-border">
        {/* Header */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-zinc-400 hover:text-zinc-100" />
              <div className="h-4 border-l border-zinc-800 mx-4" />
              <Button
                color="default"
                variant="light"
                onPress={() => router.back()}
                className="text-small p-0 text-zinc-400 hover:text-zinc-100"
              >
                ← Back
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                isIconOnly
                variant="light"
                className="text-zinc-400 hover:text-zinc-100"
              >
                <Link2 className="h-5 w-5" />
              </Button>
              <Button
                isIconOnly
                variant="light"
                className="text-zinc-400 hover:text-zinc-100"
              >
                <Bookmark className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
        
        <div className="border-b border-zinc-800" />

        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Main Content */}
            <div className="lg:col-span-2">
              {/* Event Image */}
              <Image
                src={prediction.str_thumb}
                alt={prediction.description}
                className="w-full object-cover rounded-xl mb-6"
                style={{ height: "300px" }}
              />

              {/* Title and Source */}
              <div className="mb-6">
                <h1 className="text-xl font-semibold mb-2">{prediction.description}</h1>
                <p className="text-sm text-zinc-400">Source: {prediction.source}</p>
              </div>

              {/* Status and Creator Choice */}
              <div className="flex items-center gap-4 mb-8">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-400">Status:</span>
                  <Chip 
                    color={prediction.status === "open" ? "primary" : (prediction.outcome.toLowerCase() === prediction.creator_choice.toLowerCase() ? "success" : "danger")}
                    className="bg-primary/20 capitalize"
                  >
                    {prediction.status === "open" ? "Open" : (prediction.outcome.toLowerCase() === prediction.creator_choice.toLowerCase() ? "Win" : "Loss")}
                  </Chip>
                </div>
                {prediction.creator_choice && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-400">Creator Choice:</span>
                    <Chip color="secondary" className="bg-primary/20 capitalize">
                      {prediction.creator_choice}
                    </Chip>
                  </div>
                )}
              </div>

              {/* Market Odds */}
              {choiceOdds.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-lg font-semibold mb-4">Market Odds</h2>
                  <MultiChoiceOddsBar choices={choiceOdds} />
                </div>
              )}

              {/* Order Book */}
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Order Book</h2>
                  <Button
                    color="primary"
                    variant="light"
                    size="sm"
                    className="text-xs"
                  >
                    Refresh
                  </Button>
                </div>
                <div className="space-y-2">
                  {prediction.bets && prediction.bets.map((bet, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-zinc-900">
                      <div className="flex items-center gap-3">
                        <Chip 
                          color={bet.choice.toLowerCase() === "yes" ? "success" : "danger"}
                          size="sm"
                        >
                          {bet.choice}
                        </Chip>
                        <span className="text-sm">{bet.amount} ANML</span>
                      </div>
                      <span className="text-xs text-zinc-400">
                        {formatDateFn(new Date(bet.created_at), "MMM dd, HH:mm")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column - Trading Interface */}
            <div className="lg:col-span-1">
              <div className="sticky top-6">
                <div className="rounded-xl bg-zinc-900 p-6">
                  {/* Buy/Sell Toggle */}
                  <div className="flex gap-2 mb-6">
                    <Button
                      className="flex-1"
                      color={selectedSide === 'buy' ? 'success' : 'default'}
                      variant={selectedSide === 'buy' ? 'solid' : 'bordered'}
                      onPress={() => setSelectedSide('buy')}
                    >
                      Buy
                    </Button>
                    <Button
                      className="flex-1"
                      color={selectedSide === 'sell' ? 'danger' : 'default'}
                      variant={selectedSide === 'sell' ? 'solid' : 'bordered'}
                      onPress={() => setSelectedSide('sell')}
                    >
                      Sell
                    </Button>
                  </div>

                  {/* Amount Input */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium mb-2">Amount</label>
                    <Input
                      type="number"
                      value={betAmount}
                      onChange={(e) => setBetAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="w-full"
                    />
                    <div className="flex gap-2 mt-2">
                      {quickAddAmounts.map((amount) => (
                        <Button
                          key={amount}
                          size="sm"
                          variant="bordered"
                          className="flex-1"
                          onPress={() => setBetAmount(amount.toString())}
                        >
                          +{amount}
                        </Button>
                      ))}
                      <Button
                        size="sm"
                        variant="bordered"
                        className="flex-1"
                        onPress={() => setBetAmount((agent?.wallet_balance || 0).toString())}
                      >
                        Max
                      </Button>
                    </div>
                  </div>

                  {/* Place Order Button */}
                  <Button
                    color={selectedSide === 'buy' ? 'success' : 'danger'}
                    className="w-full"
                    size="lg"
                    onPress={() => setIsModalOpen(true)}
                  >
                    {selectedSide === 'buy' ? 'Buy Yes' : 'Buy No'}
                  </Button>

                  {/* Terms */}
                  <p className="text-xs text-zinc-400 text-center mt-4">
                    By trading, you agree to the Terms of Use
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bet Modal */}
      {choiceList.length > 0 && (
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
          <ModalContent>
            <ModalHeader>Place Bet</ModalHeader>
            <ModalBody>
              <Select
                label="Choice"
                value={selectedChoice}
                onChange={(e) => setSelectedChoice(e.target.value)}
                placeholder="Select a choice"
              >
                {choiceList.map((choice) => (
                  <SelectItem key={choice} value={choice}>
                    {choice}
                  </SelectItem>
                ))}
              </Select>
              <Input
                label="Amount"
                type="number"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                placeholder="Enter bet amount"
              />
              <Textarea
                label="Reason"
                value={betReason}
                onChange={(e) => setBetReason(e.target.value)}
                placeholder="Why are you making this bet?"
              />
            </ModalBody>
            <ModalFooter>
              <Button
                color="danger"
                variant="light"
                onPress={() => setIsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button color="primary" onPress={handleBet}>
                Place Bet
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}
    </div>
  );
} 