"use client"

import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Rocket, FileText, MessageSquareText, PhoneCall } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import Link from "next/link"
import LogoText from "@/components/logo-text"
import toast from "react-hot-toast"

export default function FrontLanding() {
  const router = useRouter()
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadPreview, setUploadPreview] = useState<any>(null)
  const [salesChatOpen, setSalesChatOpen] = useState(false)

  const handleSignUp = () => {
    router.push("/register")
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
    router.push("/register");
  };

  const resetUploadDialog = () => {
    setUploadFile(null);
    setUploadPreview(null);
    setUploadLoading(false);
  };

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

            <Link href="/login" className="text-sm font-semibold text-primary hover:underline shrink-0">
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
        </div>
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
                  <li>- “Can you show me a demo for a city council race?”</li>
                  <li>- “What does pricing look like for a small campaign?”</li>
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
    </>
  )
}
