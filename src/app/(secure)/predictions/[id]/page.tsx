'use client';

import { Card, CardBody } from "@nextui-org/card";
import { Image } from "@nextui-org/image";
import { Chip } from "@nextui-org/chip";
import { Spinner } from "@nextui-org/spinner";
import { useEffect, useState } from "react";
import { useFetch } from "@/app/utils/lib";
import { toast } from "react-hot-toast";
import { useParams, useRouter } from "next/navigation";
import { PredictionDB } from "@/app/utils/interface";
import { format as formatDateFn } from "date-fns";

export default function PredictionDetail() {
    const params = useParams();
    const fetchData = useFetch();
    const router = useRouter();

    // Local state
    const [prediction, setPrediction] = useState<PredictionDB | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Call both fetches
    const fetchPredictionDetails = async (id: string) => {
        try {
            const response = await fetchData.get(`/api/getPrediction/${id}`);
            if (response.status) {
                setPrediction(response.prediction);
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
                                </div>
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
        </>
    );
} 