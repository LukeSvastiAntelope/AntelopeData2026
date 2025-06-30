'use client'

import { createContext, useContext, useState, useEffect } from 'react';
import { IAgentProfile, IAgentContext, UserDB } from '../utils/interface';
import { usePathname, useRouter } from 'next/navigation';
import { handleAuthError } from '../utils/lib';
import { useSession } from 'next-auth/react';
const AgentContext = createContext<IAgentContext | undefined>(undefined);

export const AgentProvider = ({ children }: { children: React.ReactNode }) => {
    const [agent, setAgent] = useState<IAgentProfile | null>(null);
    const [user, setUser] = useState<UserDB | null>(null);
    const [isAgentProfileLoading, setIsAgentProfileLoading] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const { data: session, status } = useSession();
    const pathname = usePathname();
    const router = useRouter();
    const isPredictionPage = pathname.split('/')[1] === "predictions";
    const isAuthPage = pathname === '/login' || pathname === '/register';
    const isLoginPage = pathname === '/login';

    const fetchAgentProfile = async () => {
        if (isAgentProfileLoading || !session) {
            return;
        }
        
        setIsAgentProfileLoading(true);
        try {
            const response = await fetch('/api/getAgentProfile', {
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            const data = await response.json();
            
            if (data.status) {
                setAgent({...data.agent, successRate: data.successRate});
                setUser(data.user);
            } else {
                if (!isAuthPage) {
                    handleAuthError(router, false);
                }
            }
        } catch (error) {
            console.log("Error fetching agent profile", error);
            if (!isPredictionPage && !isAuthPage) {
                handleAuthError(router, false);
            }
        } finally {
            setIsAgentProfileLoading(false);
            setIsInitialized(true);
        }
    };

    useEffect(() => {
        if (status === "loading") {
            return; // Still loading session
        }
        
        // Only redirect from login page if user has a session (allow register page even with session)
        if (session && isLoginPage) {
            router.push("/cohort-chat");
            return;
        }
        
        // If we're not on an auth page and don't have a session, redirect to login
        if (!session && !isAuthPage) {
            router.push("/login");
            // Mark initialization complete so the fallback UI does not hang
            setIsInitialized(true);
            return;
        }

        // Only fetch profile if we have a session and need to
        if (session && !agent && !isAgentProfileLoading) {
            fetchAgentProfile();
        }
        
        // Mark as initialized if we have a session or are on auth page
        if (!isInitialized && (session || isAuthPage)) {
            setIsInitialized(true);
        }
    }, [pathname, session, status]);

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
