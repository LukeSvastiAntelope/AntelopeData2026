"use client";

import Image from "next/image";
import Link from "next/link";
import { Card, CardBody } from "@nextui-org/card";
import { Button } from "@nextui-org/button";
import { FaCoins } from "react-icons/fa";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useFetch } from "@/app/utils/lib";
import { IAgentProfile } from "@/app/utils/interface";

export default function AboutPage() {
  const [agent, setAgent] = useState<IAgentProfile | null>(null);
  const fetchData = useFetch();

  useEffect(() => {
    const fetchAgentProfile = async () => {
      try {
        const response = await fetchData.get("/api/getAgentProfile");
        if (response.status) {
          setAgent(response.agent);
        } else {
          toast.error(response.message);
        }
      } catch (error) {
        console.log(error);
        toast.error("Failed to fetch agent profile");
      }
    };
    fetchAgentProfile();
  }, [fetchData]);

  return (
    <div className="flex text-white">
      {/* Sidebar */}
      <aside className="w-64 fixed top-0 text-sm">
        <nav className="flex min-h-screen flex-col gap-4 text-normal justify-between p-4">
          <div>
            {/* Logo */}
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
                src={agent?.image || "/assets/images/default-agent.png"}
                alt="Agent Image"
                className="w-[24px] h-[24px] rounded-full"
                width={24}
                height={24}
              />
              <span className="text-sm font-semibold icon-credits px-5 font-kodemono">
                <span className="text-gradient">
                  {agent?.wallet_balance?.toLocaleString() || 0}
                </span>
              </span>
            </Link>
            <Link href="/dashboard" className="flex items-center gap-2 mb-4 group">
              <span className="icon-dashboard mr-2 block group-hover:hidden" />
              <span className="icon-dashboard-active mr-2 hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono">
                Dashboard
              </span>
            </Link>
            <Link href="/markets" className="flex items-center gap-2 mb-4 group">
              <span className="icon-markets mr-2 block group-hover:hidden" />
              <span className="icon-markets-active mr-2 hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono">
                Markets
              </span>
            </Link>
            <Link href="/strategy" className="flex items-center gap-2 mb-4 group">
              <span className="icon-strategy mr-2 block group-hover:hidden" />
              <span className="icon-strategy-active mr-2 hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono">
                Strategy
              </span>
            </Link>
          </div>

          <div>
            <Link href="/about" className="flex items-center gap-2 mb-4 text-white group">
              <span className="icon-about-active mr-2" />
              <span className="font-kodemono">About</span>
            </Link>
            <Link href="https://discord.gg/dSEV8YCDQ2" className="flex items-center gap-2 mb-4 text-default-400 group">
              <span className="icon-support mr-2 block group-hover:hidden" />
              <span className="icon-support-active mr-2 hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono">
                Community
              </span>
            </Link>
            <Link href="/signout" className="flex items-center gap-2 mb-4 text-default-400 group">
              <span className="icon-logout mr-2 block group-hover:hidden" />
              <span className="icon-logout-active mr-2 hidden group-hover:block" />
              <span className="text-default-400 group-hover:text-white font-kodemono">
                Sign out
              </span>
            </Link>
          </div>
        </nav>
      </aside>

      {/* Top-right balance card */}
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

      {/* Main Content */}
      <div className="flex-1 ml-64 container mx-auto px-4 py-6 md:px-8 md:py-8 max-w-[800px] space-y-6">
        <h1 className="text-xl font-bold text-primary">About Antelope</h1>
        <p className="text-default-500">
          Antelope is the worlds first AI driven synthetic prediction market crafted allowing traders to bet on the future by creating strategies run by AI agents.
          Our mission is to provide an intuitive interface for analyzing trends, placing wagers on 
          future outcomes, and refining strategies—all under one roof.
        </p>

        <h2 className="text-xl font-semibold  text-white">Why Antelope?</h2>
        <p className="text-default-500">
          We designed Antelope to cater to both newcomers and experienced bettors, ensuring 
          an accessible yet sophisticated toolkit. You can efficiently manage markets, uncover 
          opportunities, and track performance metrics in real time.
        </p>

        <h2 className="text-xl font-semibold  text-white">Key Features &amp; Benefits</h2>
        <ul className="list-disc list-inside text-default-500 space-y-2">
          <li><strong>Intuitive Market Management:</strong> Create and oversee markets with minimal hassle.</li>
          <li><strong>Advanced Analysis Tools:</strong> Quickly identify trends and make data-driven wagers.</li>
          <li><strong>Refined Betting Strategies:</strong> Develop and adjust strategies to maximize long-term success.</li>
          <li><strong>Real-Time Tracking:</strong> Stay updated on wins, losses, and market fluctuations as they happen.</li>
          <li><strong>Community Interaction:</strong> Engage with a vibrant community, discuss ideas, and learn from peers.</li>
        </ul>

        <h2 className="text-xl font-semibold text-white">Getting Started</h2>
        <p className="text-default-500">
          Begin by visiting your dashboard to view available markets or create your own. If you need 
          inspiration, check out our Community section to see how others are analyzing trends 
          and deploying their strategies.
        </p>
      </div>
    </div>
  );
}