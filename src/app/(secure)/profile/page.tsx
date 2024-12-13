'use client'

import { Card, CardBody, CardHeader } from "@nextui-org/card";
import { Chip } from "@nextui-org/chip";
import { Progress } from "@nextui-org/progress";
import { Divider } from "@nextui-org/divider";
import { Skeleton } from "@nextui-org/skeleton";
import { Button } from "@nextui-org/button";
import { FaRocket, FaDatabase, FaChartLine, FaShieldAlt } from 'react-icons/fa';
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useFetch } from "@/app/utils/lib";
import Image from "next/image";
import { IAgentProfile } from "@/app/utils/interface";

const ProfileSkeleton = () => {
    return (
        <div className="min-h-screen bg-background">
            {/* Header Skeleton */}
            <div className="bg-primary-500 text-white py-8">
                <div className="container mx-auto px-4">
                    <Skeleton className="h-8 w-64 rounded-lg mb-2" />
                    <Skeleton className="h-4 w-48 rounded-lg" />
                </div>
            </div>

            <div className="container mx-auto px-4 py-8">
                {/* Stats Skeleton */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    {[...Array(4)].map((_, i) => (
                        <Card key={i}>
                            <CardBody className="flex flex-row items-center gap-4">
                                <Skeleton className="w-8 h-8 rounded-lg" />
                                <div className="flex-1">
                                    <Skeleton className="h-3 w-20 rounded-lg mb-2" />
                                    <Skeleton className="h-6 w-16 rounded-lg" />
                                </div>
                            </CardBody>
                        </Card>
                    ))}
                </div>

                {/* Interests Skeleton */}
                <Card className="mb-8">
                    <CardHeader className="text-xl font-regular">
                        <Skeleton className="h-6 w-32 rounded-lg" />
                    </CardHeader>
                    <Divider />
                    <CardBody>
                        <div className="flex flex-wrap gap-2">
                            {[...Array(5)].map((_, i) => (
                                <Skeleton key={i} className="h-6 w-24 rounded-full" />
                            ))}
                        </div>
                    </CardBody>
                </Card>

                {/* Principles Skeleton */}
                <Card className="mb-8">
                    <CardHeader className="text-xl font-regular">
                        <Skeleton className="h-6 w-40 rounded-lg" />
                    </CardHeader>
                    <Divider />
                    <CardBody>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[...Array(2)].map((_, i) => (
                                <Card key={i} shadow="sm">
                                    <CardBody>
                                        <Skeleton className="h-5 w-32 rounded-lg mb-2" />
                                        <Skeleton className="h-4 w-full rounded-lg" />
                                    </CardBody>
                                </Card>
                            ))}
                        </div>
                    </CardBody>
                </Card>

                {/* Risk Profile Skeleton */}
                <Card>
                    <CardHeader className="text-xl font-regular">
                        <Skeleton className="h-6 w-32 rounded-lg" />
                    </CardHeader>
                    <Divider />
                    <CardBody>
                        <div className="space-y-6">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <Skeleton className="h-4 w-24 rounded-lg" />
                                        <Skeleton className="h-4 w-32 rounded-lg" />
                                    </div>
                                    <Skeleton className="h-2 w-full rounded-lg" />
                                </div>
                            ))}
                        </div>
                    </CardBody>
                </Card>
            </div>
        </div>
    );
};

const AgentProfile = () => {

    const [agent, setAgent] = useState<IAgentProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const fetch = useFetch();

    useEffect(() => {
        const fetchAgentProfile = async () => {
            try {
                const response = await fetch.get('/api/getAgentProfile');
                if (response.status) {
                    setAgent(response.agent);
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
        <div className="min-h-screen bg-background">
            {/* Header */}
            <div className="bg-primary-500 text-white py-8 flex justify-between items-center px-2 rounded-b-2xl">
                <div className="container mx-auto px-4">
                    <h1 className="text-3xl font-bold">{agent?.name || 'Agent Name'}</h1>
                    <p className="mt-2 opacity-80">{agent?.description || 'Agent Description'}</p>
                    <Button
                        color="default"
                        variant="flat"
                        className="mt-4"
                        href="/editProfile"
                        as="a"
                    >
                        Edit Profile
                    </Button>
                </div>
                <Image
                    src={agent?.image || '/assets/images/default-agent.png'}
                    alt="Agent Image"
                    className="w-[100px] h-[100px] rounded-full"
                    width={100}
                    height={100}
                />
            </div>

            {/* Main Content */}
            <div className="container mx-auto px-4 py-8">
                {/* Stats Overview */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <StatCard
                        icon={<FaRocket />}
                        title="Active Bets"
                        value="23"
                    />
                    <StatCard
                        icon={<FaDatabase />}
                        title="Total Predictions"
                        value="156"
                    />
                    <StatCard
                        icon={<FaChartLine />}
                        title="Success Rate"
                        value="76%"
                    />
                    <StatCard
                        icon={<FaShieldAlt />}
                        title="Max Bet Size"
                        value={`${agent?.maxBetSize || 0} credits`}
                    />
                </div>

                {/* Interests Section */}
                <Card className="mb-8">
                    <CardHeader className="text-xl font-regular">Core Interests</CardHeader>
                    <Divider />
                    <CardBody>
                        <div className="flex flex-wrap gap-2">
                            {agent?.interests && agent?.interests.length > 0 && agent?.interests.map((interest) => (
                                <Chip
                                    key={interest}
                                    color="primary"
                                    variant="flat"
                                >
                                    {interest}
                                </Chip>
                            ))}
                        </div>
                    </CardBody>
                </Card>

                {/* Betting Principles */}
                <Card className="mb-8 max-w-[1024px]">
                    <CardHeader className="text-xl font-regular">Betting Principles</CardHeader>
                    <Divider />
                    <CardBody>
                        <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                            {
                                agent?.principles && agent?.principles.length > 0 && agent?.principles.map((principle) => (
                                    <PrincipleCard
                                        key={principle.title}
                                        title={principle.title}
                                        description={principle.description}
                                    />
                                ))
                            }
                        </div>
                    </CardBody>
                </Card>

                {/* Risk Profile */}
                <Card>
                    <CardHeader className="text-xl font-regular">Risk Profile</CardHeader>
                    <Divider />
                    <CardBody>
                        <div className="space-y-6">
                            <RiskItem
                                level="Conservative"
                                description="Timeline-based predictions"
                                value={agent?.conservativeBetSize || 0}
                                color="success"
                            />
                            <RiskItem
                                level="Moderate"
                                description="Interest-aligned bets"
                                value={agent?.moderateBetSize || 0}
                                color="warning"
                            />
                            <RiskItem
                                level="Strategic"
                                description="Underdog positioning"
                                value={agent?.aggressiveBetSize || 0}
                                color="danger"
                            />
                        </div>
                    </CardBody>
                </Card>
            </div>
        </div>
    );
};

interface StatCardProps {
    icon: React.ReactNode;
    title: string;
    value: string;
}

const StatCard = ({ icon, title, value }: StatCardProps) => (
    <Card>
        <CardBody className="flex flex-row items-center gap-4">
            <div className="text-primary text-2xl">{icon}</div>
            <div>
                <p className="text-default-500">{title}</p>
                <p className="text-2xl font-regular">{value}</p>
            </div>
        </CardBody>
    </Card>
);

interface PrincipleCardProps {
    title: string;
    description: string;
}

const PrincipleCard = ({ title, description }: PrincipleCardProps) => (
    <Card shadow="sm">
        <CardBody>
            <h3 className="font-regular mb-2">{title}</h3>
            <p className="text-default-500">{description}</p>
        </CardBody>
    </Card>
);

interface RiskItemProps {
    level: string;
    description: string;
    value: number;
    color: "success" | "warning" | "danger";
}

const RiskItem = ({ level, description, value, color }: RiskItemProps) => (
    <div className="space-y-2">
        <div className="flex justify-between items-center">
            <span className="font-regular">{level}</span>
            <span className="text-default-500">{description}</span>
        </div>
        <Progress
            color={color}
            value={value}
            className="max-w-full"
        />
    </div>
);

export default AgentProfile;