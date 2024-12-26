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
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

const BetsSkeleton = () => (
    <Card className="hover:shadow-md transition-shadow">
        <CardBody className="p-2">
            <div className="flex gap-3 items-center">
                {/* Event Image Skeleton */}
                <Skeleton className="w-12 h-12 rounded-lg" />

                {/* Title and Category Skeleton */}
                <div className="flex-grow min-w-0 max-w-[200px]">
                    <Skeleton className="h-4 w-32 rounded-lg mb-1" />
                    <Skeleton className="h-3 w-24 rounded-lg mb-1" />
                    <Skeleton className="h-3 w-40 rounded-lg" />
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
    const router = useRouter();
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
            if (response.status) {
                if (pageNumber === 1) {
                    setBets(response.bets);
                } else {
                    setBets(prev => [...prev, ...response.bets]);
                }
            } else {
                toast.error(response.message);
            }

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
        <div className="min-h-screen">
            {/* Responsive Navigation */}
            <nav className="
          fixed
          top-0
          left-0
          z-50
          flex
          flex-row
          md:flex-col
          items-center
          gap-4
         
          w-full
          md:w-20
          p-3
          shadow-md
          
        ">
                {/* Logo/Home Link */}
                <Link href="/" className="flex items-center gap-2">
                    <Image
                        src={"/assets/images/logo-simple.svg"}
                        alt="Hero Image"
                        width={48}
                        height={48}
                        className="rounded-full"
                    />
                </Link>

                {/* Navigation Links */}
                <div className="flex flex-row md:flex-col gap-4 md:mt-6">
                    <Link href="/" className="icon-profile flex justify-center">

                    </Link>
                    <Link href="/bets" className="flex justify-center">
                        <Image
                            src={"/assets/images/bet.svg"}
                            alt="Bets"
                            width={24}
                            height={24}
                            className="rounded-full"
                        />
                    </Link>
                    <Link href="/predictions" className="icon-predict flex justify-center">

                    </Link>
                </div>
            </nav>
            <div className="pt-16 md:pl-20 p-4">
                <header className="mb-4">

                    <h1 className="text-3xl font-bold">Your Bets</h1>
                    <p className="text-default-500 text-sm">Track and manage your betting predictions</p>
                </header>

                <div className="grid gap-2 w-full xl:w-[1200px] mx-auto">
                    {isLoading ? (
                        [...Array(5)].map((_, index) => (
                            <BetsSkeleton key={index} />
                        ))
                    ) : (
                        <>
                            {bets.map((bet: IBet, index: number) => (
                                <div
                                    key={index}
                                    onClick={() => router.push(`/bets/${bet.bet_id}`)}
                                    className="w-full p-4 rounded-lg bg-default-50 hover:bg-default-100 transition-colors border border-default-200 cursor-pointer"
                                >
                                    <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
                                        {/* Left Section: Image and Title */}
                                        <div className="flex gap-4 flex-grow items-start">
                                            <div className="w-16 h-16 relative rounded-xl overflow-hidden flex-shrink-0 shadow-sm">
                                                <Image
                                                    src={bet.str_thumb}
                                                    alt="Event"
                                                    className="w-16 h-16 object-cover"
                                                />
                                            </div>

                                            <div className="flex-grow min-w-0 max-w-[400px]">
                                                <h3 className="text-base font-medium mb-2">
                                                    {bet.description}
                                                </h3>

                                                {/* Source and Date Info */}
                                                <div className="flex gap-3 items-center">
                                                    <Chip size="sm" variant="flat" color="default" className="text-xs">
                                                        {bet.source}
                                                    </Chip>
                                                    <span className="text-xs text-default-400">
                                                        {bet.status == "open"
                                                            ? `Created ${new Date(bet.created_at).toLocaleDateString()}`
                                                            : `Resolved ${new Date(bet.resolution_date).toLocaleDateString()}`
                                                        }
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right Section: Betting Details */}
                                        <div className="flex gap-6 items-center ml-auto">
                                            {/* Predictions */}
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-medium text-default-400">Creator:</span>
                                                    <Chip size="sm" variant="flat" color="warning" className="text-xs">
                                                        {bet.predicted_outcome ? bet.predicted_outcome : bet.creator_choice}
                                                    </Chip>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-medium text-default-400">You:</span>
                                                    <Chip size="sm" variant="flat" color="secondary" className="text-xs">
                                                        {bet.choice}
                                                    </Chip>
                                                </div>
                                            </div>

                                            {/* Amount and Status */}
                                            <div className="flex flex-col items-end gap-1.5">
                                                <Chip size="sm" color={bet.status != "open"
                                                    ? (bet.outcome === bet.choice ? "success" : "danger")
                                                    : "primary"}
                                                    variant="shadow"
                                                    className="font-medium"
                                                >
                                                    {bet.status != "open"
                                                        ? (bet.outcome === bet.choice ? "Won" : "Lost")
                                                        : bet.status}
                                                </Chip>
                                                <div className="text-sm font-medium">
                                                    {bet.amount} credits
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
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