'use client';

import { Card, CardBody } from "@nextui-org/card";
import { Image } from "@nextui-org/image";
import { Chip } from "@nextui-org/chip";
import { Spinner } from "@nextui-org/spinner";
import { useEffect, useState } from "react";
import { useFetch } from "@/app/utils/lib";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { useParams, useRouter } from "next/navigation";
import { PredictionDB } from "@/app/utils/interface";
import { format as formatDateFn } from "date-fns";

export default function PredictionDetail() {
    const [prediction, setPrediction] = useState<PredictionDB | null>(null);
    const [reason, setReason] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const params = useParams();
    const fetchData = useFetch();
    const router = useRouter();

    useEffect(() => {
        const fetchPredictionDetail = async () => {
            try {
                const response = await fetchData.get(`/api/getPrediction/${params.id}`);
                if (response.status) {
                    setPrediction(response.prediction);
                    setReason(response.reason);
                } else {
                    toast.error(response.message);
                }
            } catch (error) {
                toast.error("Failed to fetch prediction details: " + error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchPredictionDetail();
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
        <div className="flex text-white">
            {/* Sidebar (similar to bets/[id]/page.tsx) */}
            <aside className="w-64 fixed top-0 text-sm">
                <nav className="flex min-h-screen flex-col gap-4 justify-between py-8 px-4">
                    <div>
                        <div className="flex items-center mb-4">
                            <Image
                                src={"/assets/images/logo-text.svg"}
                                alt="Dashboard Logo"
                                width={160}
                                height={40}
                                className="mr-2 rounded-full w-100"
                            />
                        </div>
                        {/* Example of credits link */}
                        <Link href="/payment" className="flex items-center gap-2 mb-4">
                            <Image
                                src={"/assets/images/logo-simple.svg"}
                                alt="Profile"
                                width={24}
                                height={24}
                                className="rounded-full bg-gray-700 mr-2"
                            />
                            <span className="text-sm font-regular icon-credits px-5">
                                <span className="text-gradient font-kodemono">83940</span>
                            </span>
                        </Link>
                        <Link
                            href="/dashboard"
                            className="flex items-center gap-2 mb-4 text-white font-kodemono"
                        >
                            <span className="icon-dashboard mr-2" /> Dashboard
                        </Link>
                        <Link href="/markets" className="flex items-center gap-2 mb-4 group">
                            <span className="icon-markets mr-2 block group-hover:hidden" />
                            <span className="icon-markets-active mr-2 hidden group-hover:block" />
                            <span className="text-default-400 group-hover:text-white font-kodemono">
                                Markets
                            </span>
                        </Link>
                        <Link
                            href="/strategy"
                            className="flex items-center gap-2 mb-4 group text-default-400"
                        >
                            <span className="icon-strategy mr-2 block group-hover:hidden" />
                            <span className="icon-strategy-active mr-2 hidden group-hover:block" />
                            <span className="text-default-400 group-hover:text-white font-kodemono">
                                Strategy
                            </span>
                        </Link>
                    </div>
                    <div>
                        <Link
                            href="/about"
                            className="flex items-center gap-2 mb-4 text-default-400 group"
                        >
                            <span className="icon-about mr-2 block group-hover:hidden" />
                            <span className="icon-about-active mr-2 hidden group-hover:block" />
                            <span className="text-default-400 group-hover:text-white font-kodemono">
                                About
                            </span>
                        </Link>
                        <Link
                            href="https://discord.gg/dSEV8YCDQ2"
                            className="flex items-center gap-2 mb-4 text-default-400 group"
                        >
                            <span className="icon-support mr-2 block group-hover:hidden" />
                            <span className="icon-support-active mr-2 hidden group-hover:block" />
                            <span className="text-default-400 group-hover:text-white font-kodemono">
                                Community
                            </span>
                        </Link>
                        <Link
                            href="/logout"
                            className="flex items-center gap-2 mb-4 text-default-400 group"
                        >
                            <span className="icon-logout mr-2 block group-hover:hidden" />
                            <span className="icon-logout-active mr-2 hidden group-hover:block" />
                            <span className="text-default-400 group-hover:text-white font-kodemono">
                                Log out
                            </span>
                        </Link>
                    </div>
                </nav>
            </aside>

            {/* Main Content Area (mirror bets detail style) */}
            <main className="flex-1 ml-64 container mx-auto px-4 py-6 md:px-8 md:py-8 min-w-[800px] max-w-[800px]">
                {/* Back Button */}
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

                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
                                        <div>
                                            <p className="text-sm text-gray-500">Predicted Outcome</p>
                                            <p className="font-semibold">{prediction.predicted_outcome}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-500">Bets Status</p>
                                            <p className="font-semibold">
                                                Yes: {prediction.yes_count} | No: {prediction.no_count}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-500">Bet Amount</p>
                                            <p className="font-semibold">{prediction.bet_amount}</p>
                                        </div>
                                    </div>

                                    {reason && (
                                        <div>
                                            <p className="text-sm text-gray-500">Reason</p>
                                            <p className="font-semibold">{reason}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardBody>
                    </Card>

                    {/* Prediction Timeline */}
                    <div className="space-y-4">
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
            </main>
        </div>
    );
} 