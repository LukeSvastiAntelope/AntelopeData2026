"use client"

import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Card, CardContent } from "@/components/ui/card"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Lightbulb as LightbulbIcon, MessageCircle as MessageCircleIcon, Rocket, Brain as BrainIcon, Upload, FileText, Check, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import Link from "next/link"
import LogoText from "@/components/logo-text"
// Background hero now uses the public/hero.jpg asset
import toast from "react-hot-toast"

export default function FrontLanding() {
  const router = useRouter()
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadPreview, setUploadPreview] = useState<any>(null)

  const handleSignUp = () => {
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
            </div>
            <div className="absolute left-1/2 transform -translate-x-1/2">
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
        <div className="">
          {/* Hero Section */}
          <section className="relative w-full py-16">
          <div className="max-w-7xl mx-auto h-[30vh] md:h-[35vh] flex items-start justify-center">
            {/* Content */}
            <div className="relative z-10 flex flex-col items-center text-center max-w-3xl px-4 gap-y-6">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/5 border border-primary/10 text-primary font-medium text-xs">
                <Rocket className="h-3 w-3" />
                Unlimited surveys &amp; responses
              </div>
              <h1 className="leading-none text-4xl sm:text-5xl lg:text-8xl font-bold tracking-tight text-card-foreground">
              Advanced Analytics without code or fuss.
              </h1>
              <p className="font-medium text-2xl mb-6">
              One place for analytics, recruitment, survey creation/edits, and reports.
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
                      Import Survey
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
                  <span className="text-muted-foreground">or</span>
                  <Button 
                    size="lg" 
                    variant="outline"
                    className="px-8 py-3 text-lg font-medium"
                    onClick={() => router.push("/login")}
                  >
                    Login
                  </Button>
                  <span className="text-muted-foreground">or</span>
                  <Button 
                    size="lg" 
                    className="px-8 py-3 text-lg font-medium"
                    onClick={handleSignUp}
                  >
                    Sign Up
                  </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center mt-2">
                This is still in beta so expect hiccups.
              </p>
              

            </div>
          </div>
          </section>

           {/* Final CTA */}
           {/* <section 
            className="relative rounded-lg py-6 px-0 text-center space-y-4 max-w-8xl mx-auto h-[400px] flex flex-col items-center justify-center overflow-hidden"
            style={{ backgroundImage: "url('/hero.jpg')", backgroundSize: 'cover', backgroundPosition: 'top', backgroundRepeat: 'no-repeat' }}
          > */}
            {/* Overlay for readability */}
            {/* <div className="absolute inset-0 bg-background/10" /> */}
            
            {/* Content */}
            {/* <div className="relative z-10 space-y-4">
              <h3 className="text-3xl font-semibold text-card-foreground">Ready to get insights that move the needle?</h3>
              <p className="text-muted-foreground">Join Antelope today and start understanding your audience.</p>
              <Button size="lg" onClick={() => router.push("/register")}>Get Started</Button>
            </div> */}
          {/* </section> */}

          {/* Feature Grid */}
          <section className="py-16">
          <div className="max-w-6xl mx-auto">
            <h3 className="text-4xl font-bold text-center mb-2">Simple, powerful and free</h3>
            <p className="text-muted-foreground text-center mb-12 text-lg">
              Ask what you want to know about your survey and Antelope will answer you. No need to read long reports to get the insights.
            </p>
            <div className="grid gap-12 lg:grid-cols-3">
              {/* Create or import any survey */}
              <div className="text-left space-y-6">
                <div className="mx-auto w-full max-w-sm">
                  <img 
                    src="/web-01.png" 
                    alt="Create or import surveys illustration" 
                    className="w-full h-auto "
                  />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-xl text-gray-900 dark:text-gray-100">Create or import any survey</h3>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    Powerful AI builder + csv, xls, Survey Monkey, Google Sheets and Typeform.
                  </p>
                </div>
              </div>

              {/* Chat with survey */}
              <div className="text-left space-y-6">
                <div className="mx-auto w-full max-w-sm">
                  <img 
                    src="/web-02.png" 
                    alt="Chat with survey illustration" 
                    className="w-full h-auto "
                  />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-xl text-gray-900 dark:text-gray-100">Chat with survey</h3>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    No need to read long reports to get the insights. Chat directly with the survey.
                  </p>
                </div>
              </div>

              {/* Build powerful reports */}
              <div className="text-left space-y-6">
                <div className="mx-auto w-full max-w-sm">
                  <img 
                    src="/web-03.png" 
                    alt="Build powerful reports illustration" 
                    className="w-full h-auto "
                  />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-xl text-gray-900 dark:text-gray-100">Build powerful reports</h3>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    Ask the agent for in-depth report about anything and share it with your collagues.
                  </p>
                </div>
              </div>

              {/* AI survey creator */}
              <div className="text-left space-y-6">
                <div className="mx-auto w-full max-w-sm">
                  <img 
                    src="/web-04.png" 
                    alt="AI survey creator illustration" 
                    className="w-full h-auto "
                  />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-xl text-gray-900 dark:text-gray-100">AI survey creator</h3>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                  Just type in what you want the survey to be about and the agent will create a first draft for you.
                  </p>
                </div>
              </div>

              {/* Create synthetic personas */}
              <div className="text-left space-y-6">
                <div className="mx-auto w-full max-w-sm">
                  <img 
                    src="/web-05.png" 
                    alt="Create synthetic personas illustration" 
                    className="w-full h-auto "
                  />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-xl text-gray-900 dark:text-gray-100">Create synthetic personas</h3>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    Turn real responders into synthetic personas you can use to further enrich your surveys.
                  </p>
                </div>
              </div>

              {/* Grow survey audience */}
              <div className="text-left space-y-6">
                <div className="mx-auto w-full max-w-sm">
                  <img 
                    src="/web-06.png" 
                    alt="Grow survey audience illustration" 
                    className="w-full h-auto "
                  />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-xl text-gray-900 dark:text-gray-100">Grow survey audience</h3>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    For every responder that answers we build a digital twin you can further enhance and help you in the future.
                  </p>
                </div>
              </div>
            </div>
          </div>
          </section>

        
          {/* <section className="mt-16 space-y-12 max-w-6xl mx-auto">
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
          </section> */}

          {/* Why Antelope */}
          {/* <section className="mt-24 max-w-4xl mx-auto text-center space-y-6">
            <h3 className="text-3xl font-bold">Why Choose Antelope?</h3>
            <ul className="list-disc list-inside text-left mx-auto space-y-2 max-w-2xl">
              <li className="text-muted-foreground">Built-in AI removes the grunt work of survey design and analysis.</li>
              <li className="text-muted-foreground">Digital Twins keep respondents engaged, boosting completion rates.</li>
              <li className="text-muted-foreground">Real-time cohort chat surfaces insights the moment data lands.</li>
              <li className="text-muted-foreground">Exportable charts ready for decks, reports, and stakeholders.</li>
            </ul>
          </section> */}

          {/* Final CTA Section */}
          <section className="py-16">
          <div className="max-w-5xl mx-auto">
            <Card className="relative overflow-hidden border-2 border-border shadow-xl">
              {/* Black border effect */}
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
    </div>
    </>
  )
} 