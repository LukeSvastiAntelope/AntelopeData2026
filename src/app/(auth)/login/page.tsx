'use client';

import Link from "next/link";
import { toast } from "@/components/ui/sonner";
import { useState, useEffect } from "react";
import { validateEmail } from "@/app/utils/validation";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Linkedin, PhoneCall, MessageSquareText, Bot, Sparkles, HeartHandshake } from "lucide-react";
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
    const [salesTab, setSalesTab] = useState<'sales-call' | 'pricing-bot'>('sales-call');
    const { data: session, status } = useSession();

    const [pricingForm, setPricingForm] = useState({
        positionRunningFor: '',
        candidateName: '',
        districtCode: '',
        campaignWebsite: '',
        reductionSoughtPct: 25,
        issue: '',
        supporterName: '',
        convinceText: '',
        email: '',
    });
    const [pricingLoading, setPricingLoading] = useState(false);
    const [pricingResult, setPricingResult] = useState<null | {
        quoteToken: string;
        finalPrice: number;
        listPrice: number;
        discountPct: number;
        favorabilityScore: number;
        needsHumanReview: boolean;
        rationale: string[];
        personalityLine?: string;
        shareText?: string;
        referralLink?: string;
    }>(null);
    const [followUpOpen, setFollowUpOpen] = useState(false);
    const [followUpStartLoading, setFollowUpStartLoading] = useState(false);
    const [chatSessionId, setChatSessionId] = useState<string | null>(null);
    const [followMessages, setFollowMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
    const [followDraft, setFollowDraft] = useState('');
    const [followSending, setFollowSending] = useState(false);
    const [negotiatedQuote, setNegotiatedQuote] = useState<null | {
        finalPrice: number;
        discountPct: number;
        favorabilityScore: number;
        listPrice: number;
    }>(null);
    const [reviewLoading, setReviewLoading] = useState(false);
    const [origin, setOrigin] = useState('');

    const router = useRouter();

    useEffect(() => {
        setOrigin(typeof window !== 'undefined' ? window.location.origin : '');
    }, []);

    const displayPrice = negotiatedQuote ?? pricingResult;
    const activeQuoteToken = followUpOpen && chatSessionId ? chatSessionId : pricingResult?.quoteToken;

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

    const handlePricingQuote = async () => {
        setPricingLoading(true);
        setFollowUpOpen(false);
        setChatSessionId(null);
        setFollowMessages([]);
        setNegotiatedQuote(null);
        try {
            const res = await fetch('/api/pricing-bot/quote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    campaignType: pricingForm.positionRunningFor,
                    candidateName: pricingForm.candidateName,
                    districtCode: pricingForm.districtCode,
                    campaignWebsite: pricingForm.campaignWebsite,
                    reductionSoughtPct: pricingForm.reductionSoughtPct,
                    convinceText: pricingForm.convinceText,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data?.status) {
                toast.error(data?.message || 'Failed to generate quote.');
                return;
            }
            setPricingResult({
                quoteToken: data.quote.quoteToken,
                finalPrice: data.quote.finalPrice,
                listPrice: data.quote.listPrice,
                discountPct: data.quote.discountPct ?? Math.round(((data.quote.listPrice - data.quote.finalPrice) / data.quote.listPrice) * 100),
                favorabilityScore: Number(data.quote.favorabilityScore || 0),
                needsHumanReview: data.quote.needsHumanReview,
                rationale: Array.isArray(data.rationale) ? data.rationale : [],
                personalityLine: data.personalityLine,
                shareText: data.shareText,
                referralLink: data.referralLink,
            });
            toast.success('Pricing quote generated.');
        } catch {
            toast.error('Failed to generate quote.');
        } finally {
            setPricingLoading(false);
        }
    };

    const startFollowUpNegotiation = async () => {
        if (!pricingForm.positionRunningFor.trim() || !pricingForm.candidateName.trim()) {
            toast.error('Position and candidate name are required to continue.');
            return;
        }
        setFollowUpStartLoading(true);
        try {
            const res = await fetch('/api/pricing-bot/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'start',
                    profile: {
                        campaignType: pricingForm.positionRunningFor,
                        candidateName: pricingForm.candidateName,
                        districtCode: pricingForm.districtCode,
                        campaignWebsite: pricingForm.campaignWebsite,
                        reductionSoughtPct: pricingForm.reductionSoughtPct,
                    },
                }),
            });
            const data = await res.json();
            if (!res.ok || !data?.status) {
                toast.error(data?.message || 'Could not open follow-up chat.');
                return;
            }
            setChatSessionId(data.sessionId);
            setFollowMessages(data.messages || []);
            setFollowUpOpen(true);
            setNegotiatedQuote(null);
            toast.success('Keep making your case below.');
        } catch {
            toast.error('Could not open follow-up chat.');
        } finally {
            setFollowUpStartLoading(false);
        }
    };

    const sendFollowUpMessage = async () => {
        const text = followDraft.trim();
        if (!text || !chatSessionId) return;
        setFollowSending(true);
        try {
            const res = await fetch('/api/pricing-bot/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'message', sessionId: chatSessionId, userMessage: text }),
            });
            const data = await res.json();
            if (!res.ok || !data?.status) {
                toast.error(data?.message || 'Send failed.');
                return;
            }
            setFollowMessages(data.messages || []);
            setNegotiatedQuote({
                finalPrice: data.quote.finalPrice,
                discountPct: data.quote.discountPct,
                favorabilityScore: Number(data.cumulativeFavorabilityScore ?? data.quote.favorabilityScore ?? 0),
                listPrice: data.quote.listPrice,
            });
            setPricingResult((prev) =>
                prev
                    ? {
                          ...prev,
                          shareText: data.shareText ?? prev.shareText,
                          referralLink: data.referralLink ?? prev.referralLink,
                      }
                    : prev
            );
            setFollowDraft('');
        } catch {
            toast.error('Send failed.');
        } finally {
            setFollowSending(false);
        }
    };

    const applyShareBonus = async (action: 'linkedin' | 'facebook' | 'campaign_email') => {
        if (!activeQuoteToken) return;
        try {
            const res = await fetch('/api/pricing-bot/share-bonus', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quoteToken: activeQuoteToken, action }),
            });
            const data = await res.json();
            if (!res.ok || !data?.status) return;
            const fp = data.quote.finalPrice;
            const dp = data.quote.discountPct;
            if (followUpOpen && negotiatedQuote) {
                setNegotiatedQuote((q) => (q ? { ...q, finalPrice: fp, discountPct: dp } : q));
            } else {
                setPricingResult((prev) => (prev ? { ...prev, finalPrice: fp, discountPct: dp } : prev));
            }
            toast.success('+5% share bonus applied (once).');
        } catch {
            /* ignore */
        }
    };

    const handleOpenCampaignActionKit = () => {
        if (!displayPrice) return;
        const d = pricingForm.districtCode?.trim();
        if (!d) {
            toast.error('Add a US House district (e.g. NJ-5) to open your district report.');
            return;
        }
        const params = new URLSearchParams();
        params.set('district', d);
        if (pricingForm.candidateName) params.set('candidate', pricingForm.candidateName);
        if (pricingForm.positionRunningFor) params.set('position', pricingForm.positionRunningFor);
        if (pricingForm.issue) params.set('issue', pricingForm.issue);
        params.set('quoted', String(displayPrice.finalPrice));
        params.set('discount', String(displayPrice.discountPct));
        router.push(`/campaign-action-kit?${params.toString()}`);
    };

    const handleHumanReview = async () => {
        if (!pricingResult) return;
        setReviewLoading(true);
        try {
            const res = await fetch('/api/pricing-bot/review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: pricingForm.email || null,
                    pricingForm,
                    pricingResult: { ...pricingResult, ...negotiatedQuote, quoteToken: activeQuoteToken },
                }),
            });
            const data = await res.json();
            if (!res.ok || !data?.status) {
                toast.error(data?.message || 'Failed to submit human review.');
                return;
            }
            toast.success(`Human review submitted (${data.requestId}).`);
        } catch {
            toast.error('Failed to submit human review.');
        } finally {
            setReviewLoading(false);
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
                    <div className="mb-2 w-[380px] max-w-[95vw] rounded-lg border border-border/60 bg-background/95 backdrop-blur shadow-lg overflow-hidden">
                        <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <MessageSquareText className="h-4 w-4" />
                                <div className="text-sm font-medium">Antelope Help (preview)</div>
                            </div>
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setSalesChatOpen(false)}>
                                Close
                            </Button>
                        </div>
                        <div className="p-3 text-sm max-h-[min(78vh,560px)] overflow-auto">
                            <Tabs value={salesTab} onValueChange={(v) => setSalesTab(v as 'sales-call' | 'pricing-bot')}>
                                <TabsList className="grid grid-cols-2 w-full">
                                    <TabsTrigger value="sales-call">Sales Call</TabsTrigger>
                                    <TabsTrigger value="pricing-bot">Pricing Bot</TabsTrigger>
                                </TabsList>

                                <TabsContent value="sales-call" className="space-y-2 mt-3">
                                    <div className="text-muted-foreground">
                                        This routes messages to our team for onboarding and sales support.
                                    </div>
                                    <div className="rounded-md bg-muted/40 p-2">
                                        <div className="text-xs text-muted-foreground">Examples:</div>
                                        <ul className="text-xs mt-1 space-y-1">
                                            <li>- “Can you show me a demo for a small campaign?”</li>
                                            <li>- “What does pricing look like?”</li>
                                            <li>- “Can we import NGP VAN data?”</li>
                                        </ul>
                                    </div>
                                </TabsContent>

                                <TabsContent value="pricing-bot" className="space-y-3 mt-3">
                                    <div className="rounded-lg border border-violet-500/30 bg-gradient-to-br from-violet-500/10 via-cyan-500/10 to-emerald-500/10 p-2">
                                        <div className="flex items-center gap-2">
                                            <div className="h-8 w-8 rounded-full bg-background/70 border border-border flex items-center justify-center">
                                                <Bot className="h-4 w-4 text-violet-500" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-medium">Pricing Bot</p>
                                                <p className="text-[10px] text-muted-foreground">First quote here, then keep convincing Antelope for more.</p>
                                            </div>
                                            <Sparkles className="h-4 w-4 ml-auto text-cyan-500" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        <label className="space-y-1">
                                            <span className="text-xs font-medium">Position running for</span>
                                            <Input value={pricingForm.positionRunningFor} onChange={(e) => setPricingForm((p) => ({ ...p, positionRunningFor: e.target.value }))} placeholder="e.g. Congress, Mayor" />
                                        </label>
                                        <label className="space-y-1">
                                            <span className="text-xs font-medium">Candidate name</span>
                                            <Input value={pricingForm.candidateName} onChange={(e) => setPricingForm((p) => ({ ...p, candidateName: e.target.value }))} placeholder="Full name" />
                                        </label>
                                        <label className="space-y-1">
                                            <span className="text-xs font-medium">US district (if applicable)</span>
                                            <Input value={pricingForm.districtCode} onChange={(e) => setPricingForm((p) => ({ ...p, districtCode: e.target.value }))} placeholder="e.g. NJ-5" />
                                        </label>
                                        <label className="space-y-1">
                                            <span className="text-xs font-medium">Campaign website (optional)</span>
                                            <Input type="url" inputMode="url" value={pricingForm.campaignWebsite} onChange={(e) => setPricingForm((p) => ({ ...p, campaignWebsite: e.target.value }))} placeholder="https://…" />
                                        </label>
                                        <label className="space-y-1">
                                            <span className="text-xs font-medium">Discount % sought</span>
                                            <Input type="number" min={0} max={90} value={pricingForm.reductionSoughtPct} onChange={(e) => setPricingForm((p) => ({ ...p, reductionSoughtPct: Number(e.target.value || 0) }))} />
                                        </label>
                                        <label className="space-y-1">
                                            <span className="text-xs font-medium">Issue (optional)</span>
                                            <Input value={pricingForm.issue} onChange={(e) => setPricingForm((p) => ({ ...p, issue: e.target.value }))} placeholder="For action kit" />
                                        </label>
                                        <label className="space-y-1">
                                            <span className="text-xs font-medium">Your name (optional)</span>
                                            <Input value={pricingForm.supporterName} onChange={(e) => setPricingForm((p) => ({ ...p, supporterName: e.target.value }))} />
                                        </label>
                                        <label className="space-y-1">
                                            <span className="text-xs font-medium">Email (optional)</span>
                                            <Input type="email" value={pricingForm.email} onChange={(e) => setPricingForm((p) => ({ ...p, email: e.target.value }))} />
                                        </label>
                                    </div>
                                    <label className="block space-y-1">
                                        <span className="text-xs font-medium">Make your case</span>
                                        <Textarea value={pricingForm.convinceText} onChange={(e) => setPricingForm((p) => ({ ...p, convinceText: e.target.value }))} placeholder="Convince the bot…" rows={3} />
                                    </label>
                                    <Button type="button" onClick={handlePricingQuote} disabled={pricingLoading} className="w-full">
                                        {pricingLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Pricing...</> : 'Get pricing quote'}
                                    </Button>
                                    {pricingResult && (
                                        <div className="rounded-md border border-border/70 bg-muted/30 p-2 space-y-2">
                                            <div>
                                                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                                                    <span>Cumulative favorability</span>
                                                    <span>{(displayPrice?.favorabilityScore ?? pricingResult.favorabilityScore)}/100</span>
                                                </div>
                                                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                                                    <div className="h-full bg-gradient-to-r from-amber-500 via-lime-500 to-emerald-500 transition-all" style={{ width: `${Math.max(3, displayPrice?.favorabilityScore ?? pricingResult.favorabilityScore)}%` }} />
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-xs text-muted-foreground">List ${pricingResult.listPrice}/mo (first 3 months)</span>
                                                <span className="text-sm font-semibold">${displayPrice?.finalPrice ?? pricingResult.finalPrice}/mo · {displayPrice?.discountPct ?? pricingResult.discountPct}% off (first 3 months)</span>
                                            </div>
                                            {pricingResult.personalityLine ? (
                                                <div className="text-[11px] rounded border border-violet-500/30 bg-violet-500/10 px-2 py-1">{pricingResult.personalityLine}</div>
                                            ) : null}
                                            {pricingResult.shareText ? <Textarea readOnly value={pricingResult.shareText} rows={2} className="text-[11px]" /> : null}
                                            {pricingResult.referralLink ? <Textarea readOnly rows={2} value={`${origin}${pricingResult.referralLink}`} className="text-[11px]" /> : null}
                                            {!followUpOpen ? (
                                                <button
                                                    type="button"
                                                    onClick={startFollowUpNegotiation}
                                                    disabled={followUpStartLoading}
                                                    className="w-full rounded-lg border border-violet-500/50 bg-violet-500/15 px-3 py-2 text-left text-xs font-medium transition hover:bg-violet-500/25 disabled:opacity-60"
                                                >
                                                    {followUpStartLoading ? (
                                                        <span className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Opening…</span>
                                                    ) : (
                                                        <>Want a further discount? <span className="text-violet-600 dark:text-violet-300">Click here to keep convincing Antelope!</span></>
                                                    )}
                                                </button>
                                            ) : null}
                                            {followUpOpen && followMessages.length > 0 ? (
                                                <div className="space-y-2 rounded-md border border-violet-500/30 bg-background/80 p-2">
                                                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Keep negotiating</p>
                                                    <div className="max-h-36 overflow-y-auto space-y-1.5 text-[11px]">
                                                        {followMessages.map((m, i) => (
                                                            <div key={i} className={`rounded px-2 py-1 ${m.role === 'user' ? 'bg-primary/15 ml-3' : 'bg-muted/80 mr-2'}`}>{m.content}</div>
                                                        ))}
                                                    </div>
                                                    <Textarea value={followDraft} onChange={(e) => setFollowDraft(e.target.value)} placeholder="Your next argument…" rows={2} className="text-xs" />
                                                    <Button size="sm" className="w-full" type="button" onClick={() => void sendFollowUpMessage()} disabled={followSending || !followDraft.trim()}>
                                                        {followSending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
                                                    </Button>
                                                </div>
                                            ) : null}
                                            <div className="flex gap-2">
                                                <Button size="sm" variant="outline" className="flex-1" onClick={async () => { if (pricingResult.shareText) { await navigator.clipboard.writeText(pricingResult.shareText); toast.success('Copied.'); } }}>Copy to share</Button>
                                                <Button size="sm" variant={pricingResult.needsHumanReview ? 'default' : 'secondary'} className="flex-1" onClick={handleHumanReview} disabled={reviewLoading}>
                                                    {reviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <HeartHandshake className="h-4 w-4 mr-1" />}
                                                    Human review
                                                </Button>
                                            </div>
                                            <Button size="sm" className="w-full" onClick={handleOpenCampaignActionKit}>
                                                Build campaign action kit
                                            </Button>
                                        </div>
                                    )}
                                </TabsContent>
                            </Tabs>
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