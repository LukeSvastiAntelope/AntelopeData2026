"use client"

import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Rocket, FileText, MessageSquareText, PhoneCall, Loader2, Bot, Sparkles, HeartHandshake, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"
import LogoText from "@/components/logo-text"
import toast from "react-hot-toast"

type ChatMsg = { role: 'user' | 'assistant'; content: string }

export default function FrontLanding() {
  const router = useRouter()
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadPreview, setUploadPreview] = useState<any>(null)
  const [salesChatOpen, setSalesChatOpen] = useState(false)
  const [pricingBotPromoMinimized, setPricingBotPromoMinimized] = useState(false)
  const [salesTab, setSalesTab] = useState<'sales-call' | 'pricing-bot'>('sales-call')

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
  })
  const [pricingLoading, setPricingLoading] = useState(false)
  const [pricingResult, setPricingResult] = useState<null | {
    quoteToken: string
    finalPrice: number
    listPrice: number
    discountPct: number
    favorabilityScore: number
    needsHumanReview: boolean
    rationale: string[]
    personalityLine?: string
    shareText?: string
    referralLink?: string
  }>(null)
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [followUpStartLoading, setFollowUpStartLoading] = useState(false)
  const [chatSessionId, setChatSessionId] = useState<string | null>(null)
  const [followMessages, setFollowMessages] = useState<ChatMsg[]>([])
  const [followDraft, setFollowDraft] = useState('')
  const [followSending, setFollowSending] = useState(false)
  const [negotiatedQuote, setNegotiatedQuote] = useState<null | {
    finalPrice: number
    discountPct: number
    favorabilityScore: number
    listPrice: number
  }>(null)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [origin, setOrigin] = useState('')

  const handleSignUp = () => {
    router.push("/auth/register")
  }

  const handleFileUpload = async (file: File) => {
    setUploadFile(file);
    setUploadLoading(true);
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch('/api/public/surveys/preview', {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      
      if (result.status) {
        setUploadPreview(result.preview);
        toast.success(`Found ${result.preview.totalRows} responses and ${result.preview.detectedDemographics?.length || 0} voter profiles!`);
      } else {
        toast.error(result.message || 'Failed to analyze file');
        setShowUploadDialog(false);
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload file');
      setShowUploadDialog(false);
    } finally {
      setUploadLoading(false);
    }
  };

  const handleGetStarted = () => {
    setShowUploadDialog(false);
    router.push("/auth/register");
  };

  const resetUploadDialog = () => {
    setUploadFile(null);
    setUploadPreview(null);
    setUploadLoading(false);
  };

  useEffect(() => {
    setOrigin(typeof window !== 'undefined' ? window.location.origin : '')
  }, [])

  const displayPrice = negotiatedQuote ?? pricingResult
  const activeQuoteToken =
    followUpOpen && chatSessionId ? chatSessionId : pricingResult?.quoteToken

  const handlePricingQuote = async () => {
    setPricingLoading(true)
    setFollowUpOpen(false)
    setChatSessionId(null)
    setFollowMessages([])
    setNegotiatedQuote(null)
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
      })
      const data = await res.json()
      if (!res.ok || !data?.status) {
        toast.error(data?.message || 'Failed to generate quote.')
        return
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
      })
      toast.success('Pricing quote generated.')
    } catch {
      toast.error('Failed to generate quote.')
    } finally {
      setPricingLoading(false)
    }
  }

  const startFollowUpNegotiation = async () => {
    if (!pricingForm.positionRunningFor.trim() || !pricingForm.candidateName.trim()) {
      toast.error('Position and candidate name are required to continue.')
      return
    }
    setFollowUpStartLoading(true)
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
      })
      const data = await res.json()
      if (!res.ok || !data?.status) {
        toast.error(data?.message || 'Could not open follow-up chat.')
        return
      }
      setChatSessionId(data.sessionId)
      setFollowMessages((data.messages || []) as ChatMsg[])
      setFollowUpOpen(true)
      setNegotiatedQuote(null)
      toast.success('Keep making your case below.')
    } catch {
      toast.error('Could not open follow-up chat.')
    } finally {
      setFollowUpStartLoading(false)
    }
  }

  const sendFollowUpMessage = async () => {
    const text = followDraft.trim()
    if (!text || !chatSessionId) return
    setFollowSending(true)
    try {
      const res = await fetch('/api/pricing-bot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'message', sessionId: chatSessionId, userMessage: text }),
      })
      const data = await res.json()
      if (!res.ok || !data?.status) {
        toast.error(data?.message || 'Send failed.')
        return
      }
      setFollowMessages((data.messages || []) as ChatMsg[])
      setNegotiatedQuote({
        finalPrice: data.quote.finalPrice,
        discountPct: data.quote.discountPct,
        favorabilityScore: Number(data.cumulativeFavorabilityScore ?? data.quote.favorabilityScore ?? 0),
        listPrice: data.quote.listPrice,
      })
      setPricingResult((prev) =>
        prev
          ? {
              ...prev,
              shareText: data.shareText ?? prev.shareText,
              referralLink: data.referralLink ?? prev.referralLink,
            }
          : prev
      )
      setFollowDraft('')
    } catch {
      toast.error('Send failed.')
    } finally {
      setFollowSending(false)
    }
  }

  const applyShareBonus = async (action: 'linkedin' | 'facebook' | 'campaign_email') => {
    if (!activeQuoteToken) return
    try {
      const res = await fetch('/api/pricing-bot/share-bonus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteToken: activeQuoteToken, action }),
      })
      const data = await res.json()
      if (!res.ok || !data?.status) return
      const fp = data.quote.finalPrice
      const dp = data.quote.discountPct
      if (followUpOpen && negotiatedQuote) {
        setNegotiatedQuote((q) => (q ? { ...q, finalPrice: fp, discountPct: dp } : q))
      } else {
        setPricingResult((prev) => (prev ? { ...prev, finalPrice: fp, discountPct: dp } : prev))
      }
      toast.success('+5% share bonus applied (once).')
    } catch {}
  }

  const handleOpenCampaignActionKit = () => {
    if (!displayPrice) return
    const d = pricingForm.districtCode?.trim()
    if (!d) {
      toast.error('Add a US House district (e.g. NJ-5) to open your district report.')
      return
    }
    const params = new URLSearchParams()
    params.set('district', d)
    if (pricingForm.candidateName) params.set('candidate', pricingForm.candidateName)
    if (pricingForm.positionRunningFor) params.set('position', pricingForm.positionRunningFor)
    if (pricingForm.issue) params.set('issue', pricingForm.issue)
    params.set('quoted', String(displayPrice.finalPrice))
    params.set('discount', String(displayPrice.discountPct))
    router.push(`/campaign-action-kit?${params.toString()}`)
  }

  const handleHumanReview = async () => {
    if (!pricingResult) return
    setReviewLoading(true)
    try {
      const res = await fetch('/api/pricing-bot/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pricingForm.email || null,
          pricingForm,
          pricingResult: { ...pricingResult, ...negotiatedQuote, quoteToken: activeQuoteToken },
        }),
      })
      const data = await res.json()
      if (!res.ok || !data?.status) {
        toast.error(data?.message || 'Failed to submit human review.')
        return
      }
      toast.success(`Human review submitted (${data.requestId}).`)
    } catch {
      toast.error('Failed to submit human review.')
    } finally {
      setReviewLoading(false)
    }
  }

  const openPricingBotPanel = () => {
    setSalesChatOpen(true)
    setSalesTab('pricing-bot')
  }

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap');
      `}</style>
    <div className="flex-1 p-2 w-full bg-background font-['Montserrat']">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        {/* Header */}
        <div className="px-6 py-4">
          {/* Top nav row (must be ABOVE logo) */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            </div>

            <nav className="flex-1 overflow-x-auto whitespace-nowrap">
              <div className="flex items-center justify-center gap-5 px-2 text-sm min-w-max">
                <Link href="/about-us" className="text-muted-foreground hover:text-foreground transition-colors">
                  About Us/Blog
                </Link>
                <Link href="/solutions" className="text-muted-foreground hover:text-foreground transition-colors">
                  Solutions/Pricing
                </Link>
                <Link href="/resources" className="text-muted-foreground hover:text-foreground transition-colors">
                  Resources
                </Link>
                <Link href="/who-we-serve" className="text-muted-foreground hover:text-foreground transition-colors">
                  Who We Serve
                </Link>
                <Link href="/features-demo" className="text-muted-foreground hover:text-foreground transition-colors">
                  Features+Demo
                </Link>
              </div>
            </nav>

            <Link href="/auth/login" className="text-sm font-semibold text-primary hover:underline shrink-0">
              Login
            </Link>
          </div>

          {/* Logo row (explicitly below nav) */}
          <div className="mt-4 flex items-center justify-center">
            <Link href="/" className="flex items-center">
              <LogoText
                className="text-zinc-900 dark:text-zinc-100"
                width={140}
                height={34}
              />
            </Link>
          </div>
        </div>

        <div className="border-b border-border" />

        {/* Main content */}
        <div className="py-16">
          {/* Hero Section */}
          <section className="relative w-full h-[30vh] md:h-[35vh] rounded-lg overflow-hidden flex items-start justify-center">
            <div className="relative z-10 flex flex-col items-center text-center max-w-3xl px-4 gap-y-6">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/5 border border-primary/10 text-primary font-medium text-xs">
                <Rocket className="h-3 w-3" />
                Unlimited polls &amp; responses
              </div>
              <h1 className="leading-none text-4xl sm:text-5xl lg:text-8xl font-bold tracking-tight text-card-foreground">
                Understand Your Voters Before They Vote.
              </h1>
              <p className="font-medium text-2xl mb-6">
                AI-powered polling, voter modeling, and campaign intelligence.
              </p>
              
              {/* Action Buttons */}
              <div className="flex items-center gap-4">
                  <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
                    <DialogTrigger asChild>
                      <Button 
                        size="lg" 
                        variant="outline" 
                        className="px-8 py-3 text-lg font-medium"
                      >
                        Import Poll Data
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Try Antelope with Your Polling Data</DialogTitle>
                      </DialogHeader>
                      {!uploadPreview ? (
                        <div className="space-y-4">
                          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                            <input
                              type="file"
                              accept=".csv,.xlsx,.xls"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileUpload(file);
                              }}
                              className="hidden"
                              id="file-upload-demo"
                              disabled={uploadLoading}
                            />
                            <label htmlFor="file-upload-demo" className="cursor-pointer">
                              <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                              <p className="text-lg font-medium mb-2">
                                {uploadLoading ? 'Analyzing your polling data...' : 'Drop your poll data file here'}
                              </p>
                              <p className="text-sm text-gray-500">
                                {uploadLoading ? 'Please wait while we process your data' : 'or click to browse (CSV, Excel)'}
                              </p>
                              <p className="text-xs text-gray-400 mt-2">Max file size: 10MB</p>
                            </label>
                          </div>
                          <div className="text-center text-sm text-muted-foreground">
                            <p>See how Antelope transforms your polling responses into queryable voter profiles</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <h3 className="font-medium text-green-800 mb-2">Poll Analysis Complete!</h3>
                            <div className="space-y-2 text-sm">
                              <p><strong>Survey:</strong> {uploadPreview.suggestedTitle}</p>
                              <p><strong>Responses:</strong> {uploadPreview.totalRows || 0} voter responses</p>
                              <p><strong>Questions:</strong> {uploadPreview.columns?.length || 0} poll questions</p>
                              {uploadPreview.detectedDemographics && uploadPreview.detectedDemographics.length > 0 && (
                                <p><strong>Voter Profiles:</strong> {uploadPreview.detectedDemographics.length} demographic profiles detected</p>
                              )}
                            </div>
                          </div>
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h4 className="font-medium text-blue-800 mb-2">What you can do next:</h4>
                            <ul className="text-sm text-blue-700 space-y-1">
                              <li>&bull; Ask questions like &quot;What are the top voter concerns?&quot;</li>
                              <li>&bull; Segment by demographics: &quot;Show me responses from independents aged 25-45&quot;</li>
                              <li>&bull; Test messages: &quot;How would suburban voters react to this healthcare message?&quot;</li>
                              <li>&bull; Generate campaign briefings and export reports</li>
                            </ul>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button variant="outline" onClick={() => { setShowUploadDialog(false); resetUploadDialog(); }}>
                              Try Another File
                            </Button>
                            <Button onClick={handleGetStarted} className="bg-primary">
                              Sign Up to Continue
                            </Button>
                          </div>
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                  <span className="text-muted-foreground">or</span>
                  <Button 
                    size="lg" 
                    variant="outline"
                    className="px-8 py-3 text-lg font-medium"
                    onClick={() => router.push("/auth/login")}
                  >
                    Login
                  </Button>
                  <span className="text-muted-foreground">or</span>
                  <Button 
                    size="lg" 
                    className="px-8 py-3 text-lg font-medium"
                    onClick={handleSignUp}
                  >
                    Sign Up Free
                  </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center mt-2">
                Currently in beta — free and unlimited during early access.
              </p>

            </div>
          </section>

          {/* Feature Grid */}
          <section className="mt-16 max-w-6xl mx-auto">
            <h3 className="text-4xl font-bold text-center mb-2">Campaign intelligence, simplified</h3>
            <p className="text-muted-foreground text-center mb-12 text-lg">
              Ask what you want to know about your voters and Antelope will answer you. No more waiting weeks for poll results.
            </p>
            <div className="grid gap-12 lg:grid-cols-3">
              {/* Create or import polls */}
              <div className="text-left space-y-6">
                <div className="mx-auto w-full max-w-sm">
                  <img 
                    src="/web-01.png" 
                    alt="Create or import polls" 
                    className="w-full h-auto"
                  />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-xl text-gray-900 dark:text-gray-100">Create or import any poll</h3>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    AI-powered poll builder + import from CSV, Excel, SurveyMonkey, Google Sheets, and Typeform.
                  </p>
                </div>
              </div>

              {/* Chat with your electorate */}
              <div className="text-left space-y-6">
                <div className="mx-auto w-full max-w-sm">
                  <img 
                    src="/web-02.png" 
                    alt="Chat with voter data" 
                    className="w-full h-auto"
                  />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-xl text-gray-900 dark:text-gray-100">Chat with your voter data</h3>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    Ask plain-language questions about your polling data and get instant, evidence-based answers.
                  </p>
                </div>
              </div>

              {/* Generate campaign briefings */}
              <div className="text-left space-y-6">
                <div className="mx-auto w-full max-w-sm">
                  <img 
                    src="/web-03.png" 
                    alt="Generate campaign briefings" 
                    className="w-full h-auto"
                  />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-xl text-gray-900 dark:text-gray-100">Generate campaign briefings</h3>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    Ask for in-depth reports on any topic and share them with your campaign team.
                  </p>
                </div>
              </div>

              {/* AI poll creator */}
              <div className="text-left space-y-6">
                <div className="mx-auto w-full max-w-sm">
                  <img 
                    src="/web-04.png" 
                    alt="AI poll creator" 
                    className="w-full h-auto"
                  />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-xl text-gray-900 dark:text-gray-100">AI poll creator</h3>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    Describe your research question and our AI drafts a professional poll in seconds.
                  </p>
                </div>
              </div>

              {/* Synthetic voter profiles */}
              <div className="text-left space-y-6">
                <div className="mx-auto w-full max-w-sm">
                  <img 
                    src="/web-05.png" 
                    alt="Synthetic voter profiles" 
                    className="w-full h-auto"
                  />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-xl text-gray-900 dark:text-gray-100">Synthetic voter profiles</h3>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    Each respondent becomes a queryable voter profile — test messages and explore opinions on demand.
                  </p>
                </div>
              </div>

              {/* Voter segmentation */}
              <div className="text-left space-y-6">
                <div className="mx-auto w-full max-w-sm">
                  <img 
                    src="/web-06.png" 
                    alt="Voter segmentation" 
                    className="w-full h-auto"
                  />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-xl text-gray-900 dark:text-gray-100">Voter segmentation</h3>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    Identify swing voters, base supporters, and persuadable segments with AI-driven analysis.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="py-16">
            <div className="max-w-5xl mx-auto">
              <Card className="relative overflow-hidden border-2 border-border shadow-xl">
                <div className="absolute top-0 left-0 right-0 h-1 bg-foreground" />
                <CardContent className="p-12 text-center space-y-6">
                  <h2 className="text-4xl font-bold text-card-foreground">
                    See Antelope in action
                  </h2>
                  <p className="text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
                    Watch how Antelope can automate your survey data workflow—from importing responses to generating insights through AI-powered chat and advanced analytics.
                  </p>
                  <div className="flex items-center justify-center gap-4 pt-4">
                    <Button
                      size="lg"
                      className="px-8 py-6 text-lg font-medium bg-primary hover:bg-primary/90"
                      onClick={() => window.open('https://www.youtube.com/watch?v=Dgr7KQ__i1k', '_blank')}
                    >
                      Watch Demo
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      </div>

      {/* Bottom-right sales chat (stub) */}
      <div className="fixed bottom-4 right-4 z-50">
        {salesChatOpen && (
          <div className="mb-2 w-[380px] max-w-[95vw] rounded-lg border border-violet-500/50 bg-background backdrop-blur shadow-lg overflow-hidden">
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
                    This widget routes messages to our team for onboarding and sales support.
                  </div>
                  <div className="rounded-md bg-muted/40 p-2">
                    <div className="text-xs text-muted-foreground">Examples:</div>
                    <ul className="text-xs mt-1 space-y-1">
                      <li>- “Can you show me a demo for a city council race?”</li>
                      <li>- “What does pricing look like for a small campaign?”</li>
                      <li>- “Can we import NGP VAN data?”</li>
                    </ul>
                  </div>
                </TabsContent>
                <TabsContent value="pricing-bot" className="space-y-3 mt-3">
                  <div className="rounded-xl border border-violet-500/40 bg-gradient-to-br from-violet-500/15 via-cyan-500/15 to-emerald-500/15 p-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-10 w-10 rounded-full bg-background/70 border border-violet-400/40 flex items-center justify-center">
                        <Bot className="h-5 w-5 text-violet-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Pricing Bot Challenge</p>
                        <p className="text-[11px] text-muted-foreground">Start at $650/mo (first 3 months). Make your case, then keep negotiating if you want more off.</p>
                      </div>
                      <Sparkles className="h-5 w-5 ml-auto text-cyan-500" />
                    </div>
                    <div className="mt-2 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1.5 text-[11px] font-medium">
                      Can you drop our price from <span className="font-bold">$650</span> toward <span className="font-bold">$99</span>? Make your case.
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-foreground">Position running for</span>
                      <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={pricingForm.positionRunningFor} onChange={(e) => setPricingForm((p) => ({ ...p, positionRunningFor: e.target.value }))} placeholder="e.g. Congress, Mayor, City Council" />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-foreground">Candidate name</span>
                      <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={pricingForm.candidateName} onChange={(e) => setPricingForm((p) => ({ ...p, candidateName: e.target.value }))} placeholder="Full name" />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-foreground">US campaign district <span className="font-normal text-muted-foreground">(if applicable)</span></span>
                      <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={pricingForm.districtCode} onChange={(e) => setPricingForm((p) => ({ ...p, districtCode: e.target.value }))} placeholder="e.g. NJ-5" />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-foreground">Campaign website <span className="font-normal text-muted-foreground">(optional)</span></span>
                      <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" type="url" inputMode="url" value={pricingForm.campaignWebsite} onChange={(e) => setPricingForm((p) => ({ ...p, campaignWebsite: e.target.value }))} placeholder="https://yourcampaign.com" />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-foreground">Discount percentage sought</span>
                      <p className="text-[11px] text-muted-foreground leading-snug">Roughly how much you want off list (0–90%). The bot treats this as a target, not a guarantee.</p>
                      <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" type="number" min={0} max={90} value={pricingForm.reductionSoughtPct} onChange={(e) => setPricingForm((p) => ({ ...p, reductionSoughtPct: Number(e.target.value || 0) }))} />
                    </label>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-foreground">Make your case</span>
                    <Textarea value={pricingForm.convinceText} onChange={(e) => setPricingForm((p) => ({ ...p, convinceText: e.target.value }))} placeholder="Convince the bot why this campaign deserves a stronger price..." rows={3} />
                  </label>
                  <Button onClick={handlePricingQuote} disabled={pricingLoading} className="w-full">
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
                          <div
                            className="h-full bg-gradient-to-r from-amber-500 via-lime-500 to-emerald-500 transition-all"
                            style={{ width: `${Math.max(3, displayPrice?.favorabilityScore ?? pricingResult.favorabilityScore)}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-muted-foreground">List ${pricingResult.listPrice}/mo (first 3 months)</span>
                        <span className="text-sm font-semibold">${displayPrice?.finalPrice ?? pricingResult.finalPrice}/mo · {displayPrice?.discountPct ?? pricingResult.discountPct}% off (first 3 months)</span>
                        {negotiatedQuote && followUpOpen ? (
                          <span className="text-[10px] text-muted-foreground">Updated after follow-up negotiation.</span>
                        ) : null}
                      </div>
                      {pricingResult.personalityLine ? <div className="text-[11px] rounded border border-violet-500/30 bg-violet-500/10 px-2 py-1">{pricingResult.personalityLine}</div> : null}
                      {pricingResult.shareText ? <Textarea readOnly value={pricingResult.shareText} rows={2} className="text-[11px]" /> : null}
                      {pricingResult.referralLink ? <Textarea readOnly rows={2} value={`${origin}${pricingResult.referralLink}`} className="text-[11px]" /> : null}
                      {!followUpOpen ? (
                        <button
                          type="button"
                          onClick={startFollowUpNegotiation}
                          disabled={followUpStartLoading}
                          className="w-full rounded-lg border border-violet-500/50 bg-violet-500/15 px-3 py-2 text-left text-xs font-medium text-foreground transition hover:bg-violet-500/25 disabled:opacity-60"
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
                              <div key={i} className={`rounded px-2 py-1 ${m.role === 'user' ? 'bg-primary/15 ml-3' : 'bg-muted/80 mr-2'}`}>
                                {m.content}
                              </div>
                            ))}
                          </div>
                          <Textarea
                            value={followDraft}
                            onChange={(e) => setFollowDraft(e.target.value)}
                            placeholder="Your next argument…"
                            rows={2}
                            className="text-xs"
                          />
                          <Button size="sm" className="w-full" type="button" onClick={() => void sendFollowUpMessage()} disabled={followSending || !followDraft.trim()}>
                            {followSending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
                          </Button>
                        </div>
                      ) : null}
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1" onClick={async () => {
                          if (pricingResult.shareText) {
                            await navigator.clipboard.writeText(pricingResult.shareText)
                            toast.success('Share text copied.')
                          }
                        }}>
                          Copy to share
                        </Button>
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
        {pricingBotPromoMinimized ? (
          <button
            type="button"
            onClick={() => setPricingBotPromoMinimized(false)}
            className="mt-2 flex items-center gap-2 rounded-full border border-violet-500/50 bg-background px-3 py-2 text-sm font-medium shadow-lg transition hover:bg-violet-500/10"
            aria-label="Open pricing bot panel"
          >
            <Bot className="h-4 w-4 text-violet-500" />
            Pricing Bot
          </button>
        ) : (
          <div className="mt-2 w-[380px] max-w-[95vw] rounded-xl border border-violet-500/50 bg-background backdrop-blur shadow-lg p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <div className="h-12 w-12 rounded-full border border-violet-400/50 bg-violet-500/10 flex items-center justify-center shadow-sm">
                  <Bot className="h-6 w-6 text-violet-500" />
                </div>
                <div>
                  <p className="text-lg font-semibold leading-tight">Pricing Bot</p>
                  <p className="text-sm text-muted-foreground mt-1 leading-snug">
                    Opens from the corner. Make your case, then keep convincing Antelope for a deeper discount.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPricingBotPromoMinimized(true)}
                className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Minimize pricing bot panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 rounded-md border border-violet-500/40 bg-violet-500/20 px-3 py-2 text-sm font-medium">
              Think you can drop us from <span className="font-bold">$650</span> to as low as <span className="font-bold">$99</span> (for the first 3 months)?
            </div>
            <Button size="lg" className="w-full mt-3 text-base font-semibold" onClick={openPricingBotPanel}>
              Open Pricing Bot Challenge
            </Button>
          </div>
        )}
      </div>
    </div>
    </>
  )
}
