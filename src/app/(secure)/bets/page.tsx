'use client'

import { Card, CardBody } from "@nextui-org/card";
import { Chip } from "@nextui-org/chip";
import { Image } from "@nextui-org/image";
import { Skeleton } from "@nextui-org/skeleton";
import { Button } from "@nextui-org/button";
import { useState, useEffect } from "react";
import { useFetch } from "@/app/utils/lib";
import { IBet } from "@/app/utils/interface";
import Link from "next/link";

const BetsSkeleton = () => (
    <Card className="hover:shadow-md transition-shadow">
        <CardBody className="p-2">
            <div className="flex gap-3 items-center">
                {/* Event Image Skeleton */}
                <Skeleton className="w-12 h-12 rounded-lg" />

                {/* Title and Category Skeleton */}
                <div className="flex-grow min-w-0 max-w-[200px]">
                    <Skeleton className="h-4 w-32 rounded-lg mb-1" />
                    <Skeleton className="h-3 w-24 rounded-lg" />
                </div>

                {/* Question Skeleton */}
                <div className="flex-grow min-w-0 max-w-[300px]">
                    <Skeleton className="h-4 w-full rounded-lg" />
                </div>

                {/* Choices Skeleton */}
                <div className="flex gap-4 min-w-[200px]">
                    <Skeleton className="h-4 w-20 rounded-lg" />
                    <Skeleton className="h-4 w-20 rounded-lg" />
                </div>

                {/* Stake Skeleton */}
                <div className="min-w-[80px] text-center">
                    <Skeleton className="h-4 w-16 rounded-lg mx-auto" />
                </div>

                {/* Category Chip Skeleton */}
                <div className="min-w-[80px]">
                    <Skeleton className="h-4 w-16 rounded-lg" />
                </div>

                {/* Status Skeleton */}
                <div className="min-w-[70px]">
                    <Skeleton className="h-4 w-16 rounded-lg" />
                </div>

                {/* Date Skeleton */}
                <div className="min-w-[90px] text-right">
                    <Skeleton className="h-4 w-20 rounded-lg ml-auto" />
                </div>
            </div>
        </CardBody>
    </Card>
);

