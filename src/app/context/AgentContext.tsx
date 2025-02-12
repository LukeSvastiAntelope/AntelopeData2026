'use client'

import { createContext, useContext, useState, useEffect } from 'react';
import { IAgentProfile, IAgentContext, UserDB } from '../utils/interface';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
const AgentContext = createContext<IAgentContext | undefined>(undefined);

export const AgentProvider = ({ children }: { children: React.ReactNode }) => {
    const [agent, setAgent] = useState<IAgentProfile | null>(null);
    const [user, setUser] = useState<UserDB | null>(null);
    const [isAgentProfileLoading, setIsAgentProfileLoading] = useState(false);
    const pathname = usePathname();
    const router = useRouter();
    const isPredictionPage = pathname.split('/')[1] == "predictions";

    const fetchAgentProfile = async () => {
        if (isAgentProfileLoading) {
            return;
        }
        setIsAgentProfileLoading(true);
        console.log("isPredictionPage", isPredictionPage);
        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem("token") ?? "" : "";
            console.log("token", token);
            const response = await fetch('/api/getAgentProfile', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                }
            });
            const data = await response.json();
            if (data.status) {
                setAgent({...data.agent, successRate: data.successRate});
                setUser(data.user);
            } else {
                toast.error("Error fetching agent profile");
                localStorage.setItem("userId", "");
                localStorage.setItem("token", "");
                router.push("/login");
            }
        } catch (error) {
            console.log("Error fetching agent profile", error);
            if (!isPredictionPage) {
                toast.error("Error fetching agent profile");
                localStorage.setItem("userId", "");
                localStorage.setItem("token", "");
                router.push("/login");
            }
        } finally {
            setIsAgentProfileLoading(false);
        }
    };

    useEffect(() => {
        if (!agent) {
            fetchAgentProfile();
        }
    }, [agent]);

    return (
        <AgentContext.Provider value={{ agent, setAgent, user, setUser, isAgentProfileLoading, setIsAgentProfileLoading }}>
            {children}
        </AgentContext.Provider>
    )
}

export const useAgent = () => {
    const context = useContext(AgentContext);
    if (!context) throw new Error('useAgent must be used within a AgentProvider');
    return context;
}
