import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Lightbulb, MessageCircle, Rocket, Brain } from "lucide-react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import LogoText from "@/components/logo-text"
// Background hero now uses the public/hero.jpg asset

export default function FrontLanding() {
  const router = useRouter()

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
          <section
            className="relative w-full h-[50vh] md:h-[75vh] rounded-lg overflow-hidden flex items-start justify-center"
            style={{ backgroundImage: "url('/hero.jpg')", backgroundSize: 'contain', backgroundPosition: 'center 140px', backgroundRepeat: 'no-repeat' }}
          >
            {/* Overlay for readability bg-background/60 */}
            <div className="absolute inset-0 " />

            {/* Content */}
            <div className="relative z-10 flex flex-col items-center text-center max-w-3xl px-4 gap-y-6">
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-card-foreground">
              Turn Your Surveys Into a Living Network of Synthetic Personas.
              </h2>
              <p className="text-muted-foreground">
                Antelope lets you generate AI-powered surveys, build anonymised Digital Twins, and understand your audience in minutes—not weeks.
              </p>
              <Button size="lg" onClick={() => router.push("/register")}>Get started — it&apos;s free</Button>
            </div>
          </section>

           {/* Final CTA */}
           <section className=" rounded-lg bg-primary/5 p-8 text-center space-y-4 max-w-8xl mx-auto">
            <h3 className="text-3xl font-semibold text-card-foreground">Ready to get insights that move the needle?</h3>
            <p className="text-muted-foreground">Join Antelope today and start understanding your audience.</p>
            <Button size="lg" onClick={() => router.push("/register")}>Get Started</Button>
          </section>

          {/* Feature Grid */}
          <section className="mt-16 max-w-6xl mx-auto">
            <h3 className="text-3xl font-bold text-center mb-8">Key Features</h3>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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