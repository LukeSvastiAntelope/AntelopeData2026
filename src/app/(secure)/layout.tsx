'use client';
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { IAgentProfile } from "@/app/utils/interface";
import { Skeleton } from "@nextui-org/skeleton";
import { toast } from "react-hot-toast";
import { useFetch } from "../utils/lib";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@nextui-org/button";
import PredictionDialog from "../components/PredictionDialog";

const AsideSkeleton = () => {
    return (
        <aside className="md:w-64 md:flex-col md:left-auto left-0 fixed top-0 text-sm w-full">
            <nav className="flex flex-row md:flex-col gap-4 text-normal justify-evenly py-8 px-4">
                <div className="flex flex-row md:flex-col justify-evenly w-full md:gap-4">
                    {/* Logo */}
                    <div className="flex md:inline-block items-center">
                        <span className="hidden md:inline-block">
                            <Skeleton className="w-[160px] h-[40px]" />
                        </span>
                    </div>

                    {/* Profile Section */}
                    <div className="md:flex items-center p-2 border border-white/10 profile-border hidden gap-2 mb-2">
                        <Skeleton className="w-[32px] h-[32px] rounded-full" />
                        <div className="flex flex-col gap-1">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-4 w-16" />
                        </div>
                    </div>

                    {/* Top Navigation Items */}
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="flex items-center md:gap-2">
                            <Skeleton className="w-5 h-5" />
                            <span className="hidden md:inline-block">
                                <Skeleton className="h-4 w-20" />
                            </span>
                        </div>
                    ))}
                </div>

                {/* Mobile Logo Placeholder */}
                <div className="md:hidden min-w-40px min-h-40px max-w-40px max-h-40px center-logo">
                    <Skeleton className="w-[40px] h-[40px]" />
                </div>

                {/* Bottom Navigation Items */}
                <div className="flex flex-row md:flex-col justify-evenly w-full md:gap-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="flex items-center md:gap-2">
                            <Skeleton className="w-5 h-5" />
                            <span className="hidden md:inline-block">
                                <Skeleton className="h-4 w-20" />
                            </span>
                        </div>
                    ))}
                </div>
            </nav>
        </aside>
    )
}

