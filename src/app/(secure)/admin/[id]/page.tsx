'use client';

import { Card, CardBody } from "@heroui/card";
import { Image } from "@heroui/image";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { useEffect, useState } from "react";
import { useFetch } from "@/app/utils/lib";
import { toast } from "react-hot-toast";
import { useParams, useRouter } from "next/navigation";
import { IBet, PredictionDB } from "@/app/utils/interface";
import { formatDate, format as formatDateFn } from "date-fns";
import { Button } from "@heroui/button";
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
    const [isLoading, setIsLoading] = useState(false);
    const [choiceOdds, setChoiceOdds] = useState<ChoiceOdds[]>([]);
    const [betAmount, setBetAmount] = useState("");
    const [betCount, setBetCount] = useState(0);
    const [choiceList, setChoiceList] = useState<string[]>([]);
    const [selectedChoice, setSelectedChoice] = useState("");
    const [isResolving, setIsResolving] = useState(false);

    // fetch prediction details
    const fetchPredictionDetails = async (id: string) => {
        if (isLoading) {
            return;
        }
        setIsLoading(true);
        try {
            const response = await fetchData.get(`/api/getPrediction/${id}`);
            if (response.status) {
                setPrediction(response.prediction);
                if (response.prediction?.bets) {
                    const betsArray: IBet[] = response.prediction.bets;
                    const choiceTotals = betsArray.reduce((acc, b) => {
                        const lowerChoice = b.choice.toLowerCase();
                        acc[lowerChoice] = (acc[lowerChoice] || 0) + b.amount;
                        return acc;
                    }, {} as Record<string, number>);

                    const totalAmount = Object.values(choiceTotals).reduce(
                        (sum, amount) => sum + amount,
                        0
                    );
                    setBetAmount(totalAmount.toFixed(2));
                    setBetCount(betsArray.length);

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
                setChoiceList(response.prediction.choices);
            } else {
                toast.error(response.message);
            }
        } catch (error) {
            toast.error("Failed to fetch prediction details: " + error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (params.id) {
            fetchPredictionDetails(params.id as string);
        }
    }, [params.id]);

    const handleResolve = async (type: "manual" | "auto") => {
        if (isResolving) {
            return;
        }
        setIsResolving(true);
        let outcome;
        if (type === "manual") {
            if (!selectedChoice) {
                toast.error("Please select a choice");
                return;
            }
            outcome = selectedChoice;
        } else {
            outcome = "";
        }

        const response = await fetchData.post(`/api/admin/resolvePrediction/${params.id}`, {
            outcome,
            type
        });
        if (response.status) {
            toast.success("Prediction resolved successfully");
            fetchPredictionDetails(params.id as string);
        } else {
            toast.error(response.message);
        }
        setIsResolving(false);
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
                    <CardBody className="gap-4 bg-[#2f344e] rounded-lg p-4">
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
                                    <p className="">Details</p>
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
                                                color="primary"
                                                variant="flat"
                                            >
                                                {prediction.status == "awaiting_confirmation" ? "Upcoming" : prediction.status}
                                            </Chip>
                                        </Tooltip>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">Pool</p>
                                        <Tooltip
                                            content={
                                                prediction.status === "open"
                                                    ? "This prediction is still accepting bets!"
                                                    : "Outcome has been decided"
                                            }
                                            showArrow
                                        >
                                            <Chip
                                                color="primary"
                                                variant="flat"
                                            >
                                                {betAmount}
                                            </Chip>
                                        </Tooltip>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">Bets</p>
                                        <Tooltip
                                            content={
                                                prediction.status === "open"
                                                    ? "This prediction is still accepting bets!"
                                                    : "Outcome has been decided"
                                            }
                                            showArrow
                                        >
                                            <Chip
                                                color="primary"
                                                variant="flat"
                                            >
                                                {betCount}
                                            </Chip>
                                        </Tooltip>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">Expire</p>
                                        <Tooltip
                                            content={
                                                prediction.status === "open"
                                                    ? "This prediction is still accepting bets!"
                                                    : "Outcome has been decided"
                                            }
                                            showArrow
                                        >
                                            <Chip
                                                color="primary"
                                                variant="flat"
                                            >
                                                {formatDate(new Date(prediction.resolution_date), "MM/dd/yyyy")}
                                            </Chip>
                                        </Tooltip>
                                    </div>
                                </div>
                                <div>
                                    <div>
                                        <p className="text-sm text-gray-500">Sources</p>
                                        <div>{prediction.source}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Single multi-segment bar with No on left, Combined label center, Yes on right */}
                        {choiceOdds.length > 0 && (
                            <div className="w-full mt-8 space-y-2 bg-[#1d1d22] rounded-lg p-4">
                                <MultiChoiceOddsBar choices={choiceOdds} />
                            </div>
                        )}

                        {/* Resolve Manually */}
                        {
                            prediction.status !== "resolved" ? (
                                <>
                                    <div className="text-lg mt-4">Resolve Manually</div>
                                    <div className="flex flex-row justify-between gap-4 items-center">
                                        <Select className="w-full" onChange={(e) => setSelectedChoice(e.target.value)}>
                                            {choiceList.length > 0 ? choiceList.map((choice) => (
                                                <SelectItem key={choice} value={choice}>
                                                    {choice}
                                                </SelectItem>
                                            )) : <SelectItem value="none">No choices available</SelectItem>}
                                        </Select>
                                        <Button color="primary" isLoading={isResolving} variant="flat" className="w-fit background-gradient text-white" onPress={() => handleResolve("manual")}>Update</Button>
                                    </div>
                                    {/* <Button color="danger" isLoading={isResolving} variant="flat" className="w-full" onPress={() => handleResolve("auto")}>Resolve Automatically</Button> */}
                                </>
                            ) : (
                                <div className="text-lg mt-4">Result: {prediction?.outcome}</div>
                            )
                        }
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
        </>
    );
} 