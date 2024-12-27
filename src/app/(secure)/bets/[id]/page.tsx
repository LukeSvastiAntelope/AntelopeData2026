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
import Link from "next/link";

interface PineconeMetadata {
    [key: string]: string | number | boolean | object;
}

interface PineconeData {
    metadata?: PineconeMetadata;
}

export default function BetDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [bet, setBet] = useState<IBet | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [pineconeData, setPineconeData] = useState<PineconeData | null>(null);
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
                    setPineconeData(response.vector);
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

    if (isLoading) {
        return <div>Loading...</div>;
    }

    if (!bet) {
        return <div>Bet not found</div>;
    }

    return (
        <div className="flex text-white">
            {/* Sidebar (copied from dashboard) */}
            <aside className="w-64">
                <nav className="flex min-h-screen flex-col gap-4 justify-between p-4">
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
                        <Link href="/payment" className="flex items-center gap-2 mb-4">
                            <Image
                                src={"/assets/images/logo-simple.svg"}
                                alt="Profile"
                                width={24}
                                height={24}
                                className="rounded-full bg-gray-700 mr-2"
                            />
                            <span className="text-sm font-regular icon-credits px-5">
                                <span className="text-gradient">83940</span>
                            </span>
                        </Link>
                        <Link href="/" className="flex items-center gap-2 mb-4 text-white">
                            <span className="icon-dashboard mr-2" /> Dashboard
                        </Link>
                        <Link 
                            href="/markets" 
                            className="flex items-center gap-2 mb-4 group"
                        >
                            <span className="icon-markets mr-2 block group-hover:hidden" />
                            <span className="icon-markets-active mr-2 hidden group-hover:block" />
                            <span className="text-default-400 group-hover:text-white">Markets</span>
                        </Link>
                        <Link href="/strategy" className="flex items-center gap-2 mb-4 group text-default-400">
                            <span className="icon-strategy mr-2 block group-hover:hidden" />
                            <span className="icon-strategy-active mr-2 hidden group-hover:block" />
                            <span className="text-default-400 group-hover:text-white">Strategy</span>
                        </Link>
                    </div>
                    <div>
                        <Link href="/about" className="flex items-center gap-2 mb-4 text-default-400 group">
                            <span className="icon-about mr-2 block group-hover:hidden" />
                            <span className="icon-about-active mr-2 hidden group-hover:block" />
                            <span className="text-default-400 group-hover:text-white">About</span>
                        </Link>
                        <Link href="/community" className="flex items-center gap-2 mb-4 text-default-400 group">
                            <span className="icon-support mr-2 block group-hover:hidden" />
                            <span className="icon-support-active mr-2 hidden group-hover:block" />
                            <span className="text-default-400 group-hover:text-white">Community</span>
                        </Link>
                        <Link href="/signout" className="flex items-center gap-2 mb-4 text-default-400 group">
                            <span className="icon-logout mr-2 block group-hover:hidden" />
                            <span className="icon-logout-active mr-2 hidden group-hover:block" />
                            <span className="text-default-400 group-hover:text-white">Sign out</span>
                        </Link>
                    </div>
                </nav>
            </aside>

            {/* Main Bet Detail Content */}
            <main className="flex-1 container mx-auto px-4 py-6 md:px-8 md:py-8">
                <Button
                    color="default"
                    variant="light"
                    onPress={() => router.back()}
                    className="mb-4"
                >
                    ← Back to Bets
                </Button>

                <Card>
                    <CardBody className="p-6 max-w-[800px]">
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
                        <div className="">
                            <div className="w-full">
                                <h2 className="text-xl font-semibold mb-4">Bet Details</h2>
                                <div className=" grid grid-cols-2 grid-rows-2 gap-8">
                                    <div>
                                        <h3 className="text-sm font-medium text-default-400 mb-1">Status</h3>
                                        <Chip color={bet.status !== "open" ? (bet.outcome === bet.choice ? "success" : "danger") : "primary"}>
                                            {bet.status !== "open" 
                                                ? (bet.outcome === bet.choice ? "Won" : "Lost") 
                                                : bet.status
                                            }
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
                                        <h3 className="text-sm font-medium text-default-400 mb-1">Creator&apos;s Choice</h3>
                                        <Chip color="warning">{bet.predicted_outcome || bet.creator_choice}</Chip>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8">
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
            </main>
        </div>
    );
} 