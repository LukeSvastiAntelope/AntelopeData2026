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
import { toast } from "react-hot-toast";

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
            try {
                const response = await fetch.get('/api/getPredictionHistory');
                if (response.status) {
                    setPredictions(response.predictions);
                    setDisplayedPredictions(response.predictions.slice(0, ITEMS_PER_PAGE));
                    setHasMore(response.predictions.length > ITEMS_PER_PAGE);
                    setIsLoading(false);
                } else {
                    toast.error(response.message);
                    setIsLoading(false);
                }
            } catch (error) {
                toast.error('Failed to fetch predictions: ' + error);
                setIsLoading(false);
            }

        };
        fetchPredictions();
    }, []);

    useEffect(() => {
        const loadMore = () => {
            const nextItems = predictions.slice(0, (page + 1) * ITEMS_PER_PAGE);
            setDisplayedPredictions(nextItems);
            setHasMore(nextItems.length < predictions.length);
            setPage(prev => prev + 1);
        };

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore) {
                    requestAnimationFrame(() => {
                        loadMore();
                    });
                }
            },
            { threshold: 0.5 }
        );

        const sentinel = document.getElementById('sentinel');
        if (sentinel) {
            observer.observe(sentinel);
        }

        return () => observer.disconnect();
    }, [page, hasMore, predictions]);

    if (isLoading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <Spinner size="lg" />
            </div>
        );
    }

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
                    <Link href="/bets" className="icon-bet flex justify-center">

                    </Link>
                    <Link href="/predictions" className="icon-predict flex justify-center">
                        <Image
                            src={"/assets/images/predict.svg"}
                            alt="Predictions"
                            width={24}
                            height={24}
                            className="rounded-full"
                        />
                    </Link>
                </div>
            </nav>

            {
                predictions && predictions.length > 0 && (
                    <div className="container mx-auto py-6 min-h-screen px-4 sm:px-2">
                        <h1 className="text-2xl font-bold mb-6">Active Predictions</h1>

                        {/* Stats Row */}
                        <div className="grid gap-6 md:grid-cols-3 mb-6">
                            <Card className="bg-content0">
                                <CardHeader className="text-sm font-medium">Total Active Predictions</CardHeader>
                                <CardBody>
                                    <p className="text-2xl font-bold">
                                        {predictions.filter((p) => p.status === 'open').length}
                                    </p>
                                </CardBody>
                            </Card>

                            <Card className="bg-content0">
                                <CardHeader className="text-sm font-medium">Total Bets Placed</CardHeader>
                                <CardBody>
                                    <p className="text-2xl font-bold">
                                        {predictions.reduce((acc, curr) => acc + curr.bets_count, 0)}
                                    </p>
                                </CardBody>
                            </Card>

                            <Card className="bg-content0">
                                <CardHeader className="text-sm font-medium">Win Rate</CardHeader>
                                <CardBody>
                                    <p className="text-2xl font-bold">
                                        {(
                                            (predictions.filter((p) => p.outcome === p.creator_choice).length /
                                                predictions.length) *
                                            100
                                        ).toFixed(2)}
                                        %
                                    </p>
                                </CardBody>
                            </Card>
                        </div>

                        {/* Table Description */}
                        <p className="text-gray-500 mb-4">
                            Below table shows your predictions, their sources, placed bets, and current status
                        </p>

                        {/* Responsive Table (horizontal scroll on small screens) */}
                        <Card>
                            <CardBody className="p-0 overflow-x-auto">
                                <Table
                                    aria-label="Predictions table"
                                    className="min-w-[600px]"
                                >
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
                                        {displayedPredictions.map((prediction, index) => (
                                            <TableRow key={index}>
                                                <TableCell>
                                                    <Image
                                                        src={prediction.str_thumb}
                                                        alt={prediction.description}
                                                        width={40}
                                                        height={40}
                                                    />
                                                </TableCell>
                                                <TableCell className="max-w-[300px] break-words">
                                                    {prediction.description}
                                                </TableCell>
                                                <TableCell>{prediction.source}</TableCell>
                                                <TableCell>
                                                    {prediction.predicted_outcome || prediction.creator_choice}
                                                </TableCell>
                                                <TableCell>{prediction.bet_amount}</TableCell>
                                                <TableCell>
                                                    {formatDate(prediction.resolution_date, 'MM/dd/yyyy')}
                                                </TableCell>
                                                <TableCell>{prediction.bets_count}</TableCell>
                                                <TableCell>
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
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardBody>
                        </Card>

                        {/* Scroll sentinel & spinner */}
                        <div id="sentinel" className="flex justify-center p-4">
                            {hasMore && <Spinner size="sm" />}
                            {!hasMore && predictions.length > 0 && (
                                <p className="text-gray-500">No more predictions to load</p>
                            )}
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default Predictions;