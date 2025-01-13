'use client';

import { Card, CardBody } from "@nextui-org/card";
import { Image } from "@nextui-org/image";
import { Chip } from "@nextui-org/chip";
import { Spinner } from "@nextui-org/spinner";
import { useEffect, useState } from "react";
import { useFetch } from "@/app/utils/lib";
import { toast } from "react-hot-toast";
import { useParams, useRouter } from "next/navigation";
import { IBet, PredictionDB, IAgentProfile } from "@/app/utils/interface";
import { format as formatDateFn } from "date-fns";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@nextui-org/modal";
import { Button } from "@nextui-org/button";
import { Input, Textarea } from "@nextui-org/input";
import { Select, SelectItem } from "@nextui-org/select";

const MarketOddsBar = ({
    percentage,
    question,
    showOptions = false,
    count,
    odds,
    amount
}: {
    percentage: number,
    question: string,
    showOptions?: boolean,
    count: number,
    odds: string,
    amount: number
}) => {
    const bgColor = percentage >= 90 ? "bg-orange-400/90" :
        percentage >= 80 ? "bg-emerald-400/90" :
            percentage >= 70 ? "bg-blue-400/90" : "bg-red-400/90";

    return (
        <div className="w-full mb-4">
            <div className="relative w-full bg-white/5 rounded-lg overflow-hidden p-4">
                {/* Progress bar */}
                <div className="h-2 w-full bg-white/10 rounded-full mb-3">
                    <div
                        className={`h-full ${bgColor} rounded-full transition-all duration-500`}
                        style={{ width: `${percentage}%` }}
                    />
                </div>

                {/* Content */}
                <div className="flex items-center justify-between">
                    {/* Left side - Question */}
                    <div className="flex-1">
                        <span className="text-sm font-medium text-white">{question}</span>
                    </div>

                    {/* Right side - Stats */}
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col items-end">
                            <span className="text-xs text-white/60">Probability</span>
                            <span className="text-sm font-bold text-white">{percentage}%</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-xs text-white/60">Odds</span>
                            <span className="text-sm font-bold text-white">{odds}x</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-xs text-white/60">Bets</span>
                            <span className="text-sm font-bold text-white">{count}</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-xs text-white/60">Total</span>
                            <span className="text-sm font-bold text-white">{amount}</span>
                        </div>

                        {showOptions && (
                            <div className="flex gap-2 ml-4">
                                <button className="px-3 py-1.5 bg-white/90 text-black rounded-md text-sm font-medium hover:bg-white transition-colors">
                                    Yes
                                </button>
                                <button className="px-3 py-1.5 bg-white/90 text-black rounded-md text-sm font-medium hover:bg-white transition-colors">
                                    No
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function PredictionDetail() {
    const params = useParams();
    const fetchData = useFetch();
    const router = useRouter();

    // Local state
    const [prediction, setPrediction] = useState<PredictionDB | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [choiceOdds, setChoiceOdds] = useState<{ choice: string, amount: number, odds: string, percentage: string, count: number }[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedChoice, setSelectedChoice] = useState("");
    const [betAmount, setBetAmount] = useState("");
    const [betReason, setBetReason] = useState("");
    const [choiceList, setChoiceList] = useState<string[]>([]);
    const [agent, setAgent] = useState<IAgentProfile | null>(null);

    const fetchAgentProfile = async () => {
        try {
            const response = await fetchData.get('/api/getAgentProfile');
            if (response.status) {
                setAgent(response.agent);
            } else {
                toast.error(response.message);
            }
            fetchPredictionDetails(params.id as string, response.agent.category);
        } catch (error) {
            console.log(error);
            toast.error('Failed to fetch agent profile');
        }
    };

    // Call both fetches
    const fetchPredictionDetails = async (id: string, category: string) => {
        try {
            const response = await fetchData.get(`/api/getPrediction/${id}`);
            if (response.status) {
                setPrediction(response.prediction);
                if (response.prediction?.bets) {
                    const betsArray: IBet[] = response.prediction.bets;
                    const choiceTotals = betsArray.reduce((acc, b) => {
                        acc[b.choice] = (acc[b.choice] || 0) + b.amount;
                        return acc;
                    }, {} as Record<string, number>) || {};

                    const totalAmount = Object.values(choiceTotals).reduce((sum, amount) => sum + amount, 0);

                    // Calculate odds for each choice
                    const choiceOdds = Object.entries(choiceTotals).map(([choice, amount]) => {
                        const percentage = totalAmount > 0 ? (amount / totalAmount) * 100 : 0;
                        const odds = percentage > 0 ? (100 / percentage).toFixed(2) : "∞";
                        return {
                            choice,
                            amount,
                            odds,
                            percentage: percentage.toFixed(1),
                            count: betsArray.filter(bet => bet.choice === choice).length
                        };
                    });
                    setChoiceOdds(choiceOdds);
                }

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
                let interest = response.prediction.source == source;
                if (source == "sportDB" && interest) {
                    if (category == "nba") {
                        interest = response.prediction.league_id == 4387;
                    } else if (category == "nfl") {
                        interest = response.prediction.league_id == 4391;
                    } else if (category == "english premier league") {
                        interest = response.prediction.league_id == 4328;
                    } else if (category == "soccer") {
                        interest = response.prediction.league_id != 4387 && response.prediction.league_id != 4391;
                    }
                }
                if (interest) {
                    if (response.prediction.source !== "sportDB") {
                        setChoiceList(["yes", "no"]);
                    } else {
                        if (response.prediction.league_id == "4391" || response.prediction.league_id == "4387") {
                            setChoiceList([response.prediction.team_a, response.prediction.team_b]);
                        } else {
                            setChoiceList([response.prediction.team_a, response.prediction.team_b, "Draw"]);
                        }
                    }
                }
            } else {
                toast.error(response.message);
            }
        } catch (error) {
            toast.error("Failed to fetch prediction details: " + error);
        } finally {
            setIsLoading(false);
        }
    };

    // Call both fetches
    useEffect(() => {
        if (params.id) {
            fetchAgentProfile();
        }
    }, [params.id]);

    // Add this function to handle betting
    const handleBet = async () => {
        try {
            if (!agent?.wallet_balance || agent?.wallet_balance < Number(betAmount)) {
                toast.error("Insufficient balance");
                return;
            }

            if (selectedChoice == "") {
                toast.error("Please select a choice");
                return;
            }

            if (Number(betAmount) <= 0) {
                toast.error("Bet amount must be greater than 0");
                return;
            }

            if (betReason == "") {
                toast.error("Please enter a reason for your bet");
                return;
            }

            const response = await fetchData.post(`/api/placeBet`, {
                predictionId: params.id,
                choice: selectedChoice,
                amount: Number(betAmount),
                reason: betReason
            });

            if (response.status) {
                toast.success("Bet placed successfully!");
                setIsModalOpen(false);
                // Refresh prediction details
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
                className="mb-4 text-small p-0 border-none text-default-400 hover:text-white"
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
                                    <h1 className="text-2xl font-bold mb-2">{prediction.description}</h1>
                                    <p className="text-gray-500">Source: {prediction.source}</p>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div>
                                        <p className="text-sm text-gray-500">Status</p>
                                        <Chip
                                            color={prediction.status === "open" ? "primary" : "secondary"}
                                            variant="flat"
                                        >
                                            {prediction.status === "open"
                                                ? "Open"
                                                : prediction.outcome === prediction.creator_choice
                                                    ? "Win"
                                                    : "Loss"}
                                        </Chip>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">Creator Choice</p>
                                        <p className="font-semibold">{prediction.creator_choice}</p>
                                    </div>
                                    {
                                        choiceList.length > 0 && (
                                            <Button
                                                className="ml-auto block"
                                                color="primary"
                                                onPress={() => setIsModalOpen(true)}
                                            >
                                                Place Bet
                                            </Button>
                                        )
                                    }
                                </div>
                            </div>
                        </div>
                    </CardBody>
                </Card>

                {choiceOdds.length > 0 && (
                    <div className="w-full mt-8 space-y-2">
                        <h2 className="text-lg font-semibold mb-4">Market Odds</h2>
                        {choiceOdds.map((choice) => (
                            <div key={choice.choice}>
                                <MarketOddsBar
                                    percentage={parseFloat(choice.percentage)}
                                    question={choice.choice}
                                    count={choice.count}
                                    odds={choice.odds}
                                    amount={choice.amount}
                                />
                            </div>
                        ))}
                    </div>
                )}

                {/* Prediction Timeline */}
                <div className="space-y-4 mt-8">
                    <h2 className="text-xl font-bold">Prediction Timeline</h2>
                    {prediction.bets && prediction.bets.length > 0 ? (
                        prediction.bets.map((bet, index) => (
                            <Card key={index}>
                                <CardBody>
                                    <div className="flex justify-between items-start gap-4">
                                        <div className="flex-1">
                                            <p className="font-medium">{bet.choice}</p>
                                            <p className="text-sm text-gray-500 mt-1">{bet.reason}</p>
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
                        ))
                    ) : (
                        <p className="text-default-400">No bets have been placed on this prediction.</p>
                    )}
                </div>
            </div>

            {/* Add Modal */}
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
                                    <SelectItem key={choice} value={choice}>{choice}</SelectItem>
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
                            <Button color="danger" variant="light" onPress={() => setIsModalOpen(false)}>
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