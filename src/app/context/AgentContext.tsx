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
    const [isInitialized, setIsInitialized] = useState(false);
    const pathname = usePathname();
    const router = useRouter();
    const isPredictionPage = pathname.split('/')[1] === "predictions";
    const isAuthPage = pathname === '/login' || pathname === '/register';

    const fetchAgentProfile = async () => {
        if (isAgentProfileLoading || !localStorage.getItem("token")) {
            return;
        }
        
        setIsAgentProfileLoading(true);
        try {
            const token = localStorage.getItem("token") ?? "";
            const response = await fetch('/api/getAgentProfile', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                }
            });
            const data = await response.json();
            
            if (data.status) {
                setAgent({...data.agent, successRate: data.successRate});
                setUser(data.user);
            } else {
                if (!isAuthPage) {
                    handleAuthError();
                }
            }
        } catch (error) {
            console.log("Error fetching agent profile", error);
            if (!isPredictionPage && !isAuthPage) {
                handleAuthError();
            }
        } finally {
            setIsAgentProfileLoading(false);
            setIsInitialized(true);
        }
    };

    const handleAuthError = () => {
        toast.error("Authentication error. Please log in again.");
        localStorage.removeItem("userId");
        localStorage.removeItem("token");
        if (!isAuthPage) {
            router.push("/login");
        }
    };

    useEffect(() => {
        const token = localStorage.getItem("token");
        
        // If we're on an auth page and have a token, redirect to dashboard
        if (token && isAuthPage) {
            router.push("/dashboard");
            return;
        }
        
        // If we're not on an auth page and don't have a token, redirect to login
        if (!token && !isAuthPage) {
            router.push("/login");
            return;
        }

        // Only fetch profile if we have a token and need to
        if (token && !agent && !isAgentProfileLoading) {
            fetchAgentProfile();
        }
    }, [pathname]);

    // Don't render children until we've initialized
    if (!isInitialized && !isAuthPage) {
        return <div>Loading...</div>;
    }

    return (
        <AgentContext.Provider value={{ 
            agent, 
            setAgent, 
            user, 
            setUser, 
            isAgentProfileLoading, 
            setIsAgentProfileLoading 
        }}>
            {children}
        </AgentContext.Provider>
    )
}

export const useAgent = () => {
    const context = useContext(AgentContext);
    if (!context) throw new Error('useAgent must be used within a AgentProvider');
    return context;
}