const BetsPage = () => {
    const [bets, setBets] = useState<IBet[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [page, setPage] = useState<number>(1);
    const [hasMore, setHasMore] = useState<boolean>(true);
    const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
    const ITEMS_PER_PAGE = 10;
    const fetch = useFetch();

    const fetchBets = async (pageNumber: number) => {
        try {
            setIsLoadingMore(true);
            const response = await fetch.get(`/api/getAgentBetHistory?page=${pageNumber}&limit=${ITEMS_PER_PAGE}`);

            if (pageNumber === 1) {
                setBets(response.bets);
            } else {
                setBets(prev => [...prev, ...response.bets]);
            }

            // Check if there are more items to load
            setHasMore(response.bets.length === ITEMS_PER_PAGE);
            setIsLoading(false);
            setIsLoadingMore(false);
        } catch (error) {
            console.error('Failed to fetch bets:', error);
            setIsLoading(false);
            setIsLoadingMore(false);
        }
    };

    useEffect(() => {
        fetchBets(1);
    }, []);

    const loadMore = () => {
        if (!isLoadingMore && hasMore) {
            const nextPage = page + 1;
            setPage(nextPage);
            fetchBets(nextPage);
        }
    };

    return (
        <div className="min-h-screen flex text-align:center;">
        <div className="fixed top-0 left-0">
            <Link href="/">
                <Image
                    src={"/assets/images/logo-simple.svg"}
                    alt="Hero Image"
                    width={80}
                    height={80}
                    className="rounded-full"
                />
            </Link>
            <Link href="/bets" className="flex justify-center pb-4">
                <Image
                    src={"/assets/images/bet.svg"}
                    alt="Hero Image"
                    width={32}
                    height={32}
                    className="rounded-full"
                />
            </Link>
            <Link href="/predictions" className="flex justify-center">
                <Image
                    src={"/assets/images/predict.svg"}
                    alt="Hero Image"
                    width={32}
                    height={32}
                    className="rounded-full"
                />
            </Link>
            </div>

        <div className="min-h-screen  p-6">
            <header className="mb-4">
                {/* <Button
                    className="mb-4"
                    variant="light"
                    startContent={<FaArrowLeft />}
                    onPress={() => router.back()}
                >
                    Back
                </Button> */}
                <h1 className="text-3xl font-bold">Your Bets</h1>
                <p className="text-default-500 text-sm">Track and manage your betting predictions</p>
            </header>

            <div className="grid gap-2 max-w-[1200px] mx-auto">
                {isLoading ? (
                    [...Array(5)].map((_, index) => (
                        <BetsSkeleton key={index} />
                    ))
                ) : (
                    <>
                        {bets.map((bet: IBet, index: number) => (
                            <Card key={index} className="hover:shadow-md transition-shadow ">
                                <CardBody className="p-2">
                                    <div className="flex gap-3 items-center">
                                        {/* Event Image */}
                                        <div className="w-12 h-12 relative rounded-lg overflow-hidden flex-shrink-0">
                                            <Image
                                                src={bet.str_thumb}
                                                alt="Event"
                                                className="w-12 h-12"
                                            />
                                        </div>

                                        {/* Title and Category */}
                                        <div className="flex-grow min-w-0 max-w-[300px]">
                                            <h3 className="text-sm font-regular">
                                                {bet.description}
                                            </h3>
                                        </div>

                                        {/* Choices */}
                                        <div className="flex gap-4 min-w-[200px]">
                                            <span className="text-xs">
                                                <span className="text-default-500">Creator:</span>
                                                {bet.predicted_outcome ? bet.predicted_outcome : bet.creator_choice}
                                            </span>
                                            <span className="text-xs">
                                                <span className="text-default-500">You:</span> {bet.choice}
                                            </span>
                                        </div>

                                        {/* Stake */}
                                        <div className="min-w-[80px] text-center">
                                            <span className="text-xs text-default-500">
                                                {bet.amount} credits
                                            </span>
                                        </div>

                                        {/* Category Chip */}
                                        <div className="min-w-[80px]">
                                            <Chip size="sm" variant="flat" color="default" className="text-xs">
                                                {bet.source}
                                            </Chip>
                                        </div>

                                        {/* Status */}
                                        <div className="min-w-[70px]">
                                            <Chip size="sm" color={bet.status != "open" ? (bet.outcome === bet.choice ? "success" : "danger") : "primary"} variant="flat">
                                                {bet.status != "open" ? (bet.outcome === bet.choice ? "Won" : "Lost") : bet.status}
                                            </Chip>
                                        </div>

                                        {/* Date */}
                                        <div className="min-w-[90px] text-right">
                                            <span className="text-xs text-default-500">
                                                {
                                                    bet.status == "open" ? new Date(bet.created_at).toLocaleDateString() : new Date(bet.resolution_date).toLocaleDateString()
                                                }
                                            </span>
                                        </div>
                                    </div>
                                </CardBody>
                            </Card>
                        ))}

                        {/* Show More Button */}
                        {hasMore && (
                            <div className="flex justify-center mt-4">
                                <Button
                                    color="primary"
                                    variant="flat"
                                    onPress={loadMore}
                                    isLoading={isLoadingMore}
                                    className="min-w-[200px]"
                                >
                                    {isLoadingMore ? "Loading..." : "Show More"}
                                </Button>
                            </div>
                        )}

                        {/* Loading More Skeleton */}
                        {isLoadingMore && (
                            [...Array(2)].map((_, index) => (
                                <BetsSkeleton key={`loading-more-${index}`} />
                            ))
                        )}

                        {/* No More Items Message */}
                        {!hasMore && bets.length > 0 && (
                            <div className="text-center text-default-500 py-4">
                                No more bets to load
                            </div>
                        )}

                        {/* Empty State */}
                        {!isLoading && bets.length === 0 && (
                            <div className="text-center text-default-500 py-8">
                                No bets found
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
        </div>
    );
}

export default BetsPage;