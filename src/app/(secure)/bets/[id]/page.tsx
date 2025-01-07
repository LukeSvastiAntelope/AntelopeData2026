'use client'

import { Chip } from "@nextui-org/chip";
import { Image } from "@nextui-org/image";
import { Button } from "@nextui-org/button";
import { Input } from "@nextui-org/input";
import { useState, useEffect } from "react";
import { useFetch } from "@/app/utils/lib";
import { IBet, PredictionDB } from "@/app/utils/interface";
import toast from "react-hot-toast";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Bar } from "react-chartjs-2";
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
import { Textarea } from "@nextui-org/input";

ChartJS.register(
    BarElement,
    CategoryScale,
    LinearScale,
    Title,
    Tooltip,
    Legend
);

interface IAgentProfile {
    image?: string;
    name?: string;
    // add any other fields you need from /api/getAgentProfile
}

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
    const fetchData = useFetch();

    const [agent, setAgent] = useState<IAgentProfile | null>(null);
    const [agentBalance, setAgentBalance] = useState(0);
    const [totalYes, setTotalYes] = useState(0);
    const [totalNo, setTotalNo] = useState(0);

    const handleSaveComment = async () => {
        try {
            const response = await fetch.post("/api/updateBetComment", {
                betId: params.id,
                comment: newComment
            });
            if (response.status) {
                toast.success("Comment saved successfully");
                setShowCommentModal(false);
                fetchBetDetails(); // Refresh bet details
            } else {
                toast.error(response.message || "Failed to save comment");
            }
        } catch (error) {
            console.error("Error saving comment:", error);
            toast.error("Failed to save comment");
        }
    };

    const [newComment, setNewComment] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);



    const fetchAgentProfile = async () => {
        try {
            const response = await fetch.get("/api/getAgentProfile");
            if (response.status) {
                setAgent(response.agent);
                setAgentBalance(response.agent.wallet_balance ?? 0);
                console.log("agent is going to be set to", response.agent);
            } else {
                toast.error(response.message);
            }
            setIsLoading(false);
        } catch (error) {
            console.error("Failed to fetch agent profile:", error);
            toast.error("Unable to fetch agent profile");
            setIsLoading(false);
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
                setPrediction(response.prediction);
            } else {
                toast.error(response.message);
            }
            setIsLoading(false);
        } catch (error) {
            console.error('Failed to fetch bet details:', error);
            setIsLoading(false);
        }
    };

    const handleSubmitComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim()) return;

        setIsSubmitting(true);
        try {
            const response = await fetch.post("/api/getBet", {
                id: params.id,
                comment: newComment
            });

            if (response.status) {
                // Update local state with new vector data
                setPineconeData(response.vector);
                setNewComment(""); // Clear input
                toast.success("Comment updated successfully!");
            } else {
                toast.error(response.message);
            }
        } catch (error) {
            console.error("Failed to update comment:", error);
            toast.error("Failed to update comment");
        } finally {
            setIsSubmitting(false);
        }
    };

    useEffect(() => {
        // Call both in the same effect
        fetchAgentProfile();
        fetchBetDetails();
    }, [params.id]);

    if (isLoading) {
        return <div>Loading...</div>;
    }

    if (!bet) {
        return <div>Bet not found</div>;
    }

    // Prepare data for Chart.js
    const chartData = {
        labels: ["Yes Bets", "No Bets"],
        datasets: [
            {
                label: "Bet Distribution",
                data: [totalYes, totalNo],
                backgroundColor: ["#36A2EB", "#71717a"],
            },
        ],
    };

    // Simple chart options example
    const chartOptions = {
        responsive: true,
        plugins: {
            legend: { display: false },
            title: {
                display: true,
                text: "Bet Distribution by Agent Choice",
                color: "#E3EDF5",
            },
        },
        scales: {
            x: {
                ticks: {
                    color: "#71717a",
                },
            },
            y: {
                ticks: {
                    color: "#71717a",
                },
            },
        },
    };

    return (
        <div className="flex text-white">
            {/* Sidebar (copied from dashboard) */}
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
                        <Link href="/profile" className="md:flex items-center gap-2 mb-4 hidden p-2 border border-white/10 profile-border ">
                            <Image
                                src={agent?.image || "/assets/images/logo-simple.svg"}
                                alt="Profile"
                                width={32}
                                height={32}
                                className="rounded-full bg-gray-700 mr-2 sm-hidden"
                            />
                            {/* Credits */}
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold font-kodemono w-full"> {agent?.name || 'Agent Name'} </span>
                                <span className="text-gradient">{agentBalance?.toLocaleString() || 0}</span>
                            </div>

                        </Link>
                        <Link
                            href="/markets"
                            className="flex items-center gap-2 mb-4 group"
                        >
                            {/* default icon */}
                            <span className="icon-dashboard mr-2 block group-hover:hidden " />
                            {/* hover icon */}
                            <span className="icon-dashboard-active mr-2 hidden group-hover:block" />
                            <span className="text-default-400 group-hover:text-white font-kodemono"><span className="hidden md:inline-block">Overview</span></span>
                        </Link>
                        <Link
                            href="/markets"
                            className="flex items-center gap-2 mb-4 group"
                        >
                            {/* default icon */}
                            <span className="icon-markets mr-2 block group-hover:hidden " />
                            {/* hover icon */}
                            <span className="icon-markets-active mr-2 hidden group-hover:block" />
                            <span className="text-default-400 group-hover:text-white font-kodemono"><span className="hidden md:inline-block">Markets</span></span>
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

            {/* Main Bet Detail Content */}
            <main className="flex-1 ml-0 md:ml-64 container mt-14 md:mt-0  mx-auto px-4 py-6 md:px-8 md:py-8 min-w-full md:min-w-[800px] max-w-full md:max-w-[800px]">

                <Button
                    color="default"
                    variant="light"
                    onPress={() => router.back()}
                    className="mb-4 text-small p-0 subtlebackground backbutton"
                >
                    ← Back
                </Button>

                <div>
                    <div className="px-0 max-w-[800px]">
                        {/* Header Section */}
                        <div className="flex gap-6 mb-8 flex-col w-full imagecut bg-content0 rounded-xl p-8">
                            {/* Chart area replaces commented Image */}
                            {/* <div className="w-full  rounded-xl p-4">
                                <Bar data={chartData} options={chartOptions} />
                            </div> */}


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
                            <Button
                                color="primary"
                                variant="light"
                                className="text-primary bg-primary/20 underline text-sm mt-2 hover:bg-primary/40"
                                onClick={() => setShowCommentModal(true)}
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
                                        <p className="text-sm font-semibold">{prediction?.yes_count} {totalYes} </p>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-default-400 mb-1">No Votes</h3>
                                        <p className="text-sm font-semibold">{prediction?.no_count} {totalNo}</p>
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
                        <div className="mt-8">
                            {pineconeData && (
                                <div className="mt-0">

                                    <div className="bg-content0 rounded-lg p-8 ">
                                        <div className="flex flex-col gap-4 font-kodemono">
                                            <h2 className="text-xl font-semibold mb-4">Reasoning Log</h2>
                                            {Object.entries(pineconeData.metadata || {}).map(([key, value]) => {
                                                return (
                                                    (key != "agent_id" && key != "choice" && key != "amount" && key != "created_at" && key != "prediction_id" && key != "log") ? (
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
                        {
                            pineconeData && (
                                <div className="mt-8">
                                    <div className="bg-content0 rounded-lg p-8">
                                        <h2 className="text-xl font-semibold mb-4">Comment</h2>

                                        {/* Display existing comment if any */}
                                        {pineconeData?.metadata?.comment && (
                                            <div className="text-default-600 mb-4">
                                                <p>{pineconeData.metadata.comment as string}</p>
                                            </div>
                                        )}

                                        {/* Comment Form - always shown for updating */}
                                        <form onSubmit={handleSubmitComment} className="space-y-4">
                                            <Textarea
                                                placeholder={pineconeData?.metadata?.comment ? "Update comment..." : "Add a comment..."}
                                                value={newComment}
                                                onChange={(e) => setNewComment(e.target.value)}
                                                className="w-full"
                                            />
                                            <Button
                                                type="submit"
                                                color="primary"
                                                isLoading={isSubmitting}
                                                className="w-full md:w-auto"
                                            >
                                                {pineconeData?.metadata?.comment ? "Update Comment" : "Post Comment"}
                                            </Button>
                                        </form>
                                    </div>
                                </div>
                            )
                        }
                    </div>
                </div>

            </main>

            <Modal
                isOpen={showCommentModal}
                onOpenChange={(open) => setShowCommentModal(open)}
            >
                <ModalContent className="w-full h-full max-w-[640px] max-h-[400px]">
                    <ModalHeader>
                        <h3 className="font-bold">Add Comment to Agent Reasoning</h3>
                    </ModalHeader>
                    <ModalBody>
                        <p className="text-base text-gray-500 mb-2">
                            Original Reason: {bet.reason}
                        </p>
                        <textarea
                        className="w-full border border-white/10 text-white rounded-md p-2 text-black "
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

        </div>
    );
} 