'use client';
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "react-hot-toast";
import { useFetch } from "../utils/lib";
import Link from "next/link";
import Image from "next/image";
// import AgentNameDialog from "../components/AgentNameDialog"; // Removed - no longer needed
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import PredictionTypeDialog from "../components/PredictionTypeDialog";
import { AgentProvider } from "../context/AgentContext";
import { useAgent } from "../context/AgentContext";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

const SecureLayout = ({ children }: { children: React.ReactNode }) => {
    const pathname = usePathname();
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    // const [isAgentNameOpen, setIsAgentNameOpen] = useState(false); // Removed - no longer needed
    const [generatedPrinciples, setGeneratedPrinciples] = useState("");
    const [isGeneratingPrinciples, setIsGeneratingPrinciples] = useState(false);
    const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);
    const fetchData = useFetch();
    const { agent, setAgent, isAgentProfileLoading, setIsAgentProfileLoading, user } = useAgent();
    // Placeholder flags to retain existing code paths (kept for future full onboarding flow)
    const [, setIsAgentProfileOpen] = useState(false);
    const [, setIsContentPrefsOpen] = useState(false);
    const [, setIsWagerPrinciplesOpen] = useState(false);

    const openPredictionDialog = () => {
        setIsOpen(true);
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

    const handleSaveAgentName = async (name: string) => {
        if (!name) return;
        try {
            setIsSubmittingProfile(true);
            const token = typeof window !== 'undefined' ? localStorage.getItem("token") ?? "" : "";
            const response = await fetch('/api/saveAgentProfile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ agent: { id: agent?.id, user_id: agent?.user_id, name, is_onboarded: true } }),
            });
            const data = await response.json();
            if (data.status) {
                toast.success("Welcome! Your account has been set up successfully.");
                router.push('/cohort-chat/chat');
            } else {
                toast.error(data.message || "Failed to save your name. Please try again.");
            }
        } catch (err) {
            console.error(err);
            toast.error("An error occurred. Please try again.");
        } finally {
            setIsSubmittingProfile(false);
        }
    };

    const triggerGenerateAndShowPrinciplesDialog = async () => {
        if (!agent) {
            toast.error("Agent data not available for generating principles.");
            router.push('/surveys');
            return;
        }
        setIsGeneratingPrinciples(true);
        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem("token") ?? "" : "";
            const response = await fetch('/api/generateWagerPrinciples', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: agent.name,
                    description: agent.description,
                    category: agent.category,
                    sport_preference: agent.sport_preference,
                    riskLevel: agent.riskLevel,
                }),
            });
            const data = await response.json();
            if (response.ok && data.principles) {
                setGeneratedPrinciples(data.principles);
            } else {
                toast.error(data.error || "Failed to generate principles. Using defaults.");
                setGeneratedPrinciples("1. Make data-driven decisions.\n2. Diversify bets across different opportunities.\n3. Review and refine betting approach regularly.");
            }
        } catch (error) {
            console.log(error);
            toast.error("Error calling principles generation API. Using defaults.");
            setGeneratedPrinciples("1. Analyze market trends thoroughly.\n2. Manage bankroll effectively.\n3. Adapt strategies based on performance.");
        } finally {
            setIsGeneratingPrinciples(false);
        }
    };

    const handleSaveContentPrefs = async (preferences: {
        category: string;
        riskLevel: string;
        conservativeBetSize: number;
        moderateBetSize: number;
        aggressiveBetSize: number;
        sportPreference?: string;
        interests?: string[];
    }) => {
        if (!agent) {
            toast.error("Agent data not available. Cannot save preferences.");
            return;
        }
        setIsSubmittingProfile(true);
        try {
            const agentPrefsData = {
                id: agent.id,
                user_id: agent.user_id,
                name: agent.name,
                description: agent.description,
                image: agent.image,
                category: preferences.category,
                riskLevel: preferences.riskLevel,
                conservativeBetSize: preferences.conservativeBetSize,
                moderateBetSize: preferences.moderateBetSize,
                aggressiveBetSize: preferences.aggressiveBetSize,
                sport_preference: preferences.sportPreference,
                maxBetSize: agent.maxBetSize,
                interests: preferences.interests || [],
                principles: agent.principles,
                maxTimelineLimit: agent.maxTimelineLimit,
                model: agent.model,
                plugins: agent.plugins,
                is_bet: agent.is_bet,
                is_onboarded: false,
            };

            if (preferences.category !== "Sports" || !preferences.sportPreference) {
                delete agentPrefsData.sport_preference;
            }

            const token = typeof window !== 'undefined' ? localStorage.getItem("token") ?? "" : "";
            const res = await fetch('/api/saveAgentProfile', {
                method: 'POST',
                body: JSON.stringify({ agent: agentPrefsData }),
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            const response = await res.json();
            if (response.status) {
                toast.success("Content preferences saved!");
                // Removed fetchAgentProfile() call - AgentContext will handle the update
                triggerGenerateAndShowPrinciplesDialog();
            } else {
                toast.error(response.message || "Failed to save preferences.");
            }
        } catch (error) {
            console.error("Error saving content preferences:", error);
            toast.error("Failed to save preferences.");
        } finally {
            setIsSubmittingProfile(false);
        }
    };

    const handleSkipContentPrefs = async () => {
        // Removed fetchAgentProfile() call - AgentContext will handle the update
        triggerGenerateAndShowPrinciplesDialog();
    };

    const handleSaveWagerPrinciples = async (principles: string) => {
        if (!agent) {
            toast.error("Agent data not available. Cannot save principles.");
            return;
        }
        setIsSubmittingProfile(true);
        try {
            const agentPrincipleData = {
                id: agent.id,
                user_id: agent.user_id,
                name: agent.name,
                description: agent.description,
                image: agent.image,
                category: agent.category,
                riskLevel: agent.riskLevel,
                conservativeBetSize: agent.conservativeBetSize,
                moderateBetSize: agent.moderateBetSize,
                aggressiveBetSize: agent.aggressiveBetSize,
                sport_preference: agent.sport_preference,
                maxBetSize: agent.maxBetSize,
                interests: agent.interests,
                maxTimelineLimit: agent.maxTimelineLimit,
                model: agent.model,
                plugins: agent.plugins,
                is_bet: agent.is_bet,
                principles: principles,
                is_onboarded: true,
            };

            const token = typeof window !== 'undefined' ? localStorage.getItem("token") ?? "" : "";
            const res = await fetch('/api/saveAgentProfile', {
                method: 'POST',
                body: JSON.stringify({ agent: agentPrincipleData }),
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            const response = await res.json();
            if (response.status) {
                toast.success("Wager principles saved! Onboarding complete.");
                // Removed fetchAgentProfile() call - AgentContext will handle the update
                router.push('/cohort-chat/chat');
            } else {
                toast.error(response.message || "Failed to save principles.");
            }
        } catch (error) {
            console.error("Error saving wager principles:", error);
            toast.error("Failed to save principles.");
        } finally {
            setIsSubmittingProfile(false);
        }
    };

    const handleSkipWagerPrinciples = async () => {
        if (agent) {
            setIsSubmittingProfile(true);
            try {
                const agentDataToUpdate = { id: agent.id, user_id: agent.user_id, is_onboarded: true };
                const token = typeof window !== 'undefined' ? localStorage.getItem("token") ?? "" : "";
                await fetch('/api/saveAgentProfile', {
                    method: 'POST',
                    body: JSON.stringify({ agent: agentDataToUpdate }),
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                });
                // Removed fetchAgentProfile() call - AgentContext will handle the update
            } catch (error) {
                console.error("Error updating onboarding status on skip:", error);
            } finally {
                setIsSubmittingProfile(false);
            }
        }
        router.push('/cohort-chat');
    };

    // Removed agent onboarding flow - users now set display name during registration
    // useEffect(() => {
    //     if (agent && !isAgentProfileLoading) {
    //         const onboarded = Boolean(agent.is_onboarded);
    //         if (!onboarded) {
    //             setIsAgentNameOpen(true);
    //         }
    //     }
    // }, [agent, isAgentProfileLoading]);

    return (
        <SidebarProvider defaultOpen={true}>
            <div className="flex min-h-screen w-full bg-background">
                <AppSidebar />
                
                <div className="flex flex-col flex-1">
                    {/* Main Content */}
                    <SidebarInset className="bg-background">
                        {children}
                    </SidebarInset>
                </div>
            </div>
            
            {/* Dialogs */}
            {isOpen && (
                <PredictionTypeDialog 
                    isOpen={isOpen} 
                    onClose={() => setIsOpen(false)} 
                />
            )}

            {/* Removed AgentNameDialog - users now set display name during registration */}
            {/* {isAgentNameOpen && (
                <AgentNameDialog
                    isOpen={isAgentNameOpen}
                    onClose={() => setIsAgentNameOpen(false)}
                    initialName={agent?.name || ""}
                    onSave={handleSaveAgentName}
                    isSubmitting={isSubmittingProfile}
                    userEmail={user?.username || ""}
                />
            )} */}
        </SidebarProvider>
    );
}

export default function SecureLayoutWrapper({ children }: { children: React.ReactNode }) {
    return (
        <AgentProvider>
            <SecureLayoutContent>
                {children}
            </SecureLayoutContent>
        </AgentProvider>
    );
}

function SecureLayoutContent({ children }: { children: React.ReactNode }) {
    const { user, isAgentProfileLoading } = useAgent();
    
    // Show loading state while user data is being fetched
    if (isAgentProfileLoading || !user) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <div className="flex flex-col items-center space-y-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <p className="text-sm text-muted-foreground">Setting up your workspace...</p>
                </div>
            </div>
        );
    }
    
    return <SecureLayout>{children}</SecureLayout>;
}