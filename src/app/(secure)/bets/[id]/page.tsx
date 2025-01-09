'use client'

import { Chip } from "@nextui-org/chip";
import { Image } from "@nextui-org/image";
import { Button } from "@nextui-org/button";
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
    Tooltip,
    Legend,
} from "chart.js";

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

    const [totalYes, setTotalYes] = useState(0);
    const [totalNo, setTotalNo] = useState(0);

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
                    const yesTotal = betsArray.reduce((sum, bet) =>
                        bet.choice.toLowerCase() === 'yes' ? sum + bet.amount : sum, 0);
                    const noTotal = betsArray.reduce((sum, bet) =>
                        bet.choice.toLowerCase() === 'no' ? sum + bet.amount : sum, 0);

                    setTotalYes(yesTotal);
                    setTotalNo(noTotal);
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
                className="mb-4 text-small p-0 subtlebackground backbutton"
            >
                ← Back
            </Button>

            {
                !bet ?
                    <div>Bet not found</div> :
                    <>
                        <div className="px-0 max-w-[800px]">
                            {/* Header Section */}
                            <div className="flex gap-6 mb-8 flex-col w-full imagecut bg-content0 rounded-xl p-8">
                                <Image
                                    src={bet.str_thumb}
                                    alt="Event"
                                    className="w-full object-cover rounded-xl imagecut"
                                    style={{ maxWidth: "100%", minWidth: "-webkit-fill-available;" }}
                                />

                                <div>
                                    <h3 className="text-lg font-semibold mb-2">{bet.description}</h3>
                                </div>

                                {/* Bet Details */}
                                <div className="color-white">
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
                                            className="text-primary bg-primary/20 underline text-sm mt-2 hover:bg-primary/40"
                                            onPress={() => setShowCommentModal(true)}
                                        >
                                            Adjust Reasoning
                                        </Button>
                                    </div>
                                    <div className="w-full mt-8">
                                        <h2 className="text-lg font-semibold mb-4">Bet Details</h2>
                                        <div className="grid grid-cols-2 grid-rows-4 md:grid-cols-4 md:grid-rows-2 gap-4">
                                            <div>
                                                <h3 className="text-sm font-medium text-default-400 mb-1 ">Status</h3>
                                                <Chip color={bet.status !== "open" ? (bet.outcome === bet.choice ? "success" : "danger") : "primary"} className="bg-primary/20">
                                                    {bet.status !== "open"
                                                        ? (bet.outcome === bet.choice ? "Won" : "Lost")
                                                        : bet.status
                                                    }
                                                </Chip>
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-medium text-default-400 mb-1">Credits</h3>
                                                <p className="text-sm font-semibold"><span className=" inline-block ">{bet.amount}</span></p>
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-medium text-default-400 mb-1">Your Choice</h3>
                                                <Chip color="secondary" className="bg-primary/20">{bet.choice}</Chip>
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-medium text-default-400 mb-1">Creator&apos;s Choice</h3>
                                                <Chip color="secondary" className="bg-primary/20">{bet.predicted_outcome || bet.creator_choice}</Chip>
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-medium text-default-400 mb-1">Yes Votes</h3>
                                                <p className="text-sm font-semibold">{prediction?.yes_count} ({totalYes})</p>
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-medium text-default-400 mb-1">No Votes</h3>
                                                <p className="text-sm font-semibold">{prediction?.no_count} ({totalNo})</p>
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-medium text-default-400 mb-1">Odds</h3>
                                                <p className="text-sm font-semibold">
                                                    Yes: {totalYes > 0 ? (1 / (totalYes / (totalYes + totalNo || 1))).toFixed(2) : "∞"}x
                                                    <br />
                                                    No: {totalNo > 0 ? (1 / (totalNo / (totalYes + totalNo || 1))).toFixed(2) : "∞"}x
                                                </p>
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-medium text-default-400 mb-1">Validation Source</h3>
                                                <p className="text-sm font-semibold">{bet.source}</p>
                                            </div>

                                            <div className="flex flex-col gap-1">
                                                {bet.status === "open" ? (
                                                    <>
                                                        <h3 className="text-sm font-medium text-default-400">Created</h3>
                                                        <p className="text-sm font-semibold">{new Date(bet.created_at).toLocaleDateString()}</p>
                                                    </>
                                                ) : (
                                                    <>
                                                        <h3 className="text-sm font-medium text-default-400">Resolved</h3>
                                                        <p className="text-sm font-semibold">{new Date(bet.resolution_date).toLocaleDateString()}</p>
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
                                        <div className="space-y-4 font-kodemono">
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
                                            <div className="flex flex-col gap-4 font-kodemono">
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