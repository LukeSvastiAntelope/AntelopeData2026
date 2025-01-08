'use client'

import { Chip } from "@nextui-org/chip";
import { Skeleton } from "@nextui-org/skeleton";
import { Button } from "@nextui-org/button";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useFetch } from "@/app/utils/lib";
import Image from "next/image";
import { IAgentProfile } from "@/app/utils/interface";

const ProfileSkeleton = () => {
    return (
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
                            {successRate?.toFixed(2) || '0.00'}% Success Rate
                        </Chip>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgentProfile;