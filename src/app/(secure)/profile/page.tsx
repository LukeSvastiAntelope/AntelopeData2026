'use client'

import { Card, CardBody, CardHeader } from "@nextui-org/card";
import { Chip } from "@nextui-org/chip";
import { Progress } from "@nextui-org/progress";
import { Divider } from "@nextui-org/divider";
import { Skeleton } from "@nextui-org/skeleton";
import { Button } from "@nextui-org/button";
import { FaRocket, FaDatabase, FaChartLine, FaShieldAlt, FaCoins } from 'react-icons/fa';
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useFetch } from "@/app/utils/lib";
import Image from "next/image";
import { IAgentProfile } from "@/app/utils/interface";
import { convertDaysToYMD } from "@/app/utils/lib";
import { CATEGORIES } from "@/app/utils/const";
import Link from "next/link";

const ProfileSkeleton = () => {
    return (
        <div className="min-h-screen">
            {/* Logo Skeleton */}
            <div className="fixed top-0 left-0">
                <Skeleton className="w-[80px] h-[80px] rounded-full" />
            </div>

            <div className="container mx-auto px-4 py-8">
                {/* Header Skeleton */}
                <div className="py-8 flex justify-between items-center px-2 rounded-b-2xl flex-row">
                    <div className="container mx-auto px-4">
                        <Skeleton className="h-10 w-64 rounded-lg mb-2" />
                        <Skeleton className="h-4 w-48 rounded-lg mb-4" />
                        <Skeleton className="h-9 w-28 rounded-lg" />
                    </div>
                    <Skeleton className="w-[100px] h-[100px] rounded-full" />
                </div>

                {/* Stats Skeleton */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    {[...Array(4)].map((_, i) => (
                        <Card key={i} className="bg-content0">
                            <CardBody className="flex flex-row items-center gap-4">
                                <Skeleton className="w-6 h-6 rounded-lg" />
                                <div>
                                    <Skeleton className="h-4 w-24 rounded-lg mb-2" />
                                    <Skeleton className="h-6 w-20 rounded-lg" />
                                </div>
                            </CardBody>
                        </Card>
                    ))}
                </div>

                {/* Betting Settings Skeleton */}
                <Card className="mb-8">
                    <CardHeader>
                        <Skeleton className="h-6 w-36 rounded-lg" />
                    </CardHeader>
                    <Divider />
                    <CardBody>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <Skeleton className="h-4 w-32 rounded-lg mb-2" />
                                <Skeleton className="h-8 w-24 rounded-full" />
                            </div>
                            <div>
                                <Skeleton className="h-4 w-40 rounded-lg mb-2" />
                                <Skeleton className="h-6 w-48 rounded-lg" />
                            </div>
                        </div>
                    </CardBody>
                </Card>

                {/* Interests Skeleton */}
                <Card className="mb-8">
                    <CardHeader>
                        <Skeleton className="h-6 w-32 rounded-lg" />
                    </CardHeader>
                    <Divider />
                    <CardBody>
                        <div className="flex flex-wrap gap-2">
                            {[...Array(5)].map((_, i) => (
                                <Skeleton key={i} className="h-8 w-24 rounded-full" />
                            ))}
                        </div>
                    </CardBody>
                </Card>

                {/* Principles Skeleton */}
                <Card className="mb-8 max-w-[1024px]">
                    <CardHeader>
                        <Skeleton className="h-6 w-40 rounded-lg" />
                    </CardHeader>
                    <Divider />
                    <CardBody>
                        <div className="space-y-4">
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
                    <CardHeader>
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
    const [resolutionDate, setResolutionDate] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [totalPredictions, setTotalPredictions] = useState(0);
    const [totalBets, setTotalBets] = useState(0);
    const [successRate, setSuccessRate] = useState(0);
    const fetch = useFetch();

    useEffect(() => {
        const fetchAgentProfile = async () => {
            try {
                const response = await fetch.get('/api/getAgentProfile');
                if (response.status) {
                    setAgent(response.agent);
                    const { years, months, days } = convertDaysToYMD(response.agent.maxTimelineLimit);
                    setResolutionDate(`${years ? `${years} years ` : ''} ${months ? `${months} months ` : ''} ${days ? `${days} days` : ''}`);
                    setTotalPredictions(response.totalPredictions);
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
            <Link href="/" className=" flex justify-center">
            <Image
                src={"/assets/images/profile.svg"}
                alt="Bets"
                width={24}
                height={24}
                
              />
            </Link>
            <Link href="/bets" className="icon-bet flex justify-center">
             
            </Link>
            <Link href="/predictions" className="icon-predict flex justify-center">
            
            </Link>
          </div>
        </nav>
            <div className="fixed top-0 right-0 p-4">
                <Card className="bg-content0 hover:shadow-lg transition-all duration-300 border border-primary/20">
                    <CardBody className="p-2">
                        <Button
                            variant="light" 
                            className="flex flex-col items-start gap-2 p-2 hover:bg-primary/10 rounded-xl"
                            href="/payment"
                            as={Link}
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                    <FaCoins className="text-basic text-primary" />
                                </div>
                                <span className="text-xl font-bold text-primary">
                                    {agent?.wallet_balance?.toLocaleString() || 0}
                                </span>
                            </div>
                        </Button>
                    </CardBody>
                </Card>
            </div>

            <div className="container mx-auto px-4 py-8">
                {/* Header */}
               
                <div className="text-white py-8 flex justify-between items-center px-2 rounded-b-2xl flex-row">
                <Image
                        src={agent?.image || '/assets/images/default-agent.png'}
                        alt="Agent Image"
                        className="w-[100px] h-[100px] rounded-full"
                        width={100}
                        height={100}
                    />
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
                   
                </div>

                {/* Main Content */}
                {/* Stats Overview */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <Link href="/bets">
                        <StatCard
                            icon={<FaRocket />}
                            title="Total Bets"
                            value={totalBets.toString()}
                        />
                    </Link>
                    <Link href="/predictions">
                        <StatCard
                            icon={<FaDatabase />}
                            title="Total Predictions"
                            value={totalPredictions.toString()}
                        />
                    </Link>
                    <StatCard
                        icon={<FaChartLine />}
                        title="Success Rate"
                        value={`${Number(successRate || 0).toFixed(2)}%`}
                    />
                    <StatCard
                        icon={<FaShieldAlt />}
                        title="Max Bet Size"
                        value={`${agent?.maxBetSize || 0} credits`}
                    />
                </div>

                {/* Add Category and Resolution Date Display */}
                <Card className="mb-8 bg-content0">
                    <CardHeader className="text-medium font-regular">Betting Settings</CardHeader>
                    <Divider />
                    <CardBody>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h3 className="text-default-500 mb-2">Preferred Category</h3>
                                <Chip color="primary" variant="flat">
                                    {
                                        agent?.category ?
                                            CATEGORIES.find(category =>
                                                category.toLowerCase() === agent?.category.toLowerCase()
                                            ) :
                                            'General'
                                    }
                                </Chip>
                            </div>
                            <div>
                                <h3 className="text-default-500 mb-2">Maximum Resolution Time</h3>
                                <p className="text-lg font-semibold">
                                    {resolutionDate}
                                </p>
                            </div>
                        </div>
                    </CardBody>
                </Card>

                {/* Interests Section */}
                <Card className="mb-8 bg-content0">
                    <CardHeader className="text-medium font-regular">Core Interests</CardHeader>
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
                <Card className="mb-8 max-w-[1024px] bg-content0">
                    <CardHeader className="text-medium font-regular">Betting Principles</CardHeader>
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
                <Card className="bg-content0">
                    <CardHeader className="text-medium font-regular">Risk Profile</CardHeader>
                    <Divider />
                    <CardBody>
                        <div className="space-y-6">
                            <RiskItem
                                level="Conservative"
                                description={agent?.conservativeBetSize.toString() || '0'}
                                value={agent?.conservativeBetSize || 0}
                                color="success"
                            />
                            <RiskItem
                                level="Moderate"
                                description={agent?.moderateBetSize.toString() || '0'}
                                value={agent?.moderateBetSize || 0}
                                color="warning"
                            />
                            <RiskItem
                                level="Strategic"
                                description={agent?.aggressiveBetSize.toString() || '0'}
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
    className?: string;
}

const StatCard = ({ icon, title, value, className }: StatCardProps) => (
    <Card className={`bg-content0 shadow-md hover:shadow-lg transition-shadow duration-300 ${className}`}>
        <CardBody className="flex flex-row items-center gap-4">
            <div className="text-primary text-xl">{icon}</div>
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