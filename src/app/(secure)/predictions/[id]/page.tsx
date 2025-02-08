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
  const [betAmount, setBetAmount] = useState("");
  const [betReason, setBetReason] = useState("");
  const [choiceList, setChoiceList] = useState<string[]>([]);
  const [agent, setAgent] = useState<IAgentProfile | null>(null);

  // Fetch agent profile
  const fetchAgentProfile = async () => {
    const response = await fetch("/api/getAgentProfile");
    if (!response.ok) {
      toast.error("Failed to fetch agent profile");
    }
    const data = await response.json();
    if (data.status) {
      setAgent(data.agent);
    }
    fetchPredictionDetails(params.id as string, data?.agent?.category || "");
  };

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
    <>
      <button
        onClick={() => router.back()}
        className="mb-4 text-small p-0 border-none text-gray-500 hover:text-white"
      >
        ← Back
      </button>

      {/* Prediction Detail */}
      <div className="max-w-[800px]">
        <Card className="mb-6">
          <CardBody className="gap-4">
            <div className="flex items-start gap-4 flex-col md:flex-col object-cover">
              <Image
                src={prediction.str_thumb}
                alt={prediction.description}
                className="rounded-lg w-full max-h-[200px] object-cover"
              />
              <div className="space-y-4 flex-1">
                <div>
                  <h1 className="text-2xl font-bold mb-2">
                    {prediction.description}
                  </h1>
                  <p className="text-gray-500">Source: {prediction.source}</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <Tooltip
                      content={
                        prediction.status === "open"
                          ? "This prediction is still accepting bets!"
                          : "Outcome has been decided"
                      }
                      showArrow
                    >
                      <Chip
                        color={
                          prediction.status === "open" ? "primary" : "danger"
                        }
                        variant="flat"
                      >
                        {prediction.status === "open"
                          ? "Open"
                          : prediction.outcome.toLowerCase() ===
                            prediction.creator_choice.toLowerCase()
                            ? "Win"
                            : "Loss"}
                      </Chip>
                    </Tooltip>
                  </div>
                  {prediction.creator_choice && (
                    <div>
                      <p className="text-sm text-gray-500">Creator Choice</p>
                      <p className="font-semibold capitalize">
                        {prediction.creator_choice}

                      </p>
                    </div>
                  )}
                  {agent && choiceList.length > 0 && prediction.status === "open" && (
                    <Button
                      className="ml-auto block"

                      color="primary"
                      onPress={() => setIsModalOpen(true)}
                    >
                      Place Bet
                    </Button>
                  )}
                </div>
              </div>
            </div>


            {/* Single multi-segment bar with No on left, Combined label center, Yes on right */}
            {choiceOdds.length > 0 && (
              <div className="w-full mt-8 space-y-2">
                <h2 className="text-lg font-semibold mb-4">Market Odds</h2>
                <MultiChoiceOddsBar choices={choiceOdds} />
              </div>
            )}

          </CardBody>
        </Card>

        {/* Prediction Timeline */}
        <div className="space-y-4 mt-8">
          <h2 className="text-xl font-bold">Prediction Timeline</h2>
          {prediction.bets && prediction.bets.length > 0 ? (
            prediction.bets.map((bet, index) => {
              const timelineTooltip = `Bet #${index + 1} | Amount: ${bet.amount
                } | Choice: ${bet.choice}`;
              return (
                <Tooltip
                  key={index}
                  content={timelineTooltip}
                  showArrow
                  offset={10}
                  placement="top-start"
                >
                  <Card>
                    <CardBody>
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <p className="font-medium">{bet.choice}</p>
                          <p className="text-sm text-gray-500 mt-1">
                            {bet.reason}
                          </p>
                          {bet.agent_id && (
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <Chip size="sm" variant="flat">
                                Agent: {bet.agent_id}
                              </Chip>
                            </div>
                          )}
                        </div>
                        <span className="text-sm text-gray-500 whitespace-nowrap">
                          {bet.created_at
                            ? formatDateFn(new Date(bet.created_at), "MM/dd/yyyy HH:mm")
                            : ""}
                        </span>
                      </div>
                    </CardBody>
                  </Card>
                </Tooltip>
              );
            })
          ) : (
            <p className="text-gray-500">
              No bets have been placed on this prediction.
            </p>
          )}
        </div>
      </div>

      {/* Bet modal */}
      {choiceList.length > 0 && (
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
          <ModalContent>
            <ModalHeader>Place Bet on {selectedChoice}</ModalHeader>
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
    </>
  );
} 