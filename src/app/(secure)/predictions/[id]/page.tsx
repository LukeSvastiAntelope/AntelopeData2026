'use client';

import { Card, CardBody } from "@nextui-org/card";
import { Image } from "@nextui-org/image";
import { Chip } from "@nextui-org/chip";
import { Spinner } from "@nextui-org/spinner";
import { useEffect, useState } from "react";
import { useFetch } from "@/app/utils/lib";
import { toast } from "react-hot-toast";
import { useParams, useRouter } from "next/navigation";
import { IBet, PredictionDB } from "@/app/utils/interface";
import { format as formatDateFn } from "date-fns";

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

    // Call both fetches
    const fetchPredictionDetails = async (id: string) => {
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
        const id = Array.isArray(params.id) ? params.id[0] : params.id;
        if (params.id) {
            fetchPredictionDetails(id);
        }
    }, [params.id]);


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
                                </div>
                            </div>
                        </div>
                    </CardBody>
                </Card>

                {choiceOdds.length > 0 && (
                    <div className="w-full mt-8 space-y-2">
                        <h2 className="text-lg font-semibold mb-4">Market Odds</h2>
                        {choiceOdds.map((choice) => (
                            <MarketOddsBar
                                key={choice.choice}
                                percentage={parseFloat(choice.percentage)}
                                question={choice.choice}
                                count={choice.count}
                                odds={choice.odds}
                                amount={choice.amount}
                            />
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
        </>
    );
} 