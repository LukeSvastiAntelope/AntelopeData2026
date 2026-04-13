'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { validateDisplayName } from "@/app/utils/validation";
import { useSession } from "next-auth/react";

export default function SetupProfilePage() {
    const [displayName, setDisplayName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { data: session, status } = useSession();
    const router = useRouter();

    useEffect(() => {
        if (status === 'loading') return; // Still loading
        
        if (!session) {
            router.push('/login');
            return;
        }

        // Set initial display name from session if available
        if (session.user?.name) {
            setDisplayName(session.user.name);
        }
    }, [session, status, router]);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        
        const displayNameCheck = validateDisplayName(displayName);
        if (displayNameCheck) {
            toast.error(displayNameCheck);
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch('/api/setup-profile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    displayName
                })
            });

            const data = await response.json();
            
            if (data.status) {
                toast.success('Profile updated successfully!');
                router.push('/cohort-chat');
            } else {
                toast.error(data.message || 'Failed to update profile');
            }
        } catch (error) {
            console.error('Profile setup error:', error);
            toast.error('An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSkip = () => {
        // Allow users to skip for now and use their current display name
        router.push('/cohort-chat');
    };

    return (
        <div className="container relative min-h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-1 lg:px-0">
            <div className="flex flex-col items-center space-y-6">
                <img 
                    src="/assets/images/logo.svg"
                    alt="Logo"
                    width={120}
                    height={120}
                    className="mb-2 brightness-0 dark:brightness-0 dark:invert"
                />
                
                <Card className="w-[400px] bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <CardHeader className="space-y-1">
                        <CardTitle className="text-2xl text-center">Welcome to the New Antelope!</CardTitle>
                        <CardDescription className="text-center">
                            We&apos;ve upgraded our authentication system. Please choose your display name.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <label htmlFor="displayName" className="text-sm font-medium">
                                    Display Name
                                </label>
                                <Input
                                    id="displayName"
                                    name="displayName"
                                    type="text"
                                    placeholder="How should others see your name?"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    required
                                    className="bg-background"
                                    disabled={isLoading}
                                />
                                <p className="text-xs text-muted-foreground">
                                    This is how your name will appear to other users
                                </p>
                            </div>
                            <Button 
                                className="w-full" 
                                type="submit"
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Updating Profile...
                                    </>
                                ) : (
                                    "Continue"
                                )}
                            </Button>
                        </form>
                    </CardContent>
                    <CardFooter>
                        <Button 
                            variant="ghost" 
                            className="w-full text-sm"
                            onClick={handleSkip}
                            disabled={isLoading}
                        >
                            Skip for now
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
} 