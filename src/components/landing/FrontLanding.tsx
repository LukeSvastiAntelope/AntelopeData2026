"use client"

import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Lightbulb as LightbulbIcon, MessageCircle as MessageCircleIcon, Rocket, Brain as BrainIcon, Send, Upload, FileText } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import Link from "next/link"
import LogoText from "@/components/logo-text"
// Background hero now uses the public/hero.jpg asset
import toast from "react-hot-toast"

export default function FrontLanding() {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadPreview, setUploadPreview] = useState<any>(null)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      // For now, just redirect to register - later we can add demo functionality
      router.push("/register")
    }
  }

  const handleSend = () => {
    // For now, just redirect to register - later we can add demo functionality
    router.push("/register")
  }

  const handleFileUpload = async (file: File) => {
    console.log('Upload button clicked, file:', file.name, 'type:', file.type, 'size:', file.size);
    setUploadFile(file);
    setUploadLoading(true);
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      console.log('Making request to /api/public/surveys/preview for demo upload');
      
      // Use a public endpoint for demo uploads (no auth required)
      const response = await fetch('/api/public/surveys/preview', {
        method: 'POST',
        body: formData,
      });
      
      console.log('Response status:', response.status);
      const result = await response.json();
      console.log('Response result:', result);
      
      if (result.status) {
        setUploadPreview(result.preview);
        toast.success(`Found ${result.preview.totalRows} responses and ${result.preview.detectedDemographics?.length || 0} digital twin profiles!`);
      } else {
        console.error('Upload failed:', result.message);
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
    // Close dialog and redirect to register
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
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <LogoText 
                className="text-zinc-900 dark:text-zinc-100"
                width={120} 
                height={30} 
              />
            </div>
            <Link href="/login" className="text-sm font-medium text-primary hover:underline">Login</Link>
          </div>
        </div>

        <div className="border-b border-border" />

        {/* Main content space-y-16 */}
        <div className="p-6 ">
          {/* Hero Section */}
          <section className="relative w-full h-[50vh] md:h-[75vh] rounded-lg overflow-hidden flex items-start justify-center">
            {/* Content */}
            <div className="relative z-10 flex flex-col items-center text-center max-w-3xl px-4 gap-y-6">
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-card-foreground">
              Turn Your Surveys Into a Live Network of Synthetic Personas.
              </h2>
              <p className="text-muted-foreground mb-6">
                Antelope lets you generate AI-powered surveys, build anonymised Digital Twins, and understand your audience in minutes—not weeks.
              </p>
              
              {/* Chat Input Field */}
              <div className="relative w-full max-w-xl">
                <Textarea 
                  className="flex-1 min-h-[80px] pr-24 resize-none" 
                  placeholder="Ask the cohort… or upload your survey to get started" 
                  value={input} 
                  onChange={e => setInput(e.target.value)} 
                  onKeyDown={handleKeyDown}
                  rows={2}
                />
                <div className="absolute right-2 bottom-2 flex gap-1">
                  <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
                    <DialogTrigger asChild>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8" 
                        title="Upload survey file to see the magic"
                      >
                        <Upload className="h-4 w-4"/>
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Try Antelope with Your Survey Data</DialogTitle>
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
                                {uploadLoading ? 'Analyzing your survey...' : 'Drop your survey file here'}
                              </p>
                              <p className="text-sm text-gray-500">
                                {uploadLoading ? 'Please wait while we process your data' : 'or click to browse (CSV, Excel)'}
                              </p>
                              <p className="text-xs text-gray-400 mt-2">Max file size: 10MB</p>
                            </label>
                          </div>
                          <div className="text-center text-sm text-muted-foreground">
                            <p>See how Antelope transforms your survey responses into queryable digital twins</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <h3 className="font-medium text-green-800 mb-2">🎉 Survey Analysis Complete!</h3>
                            <div className="space-y-2 text-sm">
                              <p><strong>Survey:</strong> {uploadPreview.suggestedTitle}</p>
                              <p><strong>Responses:</strong> {uploadPreview.totalRows || 0} survey responses</p>
                              <p><strong>Questions:</strong> {uploadPreview.columns?.length || 0} survey questions</p>
                              {uploadPreview.detectedDemographics && uploadPreview.detectedDemographics.length > 0 && (
                                <p><strong>Digital Twins:</strong> {uploadPreview.detectedDemographics.length} demographic profiles detected</p>
                              )}
                            </div>
                          </div>
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h4 className="font-medium text-blue-800 mb-2">What you can do next:</h4>
                            <ul className="text-sm text-blue-700 space-y-1">
                              <li>• Ask questions like &quot;What are the main trends?&quot;</li>
                              <li>• Filter by demographics: &quot;Show me responses from users 25-35&quot;</li>
                              <li>• Get insights: &quot;How do different age groups respond differently?&quot;</li>
                              <li>• Export charts and summaries for presentations</li>
                            </ul>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button variant="outline" onClick={() => { setShowUploadDialog(false); resetUploadDialog(); }}>
                              Try Another File
                            </Button>
                            <Button onClick={handleGetStarted} className="bg-primary">
                              Sign Up to Continue →
                            </Button>
                          </div>
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-8 w-8" 
                    onClick={handleSend}
                  >
                    <Send className="h-4 w-4"/>
                  </Button>
                </div>
              </div>
              
              <div className="text-xs text-center max-w-xl space-y-2">
                <p className="font-medium text-muted-foreground">Try asking:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    "What are the key trends in responses?",
                    "How do demographics affect answers?", 
                    "Show response patterns"
                  ].map((prompt, index) => (
                    <div 
                      key={index}
                      className="px-3 py-1.5 border border-border rounded-md bg-background/50 text-muted-foreground hover:bg-background/80 transition-colors cursor-pointer"
                      onClick={() => setInput(prompt)}
                    >
                      &quot;{prompt}&quot;
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

           {/* Final CTA */}
           <section 
            className="relative rounded-lg p-8 text-center space-y-4 max-w-8xl mx-auto h-[400px] flex flex-col items-center justify-center overflow-hidden"
            style={{ backgroundImage: "url('/hero.jpg')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
          >
            {/* Overlay for readability */}
            <div className="absolute inset-0 bg-background/60" />
            
            {/* Content */}
            <div className="relative z-10 space-y-4">
              <h3 className="text-3xl font-semibold text-card-foreground">Ready to get insights that move the needle?</h3>
              <p className="text-muted-foreground">Join Antelope today and start understanding your audience.</p>
              <Button size="lg" onClick={() => router.push("/register")}>Get Started</Button>
            </div>
          </section>

          {/* Feature Grid */}
          <section className="mt-16 max-w-6xl mx-auto">
            <h3 className="text-3xl font-bold text-center mb-8">Key Features</h3>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <Card className="bg-card border-border shadow-sm">
                <CardContent className="p-6 space-y-4">
                  <LightbulbIcon className="h-6 w-6 text-primary" />
                  <h3 className="font-semibold text-lg">AI-Powered Builder</h3>
                  <p className="text-muted-foreground text-sm">
                    Describe your research goal and let our AI draft engaging questions in seconds.
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card border-border shadow-sm">
                <CardContent className="p-6 space-y-4">
                  <MessageCircleIcon className="h-6 w-6 text-primary" />
                  <h3 className="font-semibold text-lg">Instant Analytics</h3>
                  <p className="text-muted-foreground text-sm">
                    Real-time dashboards, GPT-powered cohort chat, and exportable charts ready for your deck.
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card border-border shadow-sm">
                <CardContent className="p-6 space-y-4">
                  <BrainIcon className="h-6 w-6 text-primary" />
                  <h3 className="font-semibold text-lg">Personal Digital Twins</h3>
                  <p className="text-muted-foreground text-sm">
                    Every respondent gets an anonymised twin that evolves as they share more—boosting engagement &amp; data richness.
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* How It Works */}
          <section className="mt-16 space-y-12 max-w-6xl mx-auto">
            <h3 className="text-3xl font-bold text-center mb-8">How Antelope Works</h3>
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                {
                  title: "1. Generate",
                  description:
                    "Describe your research goal and Antelope's AI drafts a survey in seconds, tuned for engagement and data quality.",
                },
                {
                  title: "2. Collect",
                  description:
                    "Share a single link, QR code, or Telegram bot. Responses roll in, instantly turning into anonymised Digital Twins.",
                },
                {
                  title: "3. Understand",
                  description:
                    "Explore real-time dashboards, slice cohorts, and chat with the aggregated personas—all without spreadsheets.",
                },
              ].map((item) => (
                <Card key={item.title} className="bg-card border-border shadow-sm text-center">
                  <CardContent className="p-6 space-y-4">
                    <h4 className="font-semibold text-lg">{item.title}</h4>
                    <p className="text-muted-foreground text-sm">{item.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* Why Antelope */}
          <section className="mt-24 max-w-4xl mx-auto text-center space-y-6">
            <h3 className="text-3xl font-bold">Why Choose Antelope?</h3>
            <ul className="list-disc list-inside text-left mx-auto space-y-2 max-w-2xl">
              <li className="text-muted-foreground">Built-in AI removes the grunt work of survey design and analysis.</li>
              <li className="text-muted-foreground">Digital Twins keep respondents engaged, boosting completion rates.</li>
              <li className="text-muted-foreground">Real-time cohort chat surfaces insights the moment data lands.</li>
              <li className="text-muted-foreground">Exportable charts ready for decks, reports, and stakeholders.</li>
            </ul>
          </section>

          {/* Testimonials */}
          <section className="mt-24 space-y-12 max-w-6xl mx-auto">
            <h3 className="text-3xl font-bold text-center mb-8">What Early Users Say</h3>
            <div className="grid gap-6 md:grid-cols-3">
              {[
                {
                  quote:
                    "Antelope cut our research time from weeks to days. The Digital Twin concept is a game-changer.",
                  name: "Sofia L.",
                  title: "UX Research Lead",
                },
                {
                  quote:
                    "We uncovered customer segments we didn't even know existed. The cohort chat feels like magic.",
                  name: "Ryan K.",
                  title: "Product Manager",
                },
                {
                  quote:
                    "The dashboards helped us secure buy-in from stakeholders faster than ever.",
                  name: "Maya P.",
                  title: "Growth Strategist",
                },
              ].map((t) => (
                <Card key={t.name} className="bg-card border-border shadow-sm h-full">
                  <CardContent className="p-6 flex flex-col gap-4">
                    <p className="italic text-muted-foreground flex-1">&ldquo;{t.quote}&rdquo;</p>
                    <div className="text-sm font-medium text-card-foreground">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.title}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

         
        </div>
      </div>
    </div>
    </>
  )
} 