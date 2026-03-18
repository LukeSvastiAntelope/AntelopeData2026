'use client';

import Link from "next/link";
import { toast } from "@/components/ui/sonner";
import { useState, useEffect } from "react";
import { validateEmail } from "@/app/utils/validation";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Linkedin, PhoneCall, MessageSquareText } from "lucide-react";
import { signIn } from "next-auth/react";
import { useSession } from "next-auth/react";

const LoginPage = () => {
    const [formData, setFormData] = useState<{ email: string; password: string }>({
        email: '',
        password: '',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [salesChatOpen, setSalesChatOpen] = useState(false);
    const { data: session, status } = useSession();

    const router = useRouter();

    // Redirect if already authenticated and session is loaded
    useEffect(() => {
        console.log('Login page useEffect - status:', status, 'session:', !!session);
        if (status === "authenticated" && session) {
            console.log('Redirecting to surveys from login page');
            router.push("/surveys");
        }
    }, [status, session, router]);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const emailCheck = validateEmail(formData.email);
        if (emailCheck) {
            toast.error(emailCheck);
            return;
        }
        setIsLoading(true);
        try {
            console.log('Attempting authentication with next-auth signIn...');

            const result = await signIn('credentials', {
                email: formData.email,
                password: formData.password,
                redirect: false,
                callbackUrl: '/surveys'
            });

            console.log('Authentication result:', result);

            if (result?.error) {
                console.error('Client signIn error:', result.error);
                if (result.error === 'CredentialsSignin') {
                    toast.error('Invalid email or password.');
                } else if (result.error === 'EmailNotVerified') {
                    toast.error('Your account is not verified yet. Please check your email for the confirmation link.');
                } else if (result.error === 'DatabaseError') {
                    toast.error('Service temporarily unavailable. Please try again in a moment.');
                } else {
                    toast.error(result.error);
                }
                return;
            }

            console.log('Authentication successful, showing toast and redirecting...');
            toast.success("Signed in successfully!");

            router.push('/surveys');
        } catch (error: any) {
            console.error("Authentication error:", error);
            toast.error("Authentication failed. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleForgotPassword = async () => {
        const email = formData.email;
        if (!email) {
            toast.error("Please enter your email first");
            return;
        }

        const emailCheck = validateEmail(email);
        if (emailCheck) {
            toast.error(emailCheck);
            return;
        }

        setIsResetting(true);
        try {
            const result = await fetch("/api/forgotPassword", {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await result.json();
            
            if (data.status) {
                toast.success("Password reset instructions sent to your email");
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            console.error("An error occurred:", error);
            toast.error("An unexpected error occurred");
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <div className="container relative min-h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-1 lg:px-0">
            {/* Top nav (BEFORE logo + Welcome back) */}
            <div className="absolute top-0 left-0 right-0 px-6 py-4">
                <div className="mx-auto max-w-5xl">
                    <div className="flex items-center justify-between gap-3">
                        <nav className="flex-1 overflow-x-auto whitespace-nowrap">
                            <div className="flex items-center gap-3 text-[17px] min-w-max">
                                <Link href="/about-us" className="text-foreground/90 hover:text-foreground transition-colors border-2 border-black/70 dark:border-white/30 rounded-md px-2.5 py-1 bg-white/70 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 font-semibold shadow-sm">
                                    About Us/Blog
                                </Link>
                                <Link href="/solutions" className="text-foreground/90 hover:text-foreground transition-colors border-2 border-black/70 dark:border-white/30 rounded-md px-2.5 py-1 bg-white/70 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 font-semibold shadow-sm">
                                    Solutions/Pricing
                                </Link>
                                <Link href="/resources" className="text-foreground/90 hover:text-foreground transition-colors border-2 border-black/70 dark:border-white/30 rounded-md px-2.5 py-1 bg-white/70 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 font-semibold shadow-sm">
                                    Resources
                                </Link>
                                <Link href="/who-we-serve" className="text-foreground/90 hover:text-foreground transition-colors border-2 border-black/70 dark:border-white/30 rounded-md px-2.5 py-1 bg-white/70 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 font-semibold shadow-sm">
                                    Who We Serve
                                </Link>
                                <Link href="/features-demo" className="text-foreground/90 hover:text-foreground transition-colors border-2 border-black/70 dark:border-white/30 rounded-md px-2.5 py-1 bg-white/70 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 font-semibold shadow-sm">
                                    Features+Demo
                                </Link>
                            </div>
                        </nav>
                        <Link href="/register" className="shrink-0 text-sm font-semibold text-primary hover:underline">
                            Sign up
                        </Link>
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-center space-y-6">
                <img 
                    src="/assets/images/logo.svg"
                    alt="Logo"
                    width={120}
                    height={120}
                    className="mb-2 brightness-0 dark:brightness-0 dark:invert"
                />
                
                <Card className="w-[350px] bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <CardHeader className="space-y-1">
                        <CardTitle className="text-2xl text-center">Welcome back</CardTitle>
                        <CardDescription className="text-center">
                            Enter your credentials to access your account
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    placeholder="Email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    required
                                    className="bg-background"
                                    disabled={isLoading}
                                />
                            </div>
                            <div className="space-y-2">
                                <Input
                                    id="password"
                                    name="password"
                                    type="password"
                                    placeholder="Password"
                                    autoComplete="current-password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    required
                                    className="bg-background"
                                    disabled={isLoading}
                                />
                            </div>
                            <Button 
                                className="w-full" 
                                type="submit"
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Signing in...
                                    </>
                                ) : (
                                    "Sign In"
                                )}
                            </Button>
                            
                            {/* TODO: Re-enable Google OAuth when properly configured
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-background px-2 text-muted-foreground">
                                        Or continue with
                                    </span>
                                </div>
                            </div>
                            
                            <Button
                                variant="outline"
                                type="button"
                                disabled={isLoading}
                                onClick={() => signIn('google')}
                                className="w-full"
                            >
                                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                                    <path
                                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                        fill="#4285F4"
                                    />
                                    <path
                                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                        fill="#34A853"
                                    />
                                    <path
                                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                        fill="#FBBC05"
                                    />
                                    <path
                                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                        fill="#EA4335"
                                    />
                                </svg>
                                Continue with Google
                            </Button>
                            */}
                        </form>
                    </CardContent>
                    <CardFooter className="flex flex-col space-y-4">
                        <Button 
                            variant="ghost" 
                            className="w-full text-sm"
                            onClick={handleForgotPassword}
                            disabled={isResetting}
                        >
                            {isResetting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Resetting...
                                </>
                            ) : (
                                "Forgot password?"
                            )}
                        </Button>
                        <div className="text-sm text-muted-foreground text-center">
                                        Don&apos;t have an account?{" "}
                            <Link 
                                href="/register" 
                                className="text-primary underline-offset-4 hover:underline"
                            >
                                Sign up
                            </Link>
                        </div>

                        {/* OAuth + LinkedIn (requested) */}
                        <div className="w-full space-y-2">
                            <Button
                                variant="outline"
                                type="button"
                                className="w-full"
                                disabled={isLoading}
                                onClick={async () => {
                                    try {
                                        await signIn('google', { callbackUrl: '/surveys' });
                                    } catch {
                                        toast.error('OAuth is not configured yet.');
                                    }
                                }}
                            >
                                Continue with OAuth
                            </Button>
                            <Button variant="outline" asChild className="w-full">
                                <a href="https://www.linkedin.com/company/108247205" target="_blank" rel="noreferrer">
                                    <Linkedin className="mr-2 h-4 w-4" />
                                    LinkedIn
                                </a>
                            </Button>
                        </div>
                    </CardFooter>
                </Card>
            </div>

            {/* Bottom-right sales chat (stub) */}
            <div className="fixed bottom-4 right-4 z-50">
                {salesChatOpen && (
                    <div className="mb-2 w-[340px] max-w-[92vw] rounded-lg border border-border/60 bg-background/95 backdrop-blur shadow-lg overflow-hidden">
                        <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <MessageSquareText className="h-4 w-4" />
                                <div className="text-sm font-medium">Antelope Help (preview)</div>
                            </div>
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setSalesChatOpen(false)}>
                                Close
                            </Button>
                        </div>
                        <div className="p-3 text-sm space-y-2 max-h-[260px] overflow-auto">
                            <div className="text-muted-foreground">
                                This widget will route messages to our team for onboarding and sales support.
                            </div>
                            <div className="rounded-md bg-muted/40 p-2">
                                <div className="text-xs text-muted-foreground">Examples:</div>
                                <ul className="text-xs mt-1 space-y-1">
                                    <li>- “Can you show me a demo for a small campaign?”</li>
                                    <li>- “What does pricing look like?”</li>
                                    <li>- “Can we import NGP VAN data?”</li>
                                </ul>
                            </div>
                        </div>
                        <div className="p-3 border-t border-border/60">
                            <textarea
                                disabled
                                placeholder="Stuck? Ask for a sales call here! (coming soon)"
                                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground resize-none"
                                rows={2}
                            />
                        </div>
                    </div>
                )}

                <Button onClick={() => setSalesChatOpen(v => !v)} className="rounded-full shadow-lg">
                    <PhoneCall className="h-4 w-4 mr-2" />
                    Stuck? Ask for a sales call here!
                </Button>
            </div>
        </div>
    );
}

export default LoginPage;