const SecureLayout = ({ children }: { children: React.ReactNode }) => {
    const route = useRouter();
    const pathname = usePathname();
    const [agent, setAgent] = useState<IAgentProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isOpen, setIsOpen] = useState(false);
    const fetch = useFetch();
    if (typeof window !== 'undefined' && !localStorage.getItem("token")) {
        route.push("/login");
    }

    const openPredictionDialog = () => {
        setIsOpen(true);
    }

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

    return (
        <div className='min-h-screen flex items-center justify-start flex-col'>
            <div className="flex text-white max-w-[1200px]">
                {
                    isLoading ?
                        <AsideSkeleton /> :
                        <aside className="md:w-64 md:flex-col md:left-auto left-0 fixed top-0 text-sm w-full">
                            <nav className="flex flex-row md:flex-col gap-4 text-normal justify-evenly py-8 px-4 ">
                                <div className="flex flex-row md:flex-col justify-evenly w-full md:gap-4">
                                    <div className="flex md:inline-block items-center ">
                                        {/* Large logo for md+ */}
                                        <span className="hidden md:inline-block ">
                                            <Image
                                                src={"/assets/images/logo-text.svg"}
                                                alt="Dashboard Logo"
                                                width={160}
                                                height={40}
                                                className="mr-2 w-100"
                                            />
                                        </span>
                                    </div>

                                    {/* Profile Photo */}
                                    <div className="md:flex items-center p-2 border border-white/10 profile-border hidden gap-2 mb-2">

                                        <Image
                                            src={agent?.image || "/assets/images/logo-simple.svg"}
                                            alt="Profile"
                                            width={32}
                                            height={32}
                                            className="rounded-full bg-gray-700 sm-hidden"
                                        />

                                        <div className="flex flex-col">

                                            <Link className="text-sm font-semibold font-kodemono w-full"
                                                href="/profile">{agent?.name || "Agent Name"}</Link>

                                            <Link className="text-gradient-red hover-white" href="/payment">
                                                <span className="icon-coin-red icon-text">
                                                    {agent?.wallet_balance?.toLocaleString() || 0}
                                                </span>
                                            </Link>
                                        </div>
                                    </div>

                                    

                                    <Link href="/" className={`flex items-center group md:gap-2 ${pathname === '/dashboard' ? 'text-white' : 'text-default-400 hover:text-white'}`}>
                                        <span className={`icon-dashboard-active group-hover:block ${pathname === '/dashboard' ? 'block' : 'hidden'}`} />
                                        <span className={`icon-dashboard group-hover:hidden ${pathname === '/dashboard' ? 'hidden' : 'block'}`} />
                                        <span className="hidden font-kodemono md:inline-block">Overview</span>
                                    </Link>

                                    <Link href="/markets" className={`flex items-center group md:gap-2 ${pathname === '/markets' ? 'text-white' : 'text-default-400 hover:text-white'}`}>
                                        <span className={`icon-markets-active group-hover:block ${pathname === '/markets' ? 'block' : 'hidden'}`} />
                                        <span className={`icon-markets group-hover:hidden ${pathname === '/markets' ? 'hidden' : 'block'}`} />
                                        <span className="hidden font-kodemono md:inline-block">Markets</span>
                                    </Link>

                                    <Link href="/strategy" className={`flex items-center group md:gap-2 ${pathname === '/strategy' ? 'text-white' : 'text-default-400 hover:text-white'}`}>
                                        <span className={`icon-strategy-active group-hover:block ${pathname === '/strategy' ? 'block' : 'hidden'}`} />
                                        <span className={`icon-strategy group-hover:hidden ${pathname === '/strategy' ? 'hidden' : 'block'}`} />
                                        <span className="hidden font-kodemono md:inline-block">Strategy</span>
                                    </Link>
                                    <Link 
                                        href="#" 
                                        onClick={openPredictionDialog} 
                                        className="flex items-center group md:gap-2 text-default-400 hover:text-white"
                                    >
                                        <span className={`plus-circle group-hover:block text-white ${pathname === '/strategy' ? 'block' : 'hidden'}`} />
                                        <span className={`plus-circle group-hover:hidden ${pathname === '/strategy' ? 'hidden' : 'block'}`} />
                                        <span className="hidden font-kodemono md:inline-block">Prediction</span>
                                    </Link>
                                </div>

                                <div className="md:hidden min-w-40px min-h-40px max-w-40px max-h-40px center-logo"></div>

                                <div className="flex flex-row md:flex-col justify-evenly w-full md:gap-4 ">
                                    <Link href="/about" className={`flex items-center group md:gap-2 ${pathname === '/about' ? 'text-white' : 'text-default-400 hover:text-white'}`}>
                                        <span className={`icon-about-active group-hover:block ${pathname === '/about' ? 'block' : 'hidden'}`} />
                                        <span className={`icon-about group-hover:hidden ${pathname === '/about' ? 'hidden' : 'block'}`} />
                                        <span className="hidden font-kodemono md:inline-block">About</span>
                                    </Link>
                                    <Link
                                        href="https://discord.gg/dSEV8YCDQ2"
                                        className="flex items-center md:gap-2 text-default-400 group"
                                    >
                                        <span className="icon-support block group-hover:hidden" />
                                        <span className="icon-support-active hidden group-hover:block" />
                                        <span className="text-default-400 group-hover:text-white font-kodemono">
                                            <span className="hidden md:inline-block">Community</span>
                                        </span>
                                    </Link>
                                    <Link href="/logout" className="flex items-center text-default-400 group md:gap-2">
                                        <span className="icon-logout block group-hover:hidden" />
                                        <span className="icon-logout-active hidden group-hover:block" />
                                        <span className="text-default-400 group-hover:text-white font-kodemono">
                                            <span className="hidden md:inline-block">Log out</span>
                                        </span>
                                    </Link>
                                </div>
                            </nav>
                        </aside>
                }
                <main className="flex-1 ml-0 md:ml-64 container mt-14 md:mt-0 mx-auto px-4 py-6 md:px-8 md:py-8 min-w-full md:min-w-[800px] max-w-full md:max-w-[800px]">
                    {children}
                </main>
            </div>
            <PredictionDialog isOpen={isOpen} onClose={() => setIsOpen(false)}/>
        </div>
    )
}

export default SecureLayout;