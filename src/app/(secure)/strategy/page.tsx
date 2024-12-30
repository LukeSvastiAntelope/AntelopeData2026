"use client";

import { Card, CardBody, CardHeader } from "@nextui-org/card";
import { Chip } from "@nextui-org/chip";
import { Progress } from "@nextui-org/progress";
import { Divider } from "@nextui-org/divider";
import { Skeleton } from "@nextui-org/skeleton";
import { Button } from "@nextui-org/button";
import { FaRocket, FaDatabase, FaChartLine, FaShieldAlt } from "react-icons/fa";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useFetch } from "@/app/utils/lib";
import Image from "next/image";
import { IAgentProfile } from "@/app/utils/interface";
import { convertDaysToYMD } from "@/app/utils/lib";
import { CATEGORIES } from "@/app/utils/const";
import Link from "next/link";

/**
 * StrategySkeleton: Skeleton loader that matches the layout for “Strategy Page”
 * Adapted from ProfileSkeleton for consistency.
 */
const StrategySkeleton = () => {
  return (
    <div className="flex text-white max-w-[1200px]">
      {/* Sidebar Skeleton */}
      <aside className="md:w-64 md:flex-col md:left-auto left-0 fixed top-0 text-sm w-full">
        <nav className="flex flex-row md:flex-col gap-4 text-normal justify-evenly py-8 px-4">
          <div className="flex flex-row md:flex-col justify-evenly w-full">
            <Skeleton className="h-10 w-40 rounded-lg mb-4" /> {/* Logo */}
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-32 rounded-lg mb-4" />
            ))}
          </div>
          <div className="flex flex-row md:flex-col justify-evenly w-full">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-32 rounded-lg mb-4" />
            ))}
          </div>
        </nav>
      </aside>

      {/* Main Content Skeleton */}
      <div className="flex-1 ml-0 md:ml-64 container mt-14 md:mt-0 mx-auto px-4 py-6 md:px-8 md:py-8 min-w-full md:min-w-[800px] max-w-full md:max-w-[800px]">
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 text-small">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="bg-content0 text-small">
                <CardBody className="flex flex-row items-center gap-4 text-small">
                  <Skeleton className="w-6 h-6 rounded-lg text-small" />
                  <div>
                    <Skeleton className="h-4 w-24 rounded-lg mb-2 text-small" />
                    <Skeleton className="h-6 w-20 rounded-lg text-small" />
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
          <Card className="mb-8">
            <CardHeader>
              <Skeleton className="h-6 w-40 rounded-lg" />
            </CardHeader>
            <Divider />
            <CardBody>
              <div className="space-y-4">
                {[...Array(2)].map((_, i) => (
                  <Card key={i} shadow="sm">
                    <CardBody className="p-2 bg-none">
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
    </div>
  );
};

/**
 * StrategyPage: 
 * A dedicated page to show the user’s betting strategy details, 
 * risk profile, etc., matching the layout from the Profile page.
 */
export default function StrategyPage() {
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
        // For demonstration, reusing the same endpoint as the profile.
        // If your backend provides a separate endpoint, replace accordingly.
        const response = await fetch.get("/api/getAgentProfile");
        if (response.status) {
          setAgent(response.agent);
          const { years, months, days } = convertDaysToYMD(response.agent.maxTimelineLimit);
          setResolutionDate(
            `${years ? `${years} years ` : ""}${
              months ? `${months} months ` : ""
            }${days ? `${days} days` : ""}`
          );
          setTotalPredictions(response.totalPredictions);
          setTotalBets(response.totalBets);
          setSuccessRate(response.successRate);
        } else {
          toast.error(response.message);
        }
      } catch (error) {
        console.log(error);
        toast.error("Failed to fetch strategy info");
      }
      setIsLoading(false);
    };

    fetchAgentProfile();
  }, []);

  if (isLoading) return <StrategySkeleton />;

  return (
    <div className="flex text-white max-w-[1200px]">
      {/* Sidebar */}
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
            <Link href="/payment" className="md:flex items-center gap-2 mb-4 hidden">
              <Image
                src={agent?.image || "/assets/images/logo-simple.svg"}
                alt="Profile"
                width={24}
                height={24}
                className="rounded-full bg-gray-700 mr-2 sm-hidden"
              />
              {/* Credits */}
              <span className="text-sm font-semibold font-kodemono">
                <span className="text-gradient">83940</span>
              </span>

            </Link>
            <Link
              href="/dashboard"
              className="flex items-center gap-2 mb-4 group"
            >
              <span className="icon-dashboard mr-2 block group-hover:hidden" />
              <span className="icon-dashboard-active mr-2 hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono">
               Dashboard
              </span>
            </Link>

            <Link href="/markets" className="flex items-center gap-2 mb-4 group text-default-400">
              {/* default icon */}
              <span className="icon-markets mr-2 block group-hover:hidden" />
              {/* hover icon */}
              <span className="icon-markets-active mr-2 hidden sm:enlarge-icon group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono"><span className="hidden md:inline-block">Markets</span></span>
            </Link>

            <Link href="/strategy" className="flex items-center gap-2 mb-4 text-white font-kodemono">
            <span className="icon-strategy-active mr-2" /> <span className="hidden md:inline-block">Strategy</span>
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

      {/* Top-right balance card */}
      {/* <div className="fixed top-0 right-0 p-4">
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
      </div> */}

      {/* Main Content Area */}
      <div className="flex-1 ml-0 md:ml-64 container mt-14 md:mt-0  mx-auto px-4 py-6 md:px-8 md:py-8 min-w-full md:min-w-[800px] max-w-full md:max-w-[800px]">
        {/* Header */}
        <div className="text-white py-8 flex justify-between items-center px-2 rounded-b-2xl flex-row">
          {/* <Image
            src={agent?.image || "/assets/images/default-agent.png"}
            alt="Strategy Image"
            className="w-[100px] h-[100px] rounded-full"
            width={100}
            height={100}
          /> */}
          <div className="container mx-auto px-4">
            {/* <h1 className="text-3xl font-bold">My Strategy</h1>
            <p className="mt-2 opacity-80">
              {agent?.description || "Refine your personal betting approach"}
            </p> */}
            <Button
              color="default"
              variant="flat"
              className="mt-4"
              href="/editProfile"
              as="a"
            >
              Edit Strategy
            </Button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 text-small">
          <Link href="/bets">
            <StatCard icon={<FaRocket />} title="Bets" value={totalBets.toString()} />
          </Link>
          <Link href="/predictions">
            <StatCard
              icon={<FaDatabase />}
              title="Predictions"
              value={totalPredictions.toString()}
            />
          </Link>
          <StatCard
            icon={<FaChartLine />}
            title="Success"
            value={`${Number(successRate || 0).toFixed(2)}%`}
          />
          <StatCard
            icon={<FaShieldAlt />}
            title="Bet Size"
            value={`${agent?.maxBetSize || 0} credits`}
          />
        </div>

        {/* Betting Settings */}
        <Card className="mb-8 bg-content0">
          <CardHeader className="text-medium font-regular">Betting Settings</CardHeader>
          <Divider />
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-default-500 mb-2">Preferred Category</h3>
                <Chip color="primary" variant="flat">
                  {agent?.category
                    ? CATEGORIES.find(
                        (category) =>
                          category.toLowerCase() === agent?.category.toLowerCase()
                      ) || "General"
                    : "General"}
                </Chip>
              </div>
              <div>
                <h3 className="text-default-500 mb-2">Maximum Resolution Time</h3>
                <p className="text-lg font-semibold">{resolutionDate}</p>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Core Interests */}
        <Card className="mb-8 bg-content0">
          <CardHeader className="text-medium font-regular">Core Interests</CardHeader>
          <Divider />
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {agent?.interests && agent?.interests.length > 0 ? (
                agent?.interests.map((interest) => (
                  <Chip key={interest} color="primary" variant="flat">
                    {interest}
                  </Chip>
                ))
              ) : (
                <p className="text-default-500">No interests listed.</p>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Betting Principles */}
        <Card className="mb-8 max-w-[1024px] bg-content0">
          <CardHeader className="text-medium font-regular">Betting Principles</CardHeader>
          <Divider />
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
              {agent?.principles && agent?.principles.length > 0 ? (
                agent?.principles.map((principle) => (
                  <PrincipleCard
                    key={principle.title}
                    title={principle.title}
                    description={principle.description}
                  />
                ))
              ) : (
                <p className="text-default-500">No principles added.</p>
              )}
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
                description={agent?.conservativeBetSize?.toString() || "0"}
                value={agent?.conservativeBetSize || 0}
                color="success"
              />
              <RiskItem
                level="Moderate"
                description={agent?.moderateBetSize?.toString() || "0"}
                value={agent?.moderateBetSize || 0}
                color="warning"
              />
              <RiskItem
                level="Strategic"
                description={agent?.aggressiveBetSize?.toString() || "0"}
                value={agent?.aggressiveBetSize || 0}
                color="danger"
              />
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

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
    <Progress color={color} value={value} className="max-w-full" />
  </div>
); 