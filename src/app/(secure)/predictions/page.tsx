'use client';

import { Card, CardBody, CardHeader } from "@nextui-org/card";
import {
    Table,
    TableBody,
    TableCell,
    TableColumn,
    TableHeader,
    TableRow
} from "@nextui-org/table";
import { Image } from "@nextui-org/image";
import { Chip } from "@nextui-org/chip";
import { Spinner } from "@nextui-org/spinner";
import { useEffect, useState } from "react";
import { useFetch } from "@/app/utils/lib";
import { formatDate } from "date-fns";
import Link from "next/link";
interface IPrediction {
    id: string;
    description: string;
    source: string;
    predicted_outcome: string;
    creator_choice: string;
    bets_count: number;
    status: string;
    bet_amount: number;
    resolution_date: string;
    str_thumb: string;
    outcome: string;
}

const ITEMS_PER_PAGE = 15;

const Predictions = () => {
    const [predictions, setPredictions] = useState<IPrediction[]>([]);
    const [displayedPredictions, setDisplayedPredictions] = useState<IPrediction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const fetch = useFetch();

    useEffect(() => {
        const fetchPredictions = async () => {
            const response = await fetch.get('/api/getPredictionHistory');
            setPredictions(response.predictions);
            setDisplayedPredictions(response.predictions.slice(0, ITEMS_PER_PAGE));
            setHasMore(response.predictions.length > ITEMS_PER_PAGE);
            setIsLoading(false);
        };
        fetchPredictions();
    }, []);

    // Load more items when scrolling
    useEffect(() => {
        const loadMore = () => {
            console.log('Loading more items, current page:', page);
            setTimeout(() => {
                const nextItems = predictions.slice(0, (page + 1) * ITEMS_PER_PAGE);
                console.log('Next items length:', nextItems.length);
                setDisplayedPredictions(nextItems);
                setHasMore(nextItems.length < predictions.length);
                setPage(prev => prev + 1);
            }, 3000);
        };

        const observer = new IntersectionObserver(
            (entries) => {
                console.log('Intersection observed:', entries[0].isIntersecting);
                if (entries[0].isIntersecting && hasMore) {
                    loadMore();
                }
            },
            { threshold: 0.5 }
        );

        const sentinel = document.getElementById('sentinel');
        if (sentinel) {
            observer.observe(sentinel);
        }

        return () => observer.disconnect();
    }, [page, hasMore, predictions, ITEMS_PER_PAGE]);

    if (isLoading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <Spinner size="lg" />
            </div>
        );
    }

    return (
        predictions && predictions.length > 0 &&

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

        
        <div className="container mx-auto py-6 min-h-screen">
            {/* <button
                onClick={() => router.back()}
                className="mb-4 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
                ← Back
            </button> */}
            <h1 className="text-2xl font-bold mb-6">Active Predictions</h1>

            <div className="grid gap-6 md:grid-cols-3 mb-6">
                <Card className="bg-content0">
                    <CardHeader className="text-sm font-medium">Total Active Predictions</CardHeader>
                    <CardBody>
                        <p className="text-2xl font-bold">
                            {predictions.filter((p: IPrediction) => p.status === 'open').length}
                        </p>
                    </CardBody>
                </Card>

                <Card className="bg-content0">
                    <CardHeader className="text-sm font-medium">Total Bets Placed</CardHeader>
                    <CardBody>
                        <p className="text-2xl font-bold">
                            {predictions.reduce((acc: number, curr: IPrediction) => acc + curr.bets_count, 0)}
                        </p>
                    </CardBody>
                </Card>

                <Card className="bg-content0">
                    <CardHeader className="text-sm font-medium">Win Rate</CardHeader>
                    <CardBody>
                        <p className="text-2xl font-bold">
                            {predictions.filter((p: IPrediction) => p.outcome === p.creator_choice).length / predictions.length * 100}%
                        </p>
                    </CardBody>
                </Card>
            </div>

            <Card>
                <CardBody className="p-0">
                    <Table>
                        <TableHeader>
                            <TableColumn>Image</TableColumn>
                            <TableColumn maxWidth={300}>Description</TableColumn>
                            <TableColumn>Source</TableColumn>
                            <TableColumn>Bet</TableColumn>
                            <TableColumn>Amount</TableColumn>
                            <TableColumn>Resolution Date</TableColumn>
                            <TableColumn>Bets Count</TableColumn>
                            <TableColumn>Status</TableColumn>
                        </TableHeader>
                        <TableBody>
                            {displayedPredictions.map((prediction: IPrediction, index: number) => (
                                <TableRow key={index}>
                                    <TableCell>
                                        <Image src={prediction.str_thumb} alt={prediction.description} width={40} height={40} />
                                    </TableCell>
                                    <TableCell className="max-w-[300px]">{prediction.description}</TableCell>
                                    <TableCell>{prediction.source}</TableCell>
                                    <TableCell>{prediction.predicted_outcome ? prediction.predicted_outcome : prediction.creator_choice}</TableCell>
                                    <TableCell>{prediction.bet_amount}</TableCell>
                                    <TableCell className="no-wrap">
                                        {formatDate(prediction.resolution_date, 'MM/dd/yyyy')}
                                    </TableCell>
                                    <TableCell>{prediction.bets_count}</TableCell>
                                    <TableCell>
                                        <Chip
                                            color={prediction.status === 'open' ? 'primary' : 'secondary'}
                                            variant="flat"
                                        >
                                            {
                                                prediction.status === 'open' ? 'Open'
                                                    : prediction.outcome === prediction.creator_choice ? 'Win' : 'Loss'
                                            }
                                        </Chip>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardBody>
            </Card>

            {/* Loading indicator at the bottom */}
            <div id="sentinel" className="flex justify-center p-4">
                {hasMore && <Spinner size="sm" />}
                {!hasMore && predictions.length > 0 && (
                    <p className="text-gray-500">No more predictions to load</p>
                )}
            </div>
        </div>
        </div>
    );
}

export default Predictions;