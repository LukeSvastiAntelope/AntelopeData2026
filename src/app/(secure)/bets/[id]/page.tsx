'use client'

import { Chip } from "@heroui/chip";
import { Image } from "@heroui/image";
import { Button } from "@heroui/button";
import { useState, useEffect } from "react";
import { useFetch } from "@/app/utils/lib";
import { IBet, PredictionDB } from "@/app/utils/interface";
import toast from "react-hot-toast";
import { useParams, useRouter } from "next/navigation";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import {
    Chart as ChartJS,
    BarElement,
    CategoryScale,
    LinearScale,
    Title,
    Tooltip,
    Legend,
} from "chart.js";
import { Tooltip as NextUITooltip } from "@heroui/tooltip";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardBody } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import { Link2, Bookmark, ArrowUpRight, CircleEllipsis } from "lucide-react";
import { format as formatDateFn } from "date-fns";
import { Badge } from "@heroui/badge";

ChartJS.register(
    BarElement,
    CategoryScale,
    LinearScale,
    Title,
    Tooltip,
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

interface LogEntry {
    timestamp: string;
    message: string;
}

const parseLogEntries = (logString: string): LogEntry[] => {
    try {
        // First try to parse as JSON
        if (logString.startsWith('[') || logString.startsWith('{')) {
            try {
                const parsed = JSON.parse(logString);
                if (Array.isArray(parsed)) {
                    return parsed;
                }
            } catch (e) {
                console.log('Failed to parse JSON log:', e);
            }
        }

        // Fall back to parsing line by line format
        return logString.split('\n')
            .map(entry => {
                const match = entry.match(/\[(.*?)\] (.*)/);
                if (match) {
                    return {
                        timestamp: match[1],
                        message: match[2]
                    };
                }
                return null;
            })
            .filter((entry): entry is LogEntry => entry !== null);
    } catch (e) {
        console.error('Error parsing log entries:', e);
        return [];
    }
};

interface ChoiceOdds {
    choice: string;
    percentage: string;
    amount: number;
    count: number;
    odds: string;
}

function MultiChoiceOddsBar({ choices }: { choices: ChoiceOdds[] }) {
    const noObj = choices.find((c) => c.choice.toLowerCase() === "no");
    const yesObj = choices.find((c) => c.choice.toLowerCase() === "yes");

    let accumulated = 0;

    return (
        <div className="w-full mb-4">
            <div className="relative w-full bg-white/5 rounded-lg overflow-hidden p-4">
                <div className="text-sm text-white/60 w-full text-center mb-2">Combined Odds</div>
                {/* Single combined bar segments */}
                <div className="h-2 w-full bg-white/10 rounded-full mb-3 relative overflow-hidden">
                    {choices.map((c) => {
                        let segmentColor = "bg-orange-400/90";
                        if (c.choice.toLowerCase() === "yes") {

                            segmentColor = "bg-success";
                        } else if (c.choice.toLowerCase() === "no") {
                            segmentColor = "bg-danger";
                        } else if (c.choice.toLowerCase() === "draw") {
                            segmentColor = "bg-warning";
                        }

                        const widthFraction = parseFloat(c.percentage);
                        const style = {
                            left: `${accumulated}%`,
                            width: `${widthFraction}%`,
                        };
                        accumulated += widthFraction;

                        // Define tooltip content
                        const tooltipContent = `${c.choice[0]?.toUpperCase() + c.choice.slice(1)
                            }: ${c.percentage}% (x${c.odds}) | Bets: ${c.count}`;

                        return (
                            <NextUITooltip
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
                            </NextUITooltip>
                        );
                    })}
                </div>

                {/* Below the bar — No (left), Combined Odds (center), Yes (right) */}
                <div className="flex items-center justify-between">

                    {/* LEFT: No */}
                    <div className="flex flex-col items-start text-white icon-thumbs-down">

                        <span className="text-sm font-bold text-white pr-1 ">
                            {noObj ? `${noObj.percentage}% (x${noObj.odds})` : "0% (x∞)"}
                        </span>
                    </div>
                    {/* MIDDLE: Combined Odds */}

                    {/* RIGHT: Yes */}
                    <div className="flex flex-col items-end text-white">

                        <span className="text-sm font-bold text-white icon-thumbs-up">
                            {yesObj ? `${yesObj.percentage}% (x${yesObj.odds})` : "0% (x∞)"}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

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
                    const choiceTotals = betsArray.reduce((acc, b) => {
                        acc[b.choice.toLowerCase()] = (acc[b.choice.toLowerCase()] || 0) + b.amount;
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
            setIsLoading(false);
        } catch (error) {
            console.error('Failed to fetch bet details:', error);
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchBetDetails();
    }, [params.id]);

    if (isLoading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <Spinner size="lg" />
            </div>
        );
    }

    if (!bet) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <p>Bet not found</p>
            </div>
        );
    }

    return (
        <div className="flex-1 p-2 w-full">
            <div className="mx-auto rounded-lg bg-black text-card-foreground shadow-lg">
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
                                variant="bordered"
                                className="text-zinc-400 hover:text-zinc-100"
                                onPress={() => setShowCommentModal(true)}
                            >
                                <span className="mr-2">Adjust Reasoning</span>
                                <CircleEllipsis className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="light"
                                className="text-zinc-400 hover:text-zinc-100"
                                onPress={() => router.push(`/predictions/${prediction?.id}`)}
                            >
                                <span className="mr-2">View Prediction</span>
                                <ArrowUpRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
                
                <div className="border-b border-zinc-800" />

                <div className="p-6">
                    <div className="max-w-[800px] mx-auto">
                        {/* Event Image */}
                        <Image
                            src={bet.str_thumb || prediction?.str_thumb}
                            alt="Event"
                            className="w-full object-cover rounded-xl mb-6"
                            style={{ height: "300px" }}
                        />

                        {/* Title and Source */}
                        <div className="mb-6">
                            <h1 className="text-xl font-semibold mb-2">{prediction?.description}</h1>
                            <div className="flex items-center gap-2">
                                <Badge variant="flat" className="border-violet-500 text-violet-500">
                                    {prediction?.source}
                                </Badge>
                                <div className="h-4 border-l border-zinc-800" />
                                <p className="text-sm text-zinc-400">Created {formatDateFn(new Date(prediction?.created_at || ''), "PPP")}</p>
                            </div>
                        </div>

                        

                        {/* Bet Details */}
                        <div className="mb-8 p-6 border rounded-lg">
                            <h2 className="text-lg font-semibold mb-4">Bet Details</h2>
                            <div className="space-y-4">
                                {/* First Row */}
                                <div className="grid grid-cols-4 gap-4">
                                    <div>
                                        <p className="text-sm text-zinc-400">Status</p>
                                        <div className="mt-1">
                                            <Chip 
                                                color={bet.status !== "open" ? (bet.outcome === bet.choice ? "success" : "danger") : "primary"}
                                            >
                                                {bet.status !== "open" ? (bet.outcome === bet.choice ? "Won" : "Lost") : "Open"}
                                            </Chip>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-sm text-zinc-400">Credits</p>
                                        <p className="mt-1 text-lg">{bet.amount} ANML</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-zinc-400">Your Choice</p>
                                        <div className="mt-1">
                                            <Chip 
                                                color={bet.choice.toLowerCase() === "yes" ? "success" : "danger"}
                                            >
                                                {bet.choice}
                                            </Chip>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-sm text-zinc-400">Creator&apos;s Choice</p>
                                        <div className="mt-1">
                                            <Chip 
                                                color={prediction?.creator_choice?.toLowerCase() === "yes" ? "success" : "danger"}
                                            >
                                                {prediction?.creator_choice || bet.choice}
                                            </Chip>
                                        </div>
                                    </div>
                                </div>

                                

                                {/* Second Row */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-sm text-zinc-400">Validation Source</p>
                                        <p className="mt-1">{prediction?.source || 'google_news'}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-zinc-400">Created</p>
                                        <p className="mt-1">{formatDateFn(new Date(bet.created_at), "MM/dd/yyyy")}</p>
                                    </div>
                                </div>

                                
                            </div>
                        </div>

                      

                        {/* Reasoning Section */}
                        <div className="mt-8 p-6 border rounded-lg">

                       
                                        <h3 className="text-lg font-semibold">Reasoning</h3>
                                       
                           

                              {/* Market Odds */}
                        {choiceOdds.length > 0 && (
                            <div className="mb-8 ">
                                <MultiChoiceOddsBar choices={choiceOdds} />
                            </div>
                            
                        )}
                                    
                                    <Card className="p-0">
                                   
                                        <CardBody className="p-0">
                                            <div className="space-y-4 p-0">
                                                <div>
                                                    <p className="text-sm text-zinc-400 mb-2">Initial Reasoning</p>
                                                    <p className="text-zinc-300 p-0">{bet.reason}</p>
                                                </div>
                                                {pineconeData?.metadata?.comment && (
                                                    <div>
                                                        <p className="text-sm text-zinc-400 mb-2">Additional Comment</p>
                                                        <p className="text-zinc-300">{pineconeData.metadata.comment as string}</p>
                                                    </div>
                                                )}
                                            </div>
                                            <Button
                                            variant='solid'
                                            color="default"
                                            size="md"
                                            className="bg-white text-zinc-900 hover:bg-zinc-100 rounded-sm mt-8"
                                            onPress={() => setShowCommentModal(true)}
                                        >
                                            Adjust Reasoning
                                        </Button>
                                        </CardBody>
                                        {/* Button to adjust reasoning white background dark text*/}
                                       
                                    </Card>
                                </div>

                        

                        {/* Agent's Reasoning Steps */}
                        {bet.agent_id && pineconeData?.metadata?.log && (
                            <div className="mt-8 p-6 border rounded-lg">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-lg font-semibold">Agent&apos;s Decision Process</h2>
                                </div>
                                <div className="space-y-4">
                                    {JSON.parse(pineconeData.metadata.log as string).map((step: { step: string; reasoning: string }, index: number) => (
                                        <div key={index} className="flex items-start gap-4 p-4 rounded-lg bg-zinc-900">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Badge variant="flat" className={`
                                                        ${step.step === 'interesting' ? 'bg-blue-500' : ''}
                                                        ${step.step === 'marketData' ? 'bg-green-500' : ''}
                                                        ${step.step === 'similarPredictions' ? 'bg-purple-500' : ''}
                                                        ${step.step === 'newsAnalysis' ? 'bg-orange-500' : ''}
                                                        ${step.step === 'finalDecision' ? 'bg-red-500' : ''}
                                                    `}>
                                                        {step.step.charAt(0).toUpperCase() + step.step.slice(1).replace(/([A-Z])/g, ' $1')}
                                                    </Badge>
                                                </div>
                                                <p className="text-sm text-zinc-300">{step.reasoning}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Verification Log */}
                        {prediction?.log && (
                            <div className="mt-8 p-6 border rounded-lg">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-lg font-semibold">Verification Steps</h2>
                                </div>
                                <div className="space-y-4">
                                    {(prediction.log || '').split('\n').map((entry: string, index: number) => {
                                        // Match both formats:
                                        // "Step verify-1: Starting prediction verification"
                                        // "Step 9: cryptoSlug: xrp"
                                        const match = entry.match(/Step ([\w-]+):\s*(.*)/i);
                                        if (match) {
                                            return (
                                                <div key={index} className="flex items-start gap-4 p-4 rounded-lg bg-zinc-900">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <Badge variant="flat" className="bg-zinc-800">
                                                                Step {match[1]}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-sm text-zinc-300">{match[2]}</p>
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }).filter((item): item is React.ReactElement => item !== null)}
                                </div>
                            </div>
                        )}

                        {/* Reasoning Log */}
                        {prediction?.log && prediction.log.length > 0 && (
                            <div className="mt-8 p-6 border rounded-lg">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-lg font-semibold">Reasoning Log</h2>
                                    <Badge variant="flat" className="text-zinc-400">
                                        {parseLogEntries(prediction.log).length} entries
                                    </Badge>
                                </div>
                                <div className="space-y-4">
                                    {parseLogEntries(prediction.log).map((entry, index) => {
                                        if (entry) {
                                            return (
                                                <div key={index} className="flex items-start gap-4 p-4 rounded-lg bg-zinc-900">
                                                    <div className="flex-1">
                                                        <p className="text-zinc-400 text-sm mb-1">
                                                            {new Date(entry.timestamp).toLocaleString()}
                                                        </p>
                                                        <p className="text-sm">{entry.message}</p>
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal */}
            <Modal
                isOpen={showCommentModal}
                onOpenChange={(open) => setShowCommentModal(open)}
            >
                <ModalContent className="w-full max-w-[640px]">
                    <ModalHeader>
                        <h3 className="font-bold">Adjust Reasoning</h3>
                    </ModalHeader>
                    <ModalBody>
                        {bet && (
                            <>
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-sm text-zinc-400 mb-1">Original Reason</p>
                                        <p className="text-sm bg-zinc-900 p-3 rounded-md">{bet.reason}</p>
                                    </div>
                                    {pineconeData?.metadata?.comment && (
                                        <div>
                                            <p className="text-sm text-zinc-400 mb-1">Previous Comment</p>
                                            <p className="text-sm bg-zinc-900 p-3 rounded-md">
                                                {pineconeData.metadata.comment as string}
                                            </p>
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-sm text-zinc-400 mb-1">New Comment</p>
                                        <textarea
                                            className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-md p-3 min-h-[100px]"
                                            placeholder="Add more context or update your reasoning..."
                                            value={newComment}
                                            onChange={(e) => setNewComment(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="bordered" onPress={() => setShowCommentModal(false)}>
                            Cancel
                        </Button>
                        <Button color="primary" onPress={handleSaveComment}>
                            Save Changes
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </div>
    );
} 