'use client'

import { Chip } from "@nextui-org/chip";
import { Image } from "@nextui-org/image";
import { Button } from "@nextui-org/button";
import { Tooltip } from "@nextui-org/tooltip";
import { useState, useEffect } from "react";
import { useFetch } from "@/app/utils/lib";
import { IBet, PredictionDB } from "@/app/utils/interface";
import toast from "react-hot-toast";
import { useParams, useRouter } from "next/navigation";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@nextui-org/react";
import {
    Chart as ChartJS,
    BarElement,
    CategoryScale,
    LinearScale,
    Title,
    Legend,
} from "chart.js";

ChartJS.register(
    BarElement,
    CategoryScale,
    LinearScale,
    Title,
    Legend
);

interface PineconeMetadata {
    [key: string]: string | number | boolean | object;
}

interface PineconeData {
    metadata?: PineconeMetadata;
}

interface BetData {
    id: number;
    agent_id: number;
    amount: number;
    choice: string;
    reason: string;
    pinecone_id: string;
    created_at: string;
}

interface AnalysisLog {
    step: string;
    reasoning?: string;
}

const parseLogEntries = (logString: string) => {
    return logString.split('\n').map(entry => {
        const match = entry.match(/\[(.*?)\] (.*)/);
        if (match) {
            return {
                timestamp: match[1],
                message: match[2]
            };
        }
        return null;
    }).filter(Boolean);
};

interface ChoiceOdds {
    choice: string;
    percentage: string;  // e.g., "45.0" for 45.0%
    amount: number;
    count: number;
    odds: string;
}

interface MultiChoiceOddsBarProps {
    choices: ChoiceOdds[  ]; // e.g., an array of "Yes"/"No"/"Draw"
}

