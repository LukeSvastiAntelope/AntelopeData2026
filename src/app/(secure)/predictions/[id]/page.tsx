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

interface IAgentProfile {
    image?: string;
    name?: string;
    // add any other fields you need from /api/getAgentProfile
}

export default function PredictionDetail() {
    const params = useParams();
    const fetchData = useFetch();
    const router = useRouter();

    // Local state
    const [prediction, setPrediction] = useState<PredictionDB | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [agent, setAgent] = useState<IAgentProfile | null>(null);
    const [agentBalance, setAgentBalance] = useState(0);

    // fetchAgentProfile
    const fetchAgentProfile = async () => {
        try {
          const response = await fetchData.get("/api/getAgentProfile");
          if (response.status) {
            setAgent(response.agent);
            setAgentBalance(response.agent.wallet_balance ?? 0);
          } else {
            toast.error(response.message);
          }
        } catch (error) {
          console.error("Failed to fetch agent profile:", error);
          toast.error("Failed to fetch agent profile");
        }
      };

   
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
        if (params.id) {
          fetchAgentProfile();
          fetchPredictionDetails(params.id as string);
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
        <div className="flex text-white">
            {/* Sidebar (similar to bets/[id]/page.tsx) */}
            <aside className="md:w-64 md:flex-col md:left-auto left-0 fixed top-0 text-sm w-full">
                <nav className="flex flex-row md:flex-col gap-4 text-normal justify-evenly py-8 px-4 ">
                    <div className="flex flex-row md:flex-col justify-evenly w-full">
                        <div className="flex items-center mb-4">
                            {/* Large logo for md+ screens */}
                            <span className="hidden md:inline-block">
                                <Image
                                    src={"/assets/images/logo-text.svg"}
                                    alt="Dashboard Logo"
                                    width={160}
                                    height={40}
                                    className="mr-2 w-100"
                                />
                            </span>

                            {/* Smaller logo for mobile screens */}

                        </div>
                        {/* Profile Photo */}
                        <Link href="/profile" className="md:flex items-center gap-2 mb-4 hidden p-2 border border-white/10 rounded-lg backbutton">
              <Image
                src={agent?.image || "/assets/images/logo-simple.svg"}
                alt="Profile"
                width={32}
                height={32}
                className="rounded-full bg-gray-700 mr-2 sm-hidden"
              />
              {/* Credits */}
              <div className="flex flex-col">
              <span className="text-sm font-semibold font-kodemono w-full"> {agent?.name || 'Agent Name'} </span>
              <span className="text-gradient">{agentBalance?.toLocaleString() || 0}</span>
              </div>

            </Link>
                        <Link
                            href="/dashboard"
                            className="flex items-center gap-2 mb-4 group"
                        >
                            {/* default icon */}
                            <span className="icon-dashboard mr-2 block group-hover:hidden " />
                            {/* hover icon */}
                            <span className="icon-dashboard-active mr-2 hidden group-hover:block" />
                            <span className="text-default-400 group-hover:text-white font-kodemono"><span className="hidden md:inline-block">Dashboard</span></span>
                        </Link>
                        <Link
                            href="/markets"
                            className="flex items-center gap-2 mb-4 group"
                        >
                            {/* default icon */}
                            <span className="icon-markets mr-2 block group-hover:hidden " />
                            {/* hover icon */}
                            <span className="icon-markets-active mr-2 hidden group-hover:block" />
                            <span className="text-default-400 group-hover:text-white font-kodemono"><span className="hidden md:inline-block">Markets</span></span>
                        </Link>

                        <Link href="/strategy" className="flex items-center gap-2 mb-4 group text-default-400">
                            {/* default icon */}
                            <span className="icon-strategy mr-2 block group-hover:hidden" />
                            {/* hover icon */}
                            <span className="icon-strategy-active mr-2 hidden sm:enlarge-icon group-hover:block" />
                            <span className="text-default-400 group-hover:text-white font-kodemono"><span className="hidden md:inline-block">Strategy</span></span>
                        </Link>
                    </div>

                    <div className="md:hidden min-w-40px min-h-40px max-w-40px max-h-40px center-logo">
                    </div>

                    <div className="flex flex-row md:flex-col justify-evenly w-full">
                        <Link href="/about" className="flex items-center gap-2 mb-4 text-default-400 group">
                            {/* default icon */}
                            <span className="icon-about mr-2 block group-hover:hidden" />
                            {/* hover icon */}
                            <span className="icon-about-active mr-2 hidden group-hover:block" />
                            <span className="text-default-400 group-hover:text-white font-kodemono"><span className="hidden md:inline-block">About</span></span>
                        </Link>
                        <Link href="https://discord.gg/dSEV8YCDQ2" className="flex items-center gap-2 mb-4 text-default-400 group">
                            {/* default icon */}
                            <span className="icon-support mr-2 block group-hover:hidden" />
                            {/* hover icon */}
                            <span className="icon-support-active mr-2 hidden group-hover:block" />
                            <span className="text-default-400 group-hover:text-white font-kodemono"><span className="hidden md:inline-block">Community</span></span>
                        </Link>
                        <Link href="/logout" className="flex items-center gap-2 mb-4 text-default-400 group">
                            {/* default icon */}
                            <span className="icon-logout mr-2 block group-hover:hidden" />
                            {/* hover icon */}
                            <span className="icon-logout-active mr-2 hidden group-hover:block" />
                            <span className="text-default-400 group-hover:text-white font-kodemono"><span className="hidden md:inline-block">Log out</span></span>
                        </Link>
                    </div>
                </nav>
            </aside>

            {/* Main Content Area (mirror bets detail style) */}
            <main className="flex-1 ml-0 md:ml-64 container mt-14 md:mt-0  mx-auto px-4 py-6 md:px-8 md:py-8 min-w-full md:min-w-[800px] max-w-full md:max-w-[800px]">
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
            </main>
        </div>
    );
} 