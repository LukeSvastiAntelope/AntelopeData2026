'use client'

import { useState, useEffect } from "react";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { IPrediction } from "@/app/utils/interface";
import { useFetch } from "@/app/utils/lib";
import toast from "react-hot-toast";
import { Tooltip } from "@heroui/tooltip";
import { formatDate } from "date-fns";
import { useRouter } from "next/navigation";

const AdminPage = () => {
    const fetch = useFetch();
    const router = useRouter();

    const [activeTab, setActiveTab] = useState<"overview" | "open" | "upcoming" | "resolved">("overview");
    const [predictions, setPredictions] = useState<IPrediction[]>([]);
    const [displayedPredictions, setDisplayedPredictions] = useState<IPrediction[]>([]);
    const [isLoadingPredictions, setIsLoadingPredictions] = useState<boolean>(false);
    const [pagePredictions, setPagePredictions] = useState<number>(1);
    const [hasMorePredictions, setHasMorePredictions] = useState<boolean>(true);

    const [openPredictions, setOpenPredictions] = useState<IPrediction[]>([]);
    const [upcomingPredictions, setUpcomingPredictions] = useState<IPrediction[]>([]);
    const [resolvedPredictions, setResolvedPredictions] = useState<IPrediction[]>([]);

    const [displayedOpenPredictions, setDisplayedOpenPredictions] = useState<IPrediction[]>([]);
    const [displayedUpcomingPredictions, setDisplayedUpcomingPredictions] = useState<IPrediction[]>([]);
    const [displayedResolvedPredictions, setDisplayedResolvedPredictions] = useState<IPrediction[]>([]);

    const [isLoadingOpenPredictions, setIsLoadingOpenPredictions] = useState<boolean>(false);
    const [isLoadingUpcomingPredictions, setIsLoadingUpcomingPredictions] = useState<boolean>(false);
    const [isLoadingResolvedPredictions, setIsLoadingResolvedPredictions] = useState<boolean>(false);

    const [pageOpenPredictions, setPageOpenPredictions] = useState<number>(1);
    const [pageUpcomingPredictions, setPageUpcomingPredictions] = useState<number>(1);
    const [pageResolvedPredictions, setPageResolvedPredictions] = useState<number>(1);

    const [hasMoreOpenPredictions, setHasMoreOpenPredictions] = useState<boolean>(true);
    const [hasMoreUpcomingPredictions, setHasMoreUpcomingPredictions] = useState<boolean>(true);
    const [hasMoreResolvedPredictions, setHasMoreResolvedPredictions] = useState<boolean>(true);

    const ITEMS_PER_PAGE_PREDICTIONS = 50;

    useEffect(() => {
        const fetchPredictions = async () => {
            if (isLoadingPredictions) return;
            setIsLoadingPredictions(true);
            setIsLoadingOpenPredictions(true);
            setIsLoadingUpcomingPredictions(true);
            setIsLoadingResolvedPredictions(true);
            try {
                const response = await fetch.get('/api/admin/getPredictions');
                if (response.status) {
                    setPredictions(response.predictions);
                    setDisplayedPredictions(response.predictions.slice(0, ITEMS_PER_PAGE_PREDICTIONS));
                    setHasMorePredictions(response.predictions.length > ITEMS_PER_PAGE_PREDICTIONS);
                    const openPredictions = response.predictions.filter((prediction: IPrediction) => prediction.status === "open");
                    const upcomingPredictions = response.predictions.filter((prediction: IPrediction) => prediction.status === "awaiting_confirmation");
                    const resolvedPredictions = response.predictions.filter((prediction: IPrediction) => prediction.status === "resolved");
                    setOpenPredictions(openPredictions);
                    setUpcomingPredictions(upcomingPredictions);
                    setResolvedPredictions(resolvedPredictions);
                    setDisplayedOpenPredictions(openPredictions.slice(0, ITEMS_PER_PAGE_PREDICTIONS));
                    setDisplayedUpcomingPredictions(upcomingPredictions.slice(0, ITEMS_PER_PAGE_PREDICTIONS));
                    setDisplayedResolvedPredictions(resolvedPredictions.slice(0, ITEMS_PER_PAGE_PREDICTIONS));
                    setHasMoreOpenPredictions(openPredictions.length > ITEMS_PER_PAGE_PREDICTIONS);
                    setHasMoreUpcomingPredictions(upcomingPredictions.length > ITEMS_PER_PAGE_PREDICTIONS);
                    setHasMoreResolvedPredictions(resolvedPredictions.length > ITEMS_PER_PAGE_PREDICTIONS);
                } else {
                    toast.error(response.message);
                }
            } catch (error) {
                console.error("Error in fetchPredictions: ", error);
                toast.error('Failed to fetch predictions');
            } finally {
                setIsLoadingPredictions(false);
                setIsLoadingOpenPredictions(false);
                setIsLoadingUpcomingPredictions(false);
                setIsLoadingResolvedPredictions(false);
            }
        }
        fetchPredictions();
    }, [])

    const loadMorePredictions = () => {
        if (!isLoadingPredictions && hasMorePredictions) {
            const newPage = pagePredictions + 1;
            const nextItems = predictions.slice(0, newPage * ITEMS_PER_PAGE_PREDICTIONS);
            setDisplayedPredictions(nextItems);
            setHasMorePredictions(nextItems.length < predictions.length);
            setPagePredictions(newPage);
        }
    }

    const loadMoreOpenPredictions = () => {
        if (!isLoadingOpenPredictions && hasMoreOpenPredictions) {
            const newPage = pageOpenPredictions + 1;
            const nextItems = openPredictions.slice(0, newPage * ITEMS_PER_PAGE_PREDICTIONS);
            setDisplayedOpenPredictions(nextItems);
            setHasMoreOpenPredictions(nextItems.length < openPredictions.length);
            setPageOpenPredictions(newPage);
        }
    }

    const loadMoreUpcomingPredictions = () => {
        if (!isLoadingUpcomingPredictions && hasMoreUpcomingPredictions) {
            const newPage = pageUpcomingPredictions + 1;
            const nextItems = upcomingPredictions.slice(0, newPage * ITEMS_PER_PAGE_PREDICTIONS);
            setDisplayedUpcomingPredictions(nextItems);
            setHasMoreUpcomingPredictions(nextItems.length < upcomingPredictions.length);
            setPageUpcomingPredictions(newPage);
        }
    }

    const loadMoreResolvedPredictions = () => {
        if (!isLoadingResolvedPredictions && hasMoreResolvedPredictions) {
            const newPage = pageResolvedPredictions + 1;
            const nextItems = resolvedPredictions.slice(0, newPage * ITEMS_PER_PAGE_PREDICTIONS);
            setDisplayedResolvedPredictions(nextItems);
            setHasMoreResolvedPredictions(nextItems.length < resolvedPredictions.length);
            setPageResolvedPredictions(newPage);
        }
    }

    return (
        <>
            <div className="flex flex-row justify-between h-fit">
                <div className="pr-8 pt-2">
                    <h1 className="font-bold mb-2 font-kodemono ">
                        Admin
                    </h1>
                </div>
            </div>
            <div className="flex gap-2 font-kodemono mb-2 text-small">
                <Tooltip
                    content="View overall predictions."
                    showArrow
                >
                    <button
                        onClick={() => setActiveTab("overview")}
                        className={`px-1 py-2 hover:text-white ${activeTab === "overview" ? "text-white" : "text-gray-500"
                            }`}
                    >
                        Overview
                    </button>
                </Tooltip>
                <Tooltip
                    content="View open predictions."
                    showArrow
                >
                    <button
                        onClick={() => setActiveTab("open")}
                        className={`px-1 py-2 hover:text-white ${activeTab === "open" ? "text-white" : "text-gray-500"
                            }`}
                    >
                        Open
                    </button>
                </Tooltip>
                <Tooltip
                    content="View upcoming predictions."
                    showArrow
                >
                    <button
                        onClick={() => setActiveTab("upcoming")}
                        className={`px-1 py-2 hover:text-white ${activeTab === "upcoming" ? "text-white" : "text-gray-500"
                            }`}
                    >
                        Upcoming
                    </button>
                </Tooltip>
                <Tooltip
                    content="View resolved predictions."
                    showArrow
                >
                    <button
                        onClick={() => setActiveTab("resolved")}
                        className={`px-1 py-2 hover:text-white ${activeTab === "resolved" ? "text-white" : "text-gray-500"
                            }`}
                    >
                        Resolved
                    </button>
                </Tooltip>
            </div>
            {
                activeTab === "overview" && (
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-row justify-between">
                            <div>Predictions</div>
                            <div>Resolve By</div>
                        </div>
                        {isLoadingPredictions && predictions.length === 0 && (
                            <div className="flex justify-center items-center py-8">
                                <Spinner size="lg" />
                            </div>
                        )}
                        {!isLoadingPredictions && predictions.length === 0 && (
                            <div className="text-center text-gray-500 py-8 container">
                                No predictions found
                            </div>
                        )}
                        {
                            displayedPredictions.map((prediction: IPrediction) => (
                                <div key={prediction.id} className="flex flex-row justify-between cursor-pointer" onClick={() => router.push(`/admin/${prediction.id}`)}>
                                    <div>{prediction.description}</div>
                                    <div>{formatDate(new Date(prediction.resolution_date), "MM/dd/yyyy")}</div>
                                </div>
                            ))
                        }
                        {
                            hasMorePredictions && !isLoadingPredictions && displayedPredictions.length > 0 && (
                                <div className="flex justify-center mt-4">
                                    <Button
                                        color="primary"
                                        variant="flat"
                                        onPress={loadMorePredictions}
                                        className="min-w-[200px]"
                                    >
                                        Show More
                                    </Button>
                                </div>
                            )
                        }
                    </div>
                )
            }
            {
                activeTab === "open" && (
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-row justify-between">
                            <div>Predictions</div>
                            <div>Resolve By</div>
                        </div>
                        {isLoadingOpenPredictions && openPredictions.length === 0 && (
                            <div className="flex justify-center items-center py-8">
                                <Spinner size="lg" />
                            </div>
                        )}
                        {!isLoadingOpenPredictions && openPredictions.length === 0 && (
                            <div className="text-center text-gray-500 py-8 container">
                                No predictions found
                            </div>
                        )}
                        {
                            displayedOpenPredictions.map((prediction: IPrediction) => (
                                <div key={prediction.id} className="flex flex-row justify-between cursor-pointer" onClick={() => router.push(`/admin/${prediction.id}`)}>
                                    <div>{prediction.description}</div>
                                    <div>{formatDate(new Date(prediction.resolution_date), "MM/dd/yyyy")}</div>
                                </div>
                            ))
                        }
                        {
                            hasMoreOpenPredictions && !isLoadingOpenPredictions && displayedOpenPredictions.length > 0 && (
                                <div className="flex justify-center mt-4">
                                    <Button
                                        color="primary"
                                        variant="flat"
                                        onPress={loadMoreOpenPredictions}
                                        className="min-w-[200px]"
                                    >
                                        Show More
                                    </Button>
                                </div>
                            )
                        }
                    </div>
                )
            }
            {
                activeTab === "upcoming" && (
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-row justify-between">
                            <div>Predictions</div>
                            <div>Resolve By</div>
                        </div>
                        {isLoadingUpcomingPredictions && upcomingPredictions.length === 0 && (
                            <div className="flex justify-center items-center py-8">
                                <Spinner size="lg" />
                            </div>
                        )}
                        {!isLoadingUpcomingPredictions && upcomingPredictions.length === 0 && (
                            <div className="text-center text-gray-500 py-8 container">
                                No predictions found
                            </div>
                        )}
                        {
                            displayedUpcomingPredictions.map((prediction: IPrediction) => (
                                <div key={prediction.id} className="flex flex-row justify-between cursor-pointer" onClick={() => router.push(`/admin/${prediction.id}`)}>
                                    <div>{prediction.description}</div>
                                    <div>{formatDate(new Date(prediction.resolution_date), "MM/dd/yyyy")}</div>
                                </div>
                            ))
                        }
                        {
                            hasMoreUpcomingPredictions && !isLoadingUpcomingPredictions && displayedUpcomingPredictions.length > 0 && (
                                <div className="flex justify-center mt-4">
                                    <Button
                                        color="primary"
                                        variant="flat"
                                        onPress={loadMoreUpcomingPredictions}
                                        className="min-w-[200px]"
                                    >
                                        Show More
                                    </Button>
                                </div>
                            )
                        }
                    </div>
                )
            }
            {
                activeTab === "resolved" && (
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-row justify-between">
                            <div>Predictions</div>
                            <div>Resolve By</div>
                        </div>
                        {isLoadingResolvedPredictions && resolvedPredictions.length === 0 && (
                            <div className="flex justify-center items-center py-8">
                                <Spinner size="lg" />
                            </div>
                        )}
                        {!isLoadingResolvedPredictions && resolvedPredictions.length === 0 && (
                            <div className="text-center text-gray-500 py-8 container">
                                No predictions found
                            </div>
                        )}
                        {
                            displayedResolvedPredictions.map((prediction: IPrediction) => (
                                <div key={prediction.id} className="flex flex-row justify-between cursor-pointer" onClick={() => router.push(`/admin/${prediction.id}`)}>
                                    <div>{prediction.description}</div>
                                    <div>{formatDate(new Date(prediction.resolution_date), "MM/dd/yyyy")}</div>
                                </div>
                            ))
                        }
                        {
                            hasMoreResolvedPredictions && !isLoadingResolvedPredictions && displayedResolvedPredictions.length > 0 && (
                                <div className="flex justify-center mt-4">
                                    <Button
                                        color="primary"
                                        variant="flat"
                                        onPress={loadMoreResolvedPredictions}
                                        className="min-w-[200px]"
                                    >
                                        Show More
                                    </Button>
                                </div>
                            )
                        }
                    </div>
                )
            }
        </>
    )
}

export default AdminPage;