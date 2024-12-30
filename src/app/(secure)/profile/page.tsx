'use client'

import { Chip } from "@nextui-org/chip";
import { Skeleton } from "@nextui-org/skeleton";
import { Button } from "@nextui-org/button";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useFetch } from "@/app/utils/lib";
import Image from "next/image";
import { IAgentProfile } from "@/app/utils/interface";
import Link from "next/link";

const ProfileSkeleton = () => {
    return (
        <div className="min-h-screen">
            {/* Sidebar Skeleton */}
            <aside className="w-64 fixed top-0 text-sm">
                <nav className="flex min-h-screen flex-col gap-4 text-normal justify-between p-4">
                    <div>
                        <Skeleton className="w-[160px] h-[40px] mb-4" /> {/* Logo */}
                        <div className="flex items-center gap-2 mb-4">
                            <Skeleton className="w-[24px] h-[24px] rounded-full" />
                            <Skeleton className="h-4 w-20 rounded-lg" />
                        </div>
                        {/* Nav Items */}
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="flex items-center gap-2 mb-4">
                                <Skeleton className="w-5 h-5 rounded" />
                                <Skeleton className="h-4 w-24 rounded-lg" />
                            </div>
                        ))}
                    </div>
                    <div>
                        {/* Bottom Nav Items */}
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="flex items-center gap-2 mb-4">
                                <Skeleton className="w-5 h-5 rounded" />
                                <Skeleton className="h-4 w-24 rounded-lg" />
                            </div>
                        ))}
                    </div>
                </nav>
            </aside>

            {/* Main Content */}
            <div className="flex-1 ml-64 container mx-auto px-4 py-6 md:px-8 md:py-8 max-w-[800px]">
                {/* Profile Header Card */}
                <div className="bg-content1/50 backdrop-blur-md rounded-2xl p-8 shadow-lg border border-white/10">
                    <div className="flex flex-col md:flex-row items-center gap-8">
                        <div className="relative">
                            <Skeleton className="w-[140px] h-[140px] rounded-full" />
                            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2">
                                <Skeleton className="h-8 w-28 rounded-lg" />
                            </div>
                        </div>
                        <div className="flex-1 text-center md:text-left space-y-3">
                            <Skeleton className="h-10 w-64 rounded-lg mb-2" />
                            <Skeleton className="h-20 w-full rounded-lg mb-4" />
                            <div className="flex flex-wrap gap-2 mt-4 justify-center md:justify-start">
                                {[...Array(3)].map((_, i) => (
                                    <Skeleton key={i} className="h-8 w-28 rounded-full" />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const AgentProfile = () => {

    const [agent, setAgent] = useState<IAgentProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [totalBets, setTotalBets] = useState(0);
    const [successRate, setSuccessRate] = useState(0);
    const fetch = useFetch();

    useEffect(() => {
        const fetchAgentProfile = async () => {
            try {
                const response = await fetch.get('/api/getAgentProfile');
                if (response.status) {
                    setAgent(response.agent);
                    setTotalBets(response.totalBets);
                    setSuccessRate(response.successRate);
                } else {
                    toast.error(response.message);
                }
            } catch (error) {
                console.log(error);
                toast.error('Failed to fetch agent profile');
            }
            setIsLoading(false);
        };
        fetchAgentProfile();
    }, []);

    if (isLoading) return <ProfileSkeleton />;

    return (
        <div className="min-h-screen">
            <aside className="w-64 fixed top-0 text-sm">
                <nav className="flex min-h-screen flex-col gap-4 text-normal justify-between p-4">
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
                        <Link href="/profile" className="flex items-center gap-2 mb-4">
                        <Image
                        src={agent?.image || '/assets/images/default-agent.png'}
                        alt="Agent Image"
                        className="w-[24px] h-[24px] rounded-full"
                        width={24}
                        height={24}
                    />
                            <span className="text-sm font-semibold icon-credits px-5 font-kodemono">
                                <span className="text-gradient">83940</span>
                            </span>
                        </Link>
                        <Link href="/dashboard" className="flex items-center gap-2 mb-4 text-white font-kodemono">
                            <span className="icon-dashboard mr-2" /> Dashboard
                        </Link>
                        <Link 
                            href="/markets" 
                            className="flex items-center gap-2 mb-4 group"
                        >
                            <span className="icon-markets mr-2 block group-hover:hidden" />
                            <span className="icon-markets-active mr-2 hidden group-hover:block" />
                            <span className="text-default-400 group-hover:text-white font-kodemono">Markets</span>
                        </Link>
                        <Link href="/strategy" className="flex items-center gap-2 mb-4 group text-default-400">
                            <span className="icon-strategy mr-2 block group-hover:hidden" />
                            <span className="icon-strategy-active mr-2 hidden group-hover:block" />
                            <span className="text-default-400 group-hover:text-white font-kodemono">Strategy</span>
                        </Link>
                    </div>

                    <div>
                        <Link href="/about" className="flex items-center gap-2 mb-4 text-default-400 group">
                            <span className="icon-about mr-2 block group-hover:hidden" />
                            <span className="icon-about-active mr-2 hidden group-hover:block" />
                            <span className="text-default-400 group-hover:text-white font-kodemono">About</span>
                        </Link>
                        <Link href="https://discord.gg/dSEV8YCDQ2" className="flex items-center gap-2 mb-4 text-default-400 group">
                            <span className="icon-support mr-2 block group-hover:hidden" />
                            <span className="icon-support-active mr-2 hidden group-hover:block" />
                            <span className="text-default-400 group-hover:text-white font-kodemono">Community</span>
                        </Link>
                        <Link href="/signout" className="flex items-center gap-2 mb-4 text-default-400 group">
                            <span className="icon-logout mr-2 block group-hover:hidden" />
                            <span className="icon-logout-active mr-2 hidden group-hover:block" />
                            <span className="text-default-400 group-hover:text-white font-kodemono">Sign out</span>
                        </Link>
                    </div>
                </nav>
            </aside>

            <div className="flex-1 ml-64 container mx-auto px-4 py-6 md:px-8 md:py-8 max-w-[800px]">
                {/* Header */}
                <div className="bg-content1/50 backdrop-blur-md rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 border border-white/10">
                    <div className="flex flex-col md:flex-row items-center gap-8">
                        <div className="relative group">
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-secondary rounded-full blur opacity-30 group-hover:opacity-60 transition duration-300"></div>
                            <Image
                                src={agent?.image || '/assets/images/default-agent.png'}
                                alt="Agent Image"
                                className="relative w-[140px] h-[140px] rounded-full border-4 border-white/10 group-hover:scale-105 transition-transform duration-300"
                                width={140}
                                height={140}
                            />
                            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transform group-hover:-translate-y-1 transition-all duration-300">
                                <Button
                                    size="sm"
                                    color="primary"
                                    variant="shadow"
                                    className="px-4 py-2 font-medium"
                                    href="/editProfile"
                                    as="a"
                                >
                                    <span className="icon-edit mr-2" />
                                    Edit Profile
                                </Button>
                            </div>
                        </div>
                        
                        <div className="flex-1 text-center md:text-left space-y-3">
                            <div className="relative">
                                <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent bg-[length:200%] animate-gradient">
                                    {agent?.name || 'Agent Name'}
                                </h1>
                                <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-secondary/20 blur-xl opacity-0 group-hover:opacity-100 transition duration-300"></div>
                            </div>
                            <p className="text-default-500 text-lg leading-relaxed max-w-2xl">
                                {agent?.description || 'Agent Description'}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-4 justify-center md:justify-start">
                                <Chip
                                    variant="shadow"
                                    classNames={{
                                        base: "bg-gradient-to-br from-primary to-secondary",
                                        content: "drop-shadow-md text-white font-medium",
                                    }}
                                >
                                    Pro Agent
                                </Chip>
                                <Chip
                                    variant="bordered"
                                    classNames={{
                                        base: "border-primary/30 hover:bg-primary/10 transition-colors",
                                        content: "text-primary",
                                    }}
                                >
                                    {totalBets} Bets
                                </Chip>
                                <Chip
                                    variant="bordered"
                                    classNames={{
                                        base: "border-secondary/30 hover:bg-secondary/10 transition-colors",
                                        content: "text-secondary",
                                    }}
                                >
                                    {successRate}% Success Rate
                                </Chip>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgentProfile;