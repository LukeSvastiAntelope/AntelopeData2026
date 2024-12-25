'use client';

import { Card, CardBody } from "@nextui-org/card";
import { Image } from "@nextui-org/image";
import { Chip } from "@nextui-org/chip";
import { Spinner } from "@nextui-org/spinner";
import { useEffect, useState } from "react";
import { useFetch } from "@/app/utils/lib";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { useParams } from "next/navigation";
import { PredictionDB } from "@/app/utils/interface";

export default function PredictionDetail() {
    const [prediction, setPrediction] = useState<PredictionDB | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const params = useParams();
    const fetch = useFetch();

    useEffect(() => {
        const fetchPredictionDetail = async () => {
            try {
                const response = await fetch.get(`/api/getPrediction/${params.id}`);
                if (response.status) {
                    setPrediction(response.prediction);
                } else {
                    toast.error(response.message);
                }
            } catch (error) {
                toast.error('Failed to fetch prediction details: ' + error);
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
        <div className="container mx-auto py-6 px-4 min-h-screen">
            {/* Back Button */}
            <Link
                href="/predictions"
                className="inline-flex items-center gap-2 mb-6 text-primary hover:underline"
            >
                ← Back to Predictions
            </Link>

            {/* Prediction Overview */}
            <Card className="mb-6">
                <CardBody className="gap-4">
                    <div className="flex items-start gap-4 flex-col md:flex-row">
                        <Image
                            src={prediction.str_thumb}
                            alt={prediction.description}
                            width={200}
                            height={200}
                            className="rounded-lg"
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
                                        color={prediction.status === 'open' ? 'primary' : 'secondary'}
                                        variant="flat"
                                    >
                                        {prediction.status === 'open'
                                            ? 'Open'
                                            : prediction.outcome === prediction.creator_choice
                                                ? 'Win'
                                                : 'Loss'}
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

                            {/* {prediction.reason && (
                                <div>
                                    <p className="text-sm text-gray-500">Reason</p>
                                    <p className="font-semibold">{prediction.reason}</p>
                                </div>
                            )} */}
                        </div>
                    </div>
                </CardBody>
            </Card>

            {/* Prediction Timeline */}
            {/* <div className="space-y-4">
                <h2 className="text-xl font-bold">Prediction Timeline</h2>
                {prediction.logs?.map((log, index) => (
                    <Card key={index}>
                        <CardBody>
                            <div className="flex justify-between items-start gap-4">
                                <div className="flex-1">
                                    <p className="font-medium">{log.action}</p>
                                    <p className="text-sm text-gray-500 mt-1">{log.details}</p>
                                    {log.agent && (
                                        <div className="flex flex-wrap items-center gap-2 mt-2">
                                            <Chip size="sm" variant="flat">
                                                Agent: {log.agent}
                                            </Chip>
                                            {log.confidence && (
                                                <Chip size="sm" variant="flat">
                                                    Confidence: {log.confidence}%
                                                </Chip>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <span className="text-sm text-gray-500 whitespace-nowrap">
                                    {formatDate(log.timestamp, 'MM/dd/yyyy HH:mm')}
                                </span>
                            </div>
                        </CardBody>
                    </Card>
                ))}
            </div> */}
        </div>
    );
} 