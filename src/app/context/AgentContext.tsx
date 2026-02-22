'use client'

import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { IAgentProfile, IAgentContext, UserDB, UserOrganization } from '../utils/interface';
import { usePathname, useRouter } from 'next/navigation';
import { handleAuthError } from '../utils/lib';
import { useSession } from 'next-auth/react';
const AgentContext = createContext<IAgentContext | undefined>(undefined);

// Global flag to avoid re-fetching across provider remounts
let globalAgentFetched = false;

export const AgentProvider = ({ children }: { children: React.ReactNode }) => {
    const [agent, setAgent] = useState<IAgentProfile | null>(null);
    const [user, setUser] = useState<UserDB | null>(null);
    const [organization, setOrganization] = useState<UserOrganization | null>(null);
    const [isAgentProfileLoading, setIsAgentProfileLoading] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isUserDataLoaded, setIsUserDataLoaded] = useState(false);
    const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
    const hasFetched = useRef(false);
    const { data: session, status } = useSession();
    const pathname = usePathname();
    const router = useRouter();
    const isAuthPage = pathname === '/login' || pathname === '/register';
    const isLoginPage = pathname === '/login';

    const fetchAgentProfile = async () => {
        if (isAgentProfileLoading || !session || hasFetched.current || globalAgentFetched) {
            return;
        }
        
        setIsAgentProfileLoading(true);
        setProfileLoadError(null);
        try {
            const controller = new AbortController();
            const timeoutMs = 15000;
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            const response = await fetch('/api/me', {
                headers: {
                    'Content-Type': 'application/json',
                },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await response.json();
            
            if (data.status) {
                setAgent(data.agent);
                setUser(data.user);
                setOrganization(data.organization || null);
                setIsUserDataLoaded(true);
                hasFetched.current = true;
                globalAgentFetched = true;
            } else {
                const message = data?.message || data?.error || 'Failed to load profile';
                setProfileLoadError(message);
                if (!isAuthPage) {
                    handleAuthError(router, false);
                }
            }
        } catch (error) {
            console.log("Error fetching profile", error);
            const message =
                (error as any)?.name === 'AbortError'
                    ? 'Profile request timed out. Please reload.'
                    : 'Error fetching profile';
            setProfileLoadError(message);
            if (!isAuthPage) {
                handleAuthError(router, false);
            }
        } finally {
            setIsAgentProfileLoading(false);
        }
    };

    useEffect(() => {
        console.log('AgentProvider useEffect - status:', status, 'session:', !!session, 'pathname:', pathname, 'isUserDataLoaded:', isUserDataLoaded);
        
        if (status === "loading") {
            return; // Still loading session
        }
        
        // Only redirect from login page if user has a session (allow register page even with session)
        if (session && isLoginPage) {
            // Redirect immediately when session is available, don't wait for user data
            console.log('AgentProvider: Redirecting from login page to surveys');
                router.push("/surveys");
            return;
        }
        
        // If we're not on an auth page and don't have a session, redirect to login
        if (!session && !isAuthPage) {
            console.log('AgentProvider: No session, redirecting to login');
            router.push("/login");
            // Mark initialization complete so the fallback UI does not hang
            setIsInitialized(true);
            return;
        }

        // Only fetch profile if we have a session and need to
        if (session && !agent && !isAgentProfileLoading && !isUserDataLoaded) {
            console.log('AgentProvider: Fetching agent profile');
            fetchAgentProfile();
        }
        
        // Mark as initialized only after user data is loaded or we're on auth page
        if (!isInitialized && (isUserDataLoaded || isAuthPage)) {
            console.log('AgentProvider: Marking as initialized');
            setIsInitialized(true);
        }
    }, [pathname, session, status, isUserDataLoaded]);

    // Don't render children until we've initialized and loaded user data (except for auth pages)
    if (!isInitialized && !isAuthPage) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="flex flex-col items-center space-y-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <p className="text-sm text-muted-foreground">
                        {profileLoadError ? profileLoadError : 'Loading your profile...'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <AgentContext.Provider value={{ 
            agent, 
            setAgent, 
            user, 
            setUser, 
            organization,
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
