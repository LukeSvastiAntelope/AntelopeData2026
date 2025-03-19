'use client';
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Skeleton } from "@heroui/react";
import { toast } from "react-hot-toast";
import { useFetch } from "../utils/lib";
import Link from "next/link";
import Image from "next/image";
import AgentProfileDialog from "../components/AgentProfileDialog";
import { Tooltip as NextUITooltip } from "@heroui/react";
import PredictionTypeDialog from "../components/PredictionTypeDialog";
import { IAgentProfile, UserDB } from "../utils/interface";

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
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);
    const [isAgentProfileOpen, setIsAgentProfileOpen] = useState(false);
    const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);
    const fetchData = useFetch();
    const [agent, setAgent] = useState<IAgentProfile | null>(null);
    const [user, setUser] = useState<UserDB | null>(null);
    const [isAgentProfileLoading, setIsAgentProfileLoading] = useState(false);

    // const openPredictionDialog = () => {
    //     setIsOpen(true);
    // }

    const fetchAgentProfile = async () => {
        setIsAgentProfileLoading(true);
        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem("token") ?? "" : "";
            const response = await fetch('/api/getAgentProfile',
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    }

                }
            );
            const data = await response.json();
            if (data.status) {
                setAgent(data.agent);
                setUser(data.user);
            }
        } catch (error) {
            throw new Error(error instanceof Error ? error.message : "Failed to fetch agent profile.");
        } finally {
            setIsAgentProfileLoading(false);
        }
    }

    const compressImage = (file: File | Blob): Promise<string> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new window.Image() as HTMLImageElement;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // Reduced maximum dimensions
                    const MAX_SIZE = 200; // Reduced from 500 to 200
                    if (width > height) {
                        if (width > MAX_SIZE) {
                            height = Math.round((height * MAX_SIZE) / width);
                            width = MAX_SIZE;
                        }
                    } else {
                        if (height > MAX_SIZE) {
                            width = Math.round((width * MAX_SIZE) / height);
                            height = MAX_SIZE;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);

                    // More aggressive compression
                    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.3); // Reduced quality to 30%

                    // Remove the data URL prefix to save some bytes
                    const base64Data = compressedBase64.split(',')[1];
                    resolve(base64Data);
                };
                img.src = e.target?.result as string;
            };
            reader.readAsDataURL(file);
        });
    };

    const handleSaveProfile = async (name: string, description: string, fileRef: React.RefObject<HTMLInputElement>) => {
        if (!name || !description) {
            toast.error("Please fill in all fields.");
            return;
        }
        setIsSubmittingProfile(true);
        try {
            // Create multipart form data
            const agentProfile = {
                ...agent,
                name,
                description,
            }

            // Attach avatar file (if the user selected one)
            const avatarFile = fileRef?.current?.files?.[0];
            if (avatarFile) {
                const compressedImage = await compressImage(avatarFile);
                agentProfile.image = compressedImage;
            }

            const token = typeof window !== 'undefined' ? localStorage.getItem("token") ?? "" : "";
            const res = await fetch('/api/saveAgentProfile', {
                method: 'POST',
                body: JSON.stringify({
                    agent: agentProfile
                }),
                headers: {
                    'Authorization': `Bearer ${token}`,
                }
            });
            const response = await res.json();
            if (response.status) {
                await fetchData.post('/api/saveAgentJoinAction', { name });
                await fetchAgentProfile();
                toast.success("Profile info updated successfully!");
            } else {
                toast.error(response.message || "Failed to update profile info.");
            }
        } catch (error) {
            console.error(error);
            toast.error("Profile update failed.");
        } finally {
            setIsSubmittingProfile(false);
        }
    };

    useEffect(() => {
        if (agent && (!agent.name || !agent.description)) {
            setIsAgentProfileOpen(true);
        }
        if (!agent) {
            fetchAgentProfile();
        }
    }, [agent]);

    useEffect(() => {
        toast("Please log in to get in on the action and place your bet.",
            {
                icon: '🥳',
                style: {
                    borderRadius: '10px',
                    background: '#333',
                    color: '#fff',
                },
            }
        );
    }, [])

    return (
        <div className='min-h-screen flex items-center justify-start flex-col'>
            <div className="flex text-white max-w-[1200px]">
                {
                    isAgentProfileLoading ?
                        <AsideSkeleton /> :
                        <aside className="md:w-64 md:flex-col md:left-auto left-0 fixed top-0 text-sm w-full">
                            <nav className="flex flex-row md:flex-col gap-4 text-normal justify-evenly py-8 px-4 ">
                                <div className="flex flex-row md:flex-col justify-evenly w-full md:gap-4">
                                    <div className="flex md:inline-block items-center ">
                                        {/* Large logo for md+ */}
                                        <Link href="/">
                                            <span className="hidden md:inline-block">
                                                <Image
                                                    src={"/assets/images/logo-text.svg"}
                                                    alt="Dashboard Logo"
                                                    width={160}
                                                    height={40}
                                                    className="mr-2 w-100"
                                                />
                                            </span>
                                        </Link>
                                    </div>

                                    {/* Profile Photo */}
                                    <div className="md:flex items-center py-2 hidden gap-2 mb-2">
                                        <Image
                                            src={agent?.image || "/assets/images/logo-simple.svg"}
                                            alt="Profile"
                                            width={40}
                                            height={40}
                                            className="rounded-full sm-hidden border border-dashed border-primary p-1"
                                        />
                                        <div className="flex flex-col">
                                            <NextUITooltip content="View your profile" placement="right">
                                                <Link className="text-sm font-semibold font-kodemono w-full"
                                                    href="/profile">{agent?.name || "Agent Name"}</Link>
                                            </NextUITooltip>
                                            <NextUITooltip content="Check your wallet" placement="right">
                                                <Link className="text-gradient-red hover-white" href="/payment">
                                                    <span className="icon-coin-red icon-text">
                                                        {agent?.wallet_balance?.toLocaleString() || 0}
                                                    </span>
                                                </Link>
                                            </NextUITooltip>
                                        </div>
                                    </div>
                                    <Link
                                        href="/dashboard"
                                        className={`flex items-center group md:gap-2 ${pathname === '/dashboard' ? 'text-white' : 'text-gray-500 hover:text-white'}`}
                                    >
                                        <span className={`icon-dashboard-active group-hover:block ${pathname === '/dashboard' ? 'block' : 'hidden'}`} />
                                        <span className={`icon-dashboard group-hover:hidden ${pathname === '/dashboard' ? 'hidden' : 'block'}`} />
                                        <span className="hidden font-kodemono md:inline-block">Overview</span>
                                    </Link>

                                    <Link
                                        href="/markets"
                                        className={`flex items-center group md:gap-2 ${pathname === '/markets' ? 'text-white' : 'text-gray-500 hover:text-white'}`}
                                    >
                                        <span className={`icon-markets-active group-hover:block ${pathname === '/markets' ? 'block' : 'hidden'}`} />
                                        <span className={`icon-markets group-hover:hidden ${pathname === '/markets' ? 'hidden' : 'block'}`} />
                                        <span className="hidden font-kodemono md:inline-block">Markets</span>
                                    </Link>

                                    <Link
                                        href="/strategy"
                                        className={`flex items-center group md:gap-2 ${pathname === '/strategy' ? 'text-white' : 'text-gray-500 hover:text-white'}`}
                                    >
                                        <span className={`icon-strategy-active group-hover:block ${pathname === '/strategy' ? 'block' : 'hidden'}`} />
                                        <span className={`icon-strategy group-hover:hidden ${pathname === '/strategy' ? 'hidden' : 'block'}`} />
                                        <span className="hidden font-kodemono md:inline-block">Strategy</span>
                                    </Link>

                                    {
                                        user && user?.role === "admin" &&
                                        <>
                                            <Link
                                                href="/admin"
                                                className={`flex items-center group md:gap-2 ${pathname === '/admin' ? 'text-white' : 'text-gray-500 hover:text-white'}`}
                                            >
                                                <span className={`icon-dashboard-active group-hover:block ${pathname === '/admin' ? 'block' : 'hidden'}`} />
                                                <span className={`icon-dashboard group-hover:hidden ${pathname === '/admin' ? 'hidden' : 'block'}`} />
                                                <span className="hidden font-kodemono md:inline-block">Admin</span>
                                            </Link>
                                        </>
                                    }

                                    {/* <Link
                                        href="#"
                                        onClick={openPredictionDialog}
                                        className="items-center group md:gap-2 text-gray-500 hover:text-white p-2 border border-white/10 rounded-lg w-fit hidden md:flex"
                                    >
                                        <span className="plus-circle-on group-hover:border-white hidden group-hover:block text-white" />
                                        <span className="plus-circle-off block group-hover:hidden" />
                                        <span className="hidden font-kodemono md:inline-block ">Predict</span>
                                    </Link> */}
                                </div>

                                <div className="md:hidden min-w-40px min-h-40px max-w-40px max-h-40px center-logo"></div>

                                <div className="flex flex-row md:flex-col justify-evenly w-full md:gap-4 ">
                                    <Link
                                        href="/about"
                                        className={`flex items-center group md:gap-2 ${pathname === '/about' ? 'text-white' : 'text-gray-500 hover:text-white'}`}
                                    >
                                        <span className={`icon-about-active group-hover:block ${pathname === '/about' ? 'block' : 'hidden'}`} />
                                        <span className={`icon-about group-hover:hidden ${pathname === '/about' ? 'hidden' : 'block'}`} />
                                        <span className="hidden font-kodemono md:inline-block">About</span>
                                    </Link>
                                    <Link
                                        href="https://t.me/+PWP890TNaw8zZTI5"
                                        className="flex items-center md:gap-2 text-gray-500 group"
                                    >
                                        <span className="icon-support block group-hover:hidden" />
                                        <span className="icon-support-active hidden group-hover:block" />
                                        <span className="text-gray-500 group-hover:text-white font-kodemono">
                                            <span className="hidden md:inline-block">Community</span>
                                        </span>
                                    </Link>
                                    <Link
                                        href="/login"
                                        className="flex items-center text-gray-500 group md:gap-2"
                                    >
                                        <span className="icon-logout block group-hover:hidden" />
                                        <span className="icon-logout-active hidden group-hover:block" />
                                        <span className="text-gray-500 group-hover:text-white font-kodemono">
                                            <span className="hidden md:inline-block">Login</span>
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
            <PredictionTypeDialog isOpen={isOpen} onClose={() => setIsOpen(false)} />
            {
                agent &&
                <AgentProfileDialog
                    isOpen={isAgentProfileOpen}
                    onClose={() => setIsAgentProfileOpen(false)}
                    name={agent?.name || ""}
                    description={agent?.description || ""}
                    image={agent?.image || ""}
                    isSubmittingProfile={isSubmittingProfile}
                    handleSaveProfile={handleSaveProfile}
                />
            }
        </div>
    )
}

export default SecureLayout;