const MultiChoiceOddsBar = ({ choices }: MultiChoiceOddsBarProps) => {
    // Accumulator to position each segment's left offset
    let accumulated = 0;

    return (
        <div className="w-full mb-4">
            <div className="relative w-full bg-white/5 rounded-lg overflow-hidden p-4">
                {/* Single combined bar */}
                <div className="h-2 w-full bg-white/10 rounded-full mb-3 relative overflow-hidden">
                    {choices.map(c => {
                        // Decide a color style for each choice
                        let segmentColor = "bg-orange-400/90";
                        if (c.choice.toLowerCase() === "yes") {
                            segmentColor = "bg-emerald-400/90";
                        } else if (c.choice.toLowerCase() === "no") {
                            segmentColor = "bg-red-400/90";
                        } else if (c.choice.toLowerCase() === "draw") {
                            segmentColor = "bg-yellow-400/90";
                        }

                        const widthFraction = parseFloat(c.percentage);
                        const style = {
                            left: `${accumulated}%`,
                            width: `${widthFraction}%`,
                        };

                        // Update the accumulated offset for the next segment
                        accumulated += widthFraction;

                        const tooltipContent = `${c.choice[0]?.toUpperCase() + c.choice.slice(1)}: ${c.percentage}% (${c.odds}) | Bets: ${c.count}`;

                        return (
                            <Tooltip 
                                key={c.choice}
                                content={tooltipContent}
                                showArrow
                                placement="top"
                                color="primary"
                            >
                                <div
                                    className={`absolute top-0 bottom-0 ${segmentColor} transition-all duration-300 cursor-pointer`}
                                    style={style}
                                />
                            </Tooltip>
                        );
                    })}
                </div>

                {/* Below the progress bar, show details */}
                <div className="flex items-center justify-between">
                    <div className="text-sm text-white/60">
                        {/* Could show "Yes / No / Draw" or any other info */}
                        Combined Odds
                    </div>
                    <div className="flex items-center gap-4">
                        {choices.map((c) => (
                            <div key={c.choice} className="flex flex-col items-end">
                                <span className="text-xs text-white/60">{c.choice}</span>
                                <span className="text-sm font-bold text-white">
                                    {c.percentage}%
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function BetDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [bet, setBet] = useState<IBet | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [pineconeData, setPineconeData] = useState<PineconeData | null>(null);
    const [prediction, setPrediction] = useState<PredictionDB | null>(null);
    const [showCommentModal, setShowCommentModal] = useState(false);
    const [newComment, setNewComment] = useState("");
    const fetch = useFetch();
    const [choiceOdds, setChoiceOdds] = useState<{ choice: string, amount: number, odds: string, percentage: string, count: number }[]>([]);

    const handleSaveComment = async () => {
        try {
            const response = await fetch.post("/api/getBet", {
                id: params.id,
                comment: newComment
            });
            if (response.status) {
                setPineconeData(response.vector);
                setNewComment(""); // Clear input
                setShowCommentModal(false);
                toast.success("Comment updated successfully!");
            } else {
                toast.error(response.message);
            }
        } catch (error) {
            console.error("Error saving comment:", error);
            toast.error("Failed to save comment");
        }
    };

    const fetchBetDetails = async () => {
        try {
            const response = await fetch.get(`/api/getBet?id=${params.id}`);
            if (response.status) {
                setBet(response.bet);
                if (response.bet.pinecone_id) {
                    setPineconeData(response.vector);
                }
                setPrediction(response.prediction);
                // Parse the bets string and calculate totals
                if (response.prediction?.bets) {
                    const betsArray: BetData[] = response.prediction.bets;
                    
                    // Filter or just calculate totals for yes and no 
                    const choiceTotals = betsArray.reduce((acc, b) => {
                        // Only track yes/no (or yes/no/draw if you prefer)
                        const lowered = b.choice.toLowerCase();
                        if (lowered === "yes" || lowered === "no") {
                            acc[lowered] = (acc[lowered] || 0) + b.amount;
                        }
                        return acc;
                    }, {} as Record<string, number>);

                    const totalAmount = Object.values(choiceTotals).reduce((sum, amount) => sum + amount, 0);

                    const newChoiceOdds = Object.entries(choiceTotals).map(([choice, amount]) => {
                        const percentage = totalAmount > 0 ? (amount / totalAmount) * 100 : 0;
                        const odds = percentage > 0 ? (100 / percentage).toFixed(2) : "∞";
                        return {
                            choice,
                            amount,
                            odds,
                            percentage: percentage.toFixed(1),
                            count: betsArray.filter(bet => bet.choice.toLowerCase() === choice).length
                        };
                    });

                    // This newChoiceOdds will have two entries: one for 'yes', one for 'no'
                    setChoiceOdds(newChoiceOdds);
                }
            } else {
                toast.error(response.message);
            }
            setIsLoading(false);
        } catch (error) {
            console.error('Failed to fetch bet details:', error);
            setIsLoading(false);
        }
    };

    useEffect(() => {
        // Call both in the same effect
        fetchBetDetails();
    }, [params.id]);

    if (isLoading) {
        return <div>Loading...</div>;
    }

    return (
        <>
            <Button
                color="default"
                variant="light"
                onPress={() => router.back()}
                className="mb-4 text-small p-0 bg-content0"
            >
                ← Back
            </Button>

            {
                !bet ?
                    <div>Bet not found</div> :
                    <>
                        <div className="px-0 max-w-[800px]">
                            {/* Header Section */}
                            <div className="flex gap-6 mb-8 flex-col w-full bg-content0 rounded-xl p-8">
                                <Image
                                    src={prediction?.str_thumb}
                                    alt="Event"
                                    className="w-full object-cover rounded-xl "
                                    style={{ maxWidth: "100%", minWidth: "-webkit-fill-available;", height: "200px" }}
                                />

                                <div>
                                    <h3 className="text-lg font-semibold mb-2">{bet.description}</h3>
                                </div>

                                {choiceOdds.length > 0 && (
                                    
                                        <MultiChoiceOddsBar choices={choiceOdds} />
                               
                                )}

                                {/* Bet Details */}
                                <div className="color-white">
                                    {
                                        bet.user_id === Number(localStorage.getItem("userId")) &&
                                        <div className="p-4 border border-white/10 rounded-lg">
                                            <h2 className="text-lg font-semibold mb-4">Reasoning</h2>
                                            <p className="text-default-400 leading-relaxed ">{bet.reason}</p>
                                            {
                                                pineconeData && pineconeData.metadata?.comment && (
                                                    <>
                                                        <h2 className="text-lg font-semibold mb-4 mt-4">Comment</h2>
                                                        <p className="text-default-400 leading-relaxed ">{pineconeData.metadata.comment as string}</p>
                                                    </>
                                                )
                                            }
                                            <Button
                                                color="primary"
                                                variant="light"
                                                className="text-primary bg-primary/20 text-sm mt-2 hover:bg-primary hover:text-white"
                                                onPress={() => setShowCommentModal(true)}
                                            > Adjust Reasoning
                                            </Button>
                                        </div>
                                    }
                                    <div className="w-full mt-8">
                                        <h2 className="text-lg font-semibold mb-4">Bet Details</h2>
                                        <div className="grid grid-cols-2 grid-rows-4 md:grid-cols-4 md:grid-rows-2 gap-4">
                                            <div>
                                                <h3 className="text-sm font-medium text-default-400 mb-1 ">Status</h3>
                                                <Tooltip
                                                    content={
                                                        bet.status === "open"
                                                            ? "Currently open for betting"
                                                            : bet.outcome === bet.choice
                                                            ? "You won this bet!"
                                                            : "You lost this bet."
                                                    }
                                                    color="primary"
                                                    showArrow
                                                    placement="top-start"
                                                >
                                                    <Chip color={bet.status !== "open" ? (bet.outcome === bet.choice ? "success" : "danger") : "primary"} className="bg-primary/20">
                                                        {bet.status !== "open"
                                                            ? (bet.outcome === bet.choice ? "Won" : "Lost")
                                                            : bet.status
                                                        }
                                                    </Chip>
                                                </Tooltip>
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-medium text-default-400 mb-1">Credits</h3>
                                                <p className="text-sm font-semibold"><span className=" inline-block ">{bet.amount}</span></p>
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-medium text-default-400 mb-1">Your Choice</h3>
                                                <Tooltip
                                                    content={`This was your bet choice: "${bet.choice}"`}
                                                    color="primary"
                                                    showArrow
                                                    placement="top-start"
                                                >
                                                    <Chip color="secondary" className="bg-primary/20 capitalize">{bet.choice}</Chip>
                                                </Tooltip>
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-medium text-default-400 mb-1">Creator&apos;s Choice</h3>
                                                <Tooltip
                                                    content={`The creator predicted: "${
                                                        prediction?.creator_choice
                                                    }"`}
                                                    color="primary"
                                                    showArrow
                                                    placement="top-start"
                                                >
                                                    <Chip color="secondary" className="bg-primary/20 capitalize">{prediction?.creator_choice}</Chip>
                                                </Tooltip>
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-medium text-default-400 mb-1">Validation Source</h3>
                                                <Tooltip
                                                    content={`The outcome is validated by: ${bet.source}`}
                                                    color="primary"
                                                    showArrow
                                                    placement="top-start"
                                                >
                                                    <p className="text-sm font-semibold">{bet.source}</p>
                                                </Tooltip>
                                            </div>

                                            <div className="flex flex-col gap-1">
                                                {bet.status === "open" ? (
                                                    <>
                                                        <h3 className="text-sm font-medium text-default-400">Created</h3>
                                                        <Tooltip
                                                            content="Bet created date"
                                                            color="primary"
                                                            showArrow
                                                            placement="top-start"
                                                        >
                                                            <p className="text-sm font-semibold">{new Date(bet.created_at).toLocaleDateString()}</p>
                                                        </Tooltip>
                                                    </>
                                                ) : (
                                                    <>
                                                        <h3 className="text-sm font-medium text-default-400">Resolved</h3>
                                                        <Tooltip
                                                            content="Bet resolution date"
                                                            color="primary"
                                                            showArrow
                                                            placement="top-start"
                                                        >
                                                            <p className="text-sm font-semibold">{new Date(bet.resolution_date).toLocaleDateString()}</p>
                                                        </Tooltip>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {prediction?.log && (
                                <div className="mt-8">
                                    <div className="bg-content0 rounded-lg p-8">
                                        <h2 className="text-xl font-semibold mb-4">Resolution Log</h2>
                                        <div className="space-y-4">
                                            {parseLogEntries(prediction.log).map((entry, index) => (
                                                <div key={index} className="flex flex-col gap-1">
                                                    <span className="text-primary text-sm">
                                                        {new Date(entry?.timestamp || "").toLocaleString()}
                                                    </span>
                                                    <span className="text-default-600">
                                                        {entry?.message}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div className="mt-8">
                                {pineconeData && (
                                    <div className="mt-0">
                                        <div className="bg-content0 rounded-lg p-8 ">
                                            <div className="flex flex-col gap-4">
                                                <h2 className="text-xl font-semibold mb-4">Reasoning Log</h2>
                                                {Object.entries(pineconeData.metadata || {}).map(([key, value]) => {
                                                    return (
                                                        (key != "agent_id" && key != "choice" && key != "amount" && key != "created_at" && key != "prediction_id" && key != "log" && key != "reasoning") ? (
                                                            <div key={key}>
                                                                <h3 className="text-sm font-medium text-default-400 capitalize mb-1">
                                                                    {key.replace(/_/g, ' ')}
                                                                </h3>
                                                                <p className="text-sm text-default-600">
                                                                    {typeof value === 'string' ? value : JSON.stringify(value)}
                                                                </p>
                                                            </div>
                                                        ) : (
                                                            key === "log" ? (
                                                                <div key={key} className="space-y-4">
                                                                    <div className="space-y-4">
                                                                        {JSON.parse(value as string).map((log: AnalysisLog, index: number) => (
                                                                            <div
                                                                                key={`${log.step}-${index}`}
                                                                                className=""
                                                                            >
                                                                                <div className="flex items-center gap-2 mb-2">
                                                                                    <span className="text-primary font-medium">
                                                                                        Step {index + 1}:
                                                                                    </span>
                                                                                    <span className="text-default-400 capitalize">
                                                                                        {log.step.replace(/_/g, ' ')}
                                                                                    </span>
                                                                                </div>
                                                                                {log.reasoning && (
                                                                                    <p className="text-default-600 text-sm leading-relaxed">
                                                                                        {log.reasoning}
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                ""
                                                            )
                                                        )
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <Modal
                            isOpen={showCommentModal}
                            onOpenChange={(open) => setShowCommentModal(open)}
                        >
                            <ModalContent className="w-full max-w-[640px] min-h-[500px]">
                                <ModalHeader>
                                    <h3 className="font-bold">Add Comment to Agent Reasoning</h3>
                                </ModalHeader>
                                <ModalBody>
                                    <p className="text-base text-gray-500 mb-2">
                                        Original Reason: {bet.reason}
                                    </p>
                                    <p className="text-base text-gray-500 mb-2">
                                        Comment: {pineconeData?.metadata?.comment as string}
                                    </p>
                                    <textarea
                                        className="w-full border border-white/10 text-white rounded-md p-2"
                                        placeholder="Enter more context here..."
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        rows={4}
                                    />
                                </ModalBody>
                                <ModalFooter>
                                    <Button variant="light" onPress={() => setShowCommentModal(false)}>
                                        Cancel
                                    </Button>
                                    <Button color="primary" onPress={handleSaveComment}>
                                        Save Comment
                                    </Button>
                                </ModalFooter>
                            </ModalContent>
                        </Modal>
                    </>
            }
        </>
    );
} 