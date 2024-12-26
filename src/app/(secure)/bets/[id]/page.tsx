'use client'

import { Card, CardBody } from "@nextui-org/card";
import { Chip } from "@nextui-org/chip";
import { Image } from "@nextui-org/image";
import { Button } from "@nextui-org/button";
import { useState, useEffect } from "react";
import { useFetch } from "@/app/utils/lib";
import { IBet } from "@/app/utils/interface";
import toast from "react-hot-toast";
import { useParams, useRouter } from "next/navigation";

export default function BetDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [bet, setBet] = useState<IBet | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [pineconeData, setPineconeData] = useState<any>(null);
    const fetch = useFetch();

    useEffect(() => {
        fetchBetDetails();
    }, [params.id]);

    const fetchBetDetails = async () => {
        try {
            const response = await fetch.get(`/api/getBet?id=${params.id}`);
            if (response.status) {
                setBet(response.bet);
                if (response.bet.pinecone_id) {
                    fetchPineconeData(response.bet.pinecone_id);
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

    const fetchPineconeData = async (pineconeId: string) => {
        try {
            const response = await fetch.get(`/api/getPineconeData?id=${pineconeId}`);
            if (response.status) {
                setPineconeData(response.data);
            } else {
                toast.error(response.message);
            }
        } catch (error) {
            console.error('Failed to fetch Pinecone data:', error);
        }
    };

    if (isLoading) {
        return <div>Loading...</div>;
    }

    if (!bet) {
        return <div>Bet not found</div>;
    }

    return (
        <div className="min-h-screen p-4 md:p-6">
            <Button
                color="default"
                variant="light"
                onPress={() => router.back()}
                className="mb-4"
            >
                ← Back to Bets
            </Button>

            <Card className="w-full max-w-[1200px] mx-auto">
                <CardBody className="p-6">
                    {/* Header Section */}
                    <div className="flex gap-6 mb-8">
                        <Image
                            src={bet.str_thumb}
                            alt="Event"
                            className="w-24 h-24 rounded-xl object-cover"
                        />
                        <div>
                            <h1 className="text-2xl font-bold mb-2">{bet.description}</h1>
                            <div className="flex gap-3 items-center">
                                <Chip size="sm" color="default">{bet.source}</Chip>
                                <span className="text-default-400">
                                    {bet.status === "open"
                                        ? `Created ${new Date(bet.created_at).toLocaleDateString()}`
                                        : `Resolved ${new Date(bet.resolution_date).toLocaleDateString()}`
                                    }
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Bet Details */}
                    <div className="grid md:grid-cols-2 gap-8">
                        <div>
                            <h2 className="text-xl font-semibold mb-4">Bet Details</h2>
                            <div className="space-y-4">
                                <div>
                                    <h3 className="text-sm font-medium text-default-400 mb-1">Status</h3>
                                    <Chip color={bet.status !== "open" ? (bet.outcome === bet.choice ? "success" : "danger") : "primary"}>
                                        {bet.status !== "open" ? (bet.outcome === bet.choice ? "Won" : "Lost") : bet.status}
                                    </Chip>
                                </div>
                                <div>
                                    <h3 className="text-sm font-medium text-default-400 mb-1">Amount</h3>
                                    <p className="text-lg font-semibold">{bet.amount} credits</p>
                                </div>
                                <div>
                                    <h3 className="text-sm font-medium text-default-400 mb-1">Your Choice</h3>
                                    <Chip color="secondary">{bet.choice}</Chip>
                                </div>
                                <div>
                                    <h3 className="text-sm font-medium text-default-400 mb-1">Creator's Choice</h3>
                                    <Chip color="warning">{bet.predicted_outcome || bet.creator_choice}</Chip>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h2 className="text-xl font-semibold mb-4">Reasoning</h2>
                            <p className="text-default-600 leading-relaxed">{bet.reason}</p>

                            {pineconeData && (
                                <div className="mt-8">
                                    <h2 className="text-xl font-semibold mb-4">Source Information</h2>
                                    <div className="bg-default-50 rounded-lg p-4 border border-default-200">
                                        <div className="grid gap-4">
                                            {Object.entries(pineconeData.metadata || {}).map(([key, value]) => (
                                                <div key={key}>
                                                    <h3 className="text-sm font-medium text-default-400 capitalize mb-1">
                                                        {key.replace(/_/g, ' ')}
                                                    </h3>
                                                    <p className="text-sm text-default-600">
                                                        {typeof value === 'string' ? value : JSON.stringify(value)}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </CardBody>
            </Card>
        </div>
    );
} 