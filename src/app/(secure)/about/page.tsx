"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useFetch } from "@/app/utils/lib";
import { IAgentProfile } from "@/app/utils/interface";

export default function AboutPage() {
  const [agent, setAgent] = useState<IAgentProfile | null>(null);
  const [agentBalance, setAgentBalance] = useState(0);
  const fetchData = useFetch();
  
  useEffect(() => {
    const fetchAgentProfile = async () => {
      try {
        const response = await fetchData.get("/api/getAgentProfile");
        if (response.status) {
          setAgent(response.agent);
          setAgentBalance(response.agent.wallet_balance ?? 0); // capture wallet balance
        } else {
          toast.error(response.message);
        }
      } catch (error) {
        console.log(error);
        toast.error("Failed to fetch agent profile");
      }
    };
    fetchAgentProfile();
  }, []);

  return (
    <div className="flex text-white">
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
                                                <Link href="/profile" className="md:flex items-center gap-2 mb-4 hidden p-2 border border-white/10 profile-border ">
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
                            href="/markets"
                            className="flex items-center gap-2 mb-4 group"
                        >
                            {/* default icon */}
                            <span className="icon-dashboard mr-2 block group-hover:hidden " />
                            {/* hover icon */}
                            <span className="icon-dashboard-active mr-2 hidden group-hover:block" />
                            <span className="text-default-400 group-hover:text-white font-kodemono"><span className="hidden md:inline-block">Overview</span></span>
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
                      
      <Link href="/" className="flex items-center gap-2 mb-4 text-white font-kodemono">
            <span className="icon-about-active mr-2" /> <span className="hidden md:inline-block">About</span>
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


      {/* Main Content */}
      <div className="flex-1 ml-0 md:ml-64  container mt-14 md:mt-0  mx-auto px-4 py-6 md:px-8 md:py-8 min-w-full md:min-w-[800px] max-w-full md:max-w-[800px]">
        <h1 className="text-2xl font-bold text-gradient-red mt-1 w-fit mb-4 font-kodemono">About</h1>
        <p >
          Antelope is the worlds first purely AI driven "Synthetic Prediction Market", allowing traders to bet on the future by creating strategies executed by AI agents.
          Our mission is to provide an intuitive interface for analyzing trends, placing wagers on 
          future outcomes, and refining strategies—all under one roof.
        </p>

        <h2 className="text-base font-semibold mt-8 mb-4 text-base text-white">Why Antelope?</h2>
        <p >
          We designed Antelope to cater to both newcomers and experienced bettors, ensuring 
          an accessible yet sophisticated toolkit. You can efficiently manage markets, uncover 
          opportunities, and track performance metrics in real time.
        </p>

        <h2 className="text-base font-semibold mt-8 mb-4 text-white">Key Features &amp; Benefits</h2>
        <ul className="list-disc list-inside space-y-2">
          <li><strong>Bet on anything:</strong> Antelope allows you to bet on anything, from the outcome of a sports game to the price of a stock.</li>
          <li><strong>Train your own AI agent:</strong> Antelope allows you to train your own AI agent to bet on anything by providing it with data and instructions.</li>
          <li><strong>Refine Betting Strategies:</strong> Develop and adjust strategies to maximize long-term success.</li>
          <li><strong>Tokenize your AI betting agent and sell access to it:</strong> Stay updated on wins, losses, and market fluctuations as they happen.</li>
          <li><strong>Community Interaction:</strong> Engage with a vibrant community, discuss ideas, and learn from peers.</li>
        </ul>

        <h2 className=" font-semibold mt-8 mb-4 text-white text-base">Getting Started</h2>
        <p >
          Create your own AI agent by clicking on the "Strategy" tab and selecting "Create Agent".
          You can also train your own agent by clicking on the "Strategy" tab and selecting "Train Agent".
          Once you have created or trained your agent, you can bet on it by clicking on the "Markets" tab and selecting "Bet on Agent".
          You can also tokenize your agent and sell access to it by clicking on the "Strategy" tab and selecting "Tokenize Agent".
        </p>
      </div>
    </div>
  );
}