import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Lightbulb, MessageCircle, Rocket, Brain } from "lucide-react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
// Hero image served from public/assets/images/hero-image.png

export default function FrontLanding() {
  const router = useRouter()

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        {/* Header */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <h1 className="text-base font-medium text-card-foreground">Welcome</h1>
            </div>
            <Link href="/login" className="text-sm font-medium text-primary hover:underline">Login</Link>
          </div>
        </div>

        <div className="border-b border-border" />

        {/* Main content */}
        <div className="p-6 space-y-16">
          {/* Hero Section */}
          <section className="text-center max-w-4xl mx-auto space-y-6">
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-card-foreground">
              Create Surveys and turn responders into Digital Twins.
            </h2>
            <p className="text-muted-foreground">
              Antelope lets you generate AI-powered surveys, build anonymised Digital Twins, and understand your audience in minutes—not weeks.
            </p>
            <div className="flex justify-center gap-4">
              <Button size="lg" onClick={() => router.push("/register")}>Get started — it&apos;s free</Button>
            </div>
          </section>

          {/* Hero Illustration */}
          <div className="max-w-2xl mx-auto">
            <Image
              src="/hero.jpg"
              alt="Illustration of Antelope survey and digital twin features"
              className="w-full h-auto rounded-lg shadow-sm"
              width={600}
              height={300}
              priority
            />
          </div>

          {/* Feature Grid */}
          <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-card border-border shadow-sm">
              <CardContent className="p-6 space-y-4">
                <Lightbulb className="h-6 w-6 text-primary" />
                <h3 className="font-semibold text-lg">AI-Powered Builder</h3>
                <p className="text-muted-foreground text-sm">
                  Describe your research goal and let our AI draft engaging questions in seconds.
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border shadow-sm">
              <CardContent className="p-6 space-y-4">
                <Rocket className="h-6 w-6 text-primary" />
                <h3 className="font-semibold text-lg">Share Anywhere</h3>
                <p className="text-muted-foreground text-sm">
                  One public link, QR codes, or Telegram bot—collect responses wherever your audience lives.
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border shadow-sm">
              <CardContent className="p-6 space-y-4">
                <MessageCircle className="h-6 w-6 text-primary" />
                <h3 className="font-semibold text-lg">Instant Analytics</h3>
                <p className="text-muted-foreground text-sm">
                  Real-time dashboards, GPT-powered cohort chat, and exportable charts ready for your deck.
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border shadow-sm">
              <CardContent className="p-6 space-y-4">
                <Brain className="h-6 w-6 text-primary" />
                <h3 className="font-semibold text-lg">Personal Digital Twins</h3>
                <p className="text-muted-foreground text-sm">
                  Every respondent gets an anonymised twin that evolves as they share more—boosting engagement &amp; data richness.
                </p>
              </CardContent>
            </Card>
          </section>


          {/* Final CTA */}
          <section className="rounded-lg bg-primary/5 p-8 text-center space-y-4">
            <h3 className="text-2xl font-semibold text-card-foreground">Ready to get insights that move the needle?</h3>
            <p className="text-muted-foreground">Join Antelope today and start understanding your audience.</p>
            <Button size="lg" onClick={() => router.push("/register")}>Get Started</Button>
          </section>
        </div>
      </div>
    </div>
  )
} 