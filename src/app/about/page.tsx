"use client";

import Link from "next/link";
import { PublicLayout } from "@/app/components/PublicLayout"

export default function AboutPage() {
  return (
    <PublicLayout>
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        {/* Header */}
        <div className="px-6 py-4">
          <div className="flex items-center">
            <h1 className="text-base font-medium text-card-foreground">About</h1>
          </div>
        </div>

        <div className="border-b border-border" />

        <div className="p-6">
          {/* Introduction */}
          <div id="why-antelope" className="text-left space-y-2 flex scroll-mt-24">
            <div className="flex-col mb-4">
              <h2 className="text-2xl font-bold">About Us</h2>
              <p className="text-muted-foreground text-base max-w-2xl leading-relaxed">
                Antelope is a lightweight, advanced political campaign management platform designed for political
                campaigns, strategic policy planning, local government, PACs, and other organizations that require
                surveys and polls, analytics, geographical data overlays, and organizational tools.
              </p>
            </div>
          </div>

          <h2 className="text-xl font-semibold mt-8 mb-4 text-foreground">The 4 Main Features</h2>
          <ol className="list-decimal list-inside space-y-3 text-muted-foreground">
            <li>Centralized geographical data overlay for data ingestion and planning (includes bot scraping and basic automations)</li>
            <li><strong className="text-foreground">Integrated Outbound</strong> — spread your message or poll via Telegram, SMS, WhatsApp, email, and website embeddings</li>
            <li><strong className="text-foreground">Native Survey creation</strong> — AI automated, but fully editable</li>
            <li><strong className="text-foreground">Advanced no-code Python analytics</strong> — ask difficult questions about correlations and regressions and get the answer in seconds. Also deployable for content creation — create insightful posts and more.</li>
          </ol>
          <p className="text-muted-foreground leading-relaxed mt-4">
            Our major design takeaway is to provide integrated inbound AND outbound, full advanced no-code analytics,
            data overlay, and advanced AI features — with zero frustration, full centralization, and affordable cost.
          </p>
          <p className="text-muted-foreground leading-relaxed mt-4">
            For our overall political belief system and manifesto — including why we built this and who we built it
            for — take a look at{" "}
            <Link href="/blog/what-we-believe" className="text-primary hover:underline font-medium">
              our blog article
            </Link>
            . In short, we believe that current tools are inadequate for tomorrow&apos;s leaders because they lack
            proper inbound. Modern political campaign tools treat surveys as an afterthought, and even when included,
            do not integrate them with advanced analytics — leaving heavy outbound, or spam messaging, as the default
            action of many campaigns. This is wrong.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-4 text-foreground">Who Is It For?</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">Antelope is designed for:</p>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground">
            <li>small downballot campaign teams</li>
            <li>exploratory committees</li>
            <li>municipal governments and corporate organizations that require smooth, fast polling</li>
            <li>small PACs</li>
            <li>campaign leaders and organizers looking to develop key insight quickly</li>
            <li>and anyone needing advanced analytics, integrated outbound, and survey creation</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-4 text-foreground">How Does It Work?</h2>
          <p className="text-muted-foreground leading-relaxed">
            Getting started is simple. Import your district&apos;s geographical and voter data into a centralized
            map-based dashboard, where everything lives in one place. Build a survey — let the AI draft it in
            seconds, then edit it freely — and push it out through Telegram, SMS, WhatsApp, email, or an embed on
            your own website. As responses come in, ask questions of your data in plain English: correlations,
            regressions, turnout patterns. The no-code Python engine returns the answer in seconds, and can turn
            that same insight into ready-to-post content. Inbound and outbound in one loop: listen, analyze, act,
            repeat.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-4 text-foreground">How Much Does It Cost?</h2>
          <p className="text-muted-foreground leading-relaxed">
            Antelope is priced to be affordable at the local level, where budgets are smallest and the need is
            greatest. Plans start at $49/month for hyperlocal campaigns, scaling up through Local ($99), State
            ($299), and Federal ($499) tiers as your reach grows. Non-profits are served at cost, and enterprise
            pricing is available for larger organizations. Every price is published in full — no rounding, no
            &quot;contact us for a quote.&quot; Pay annually and you get twelve months for the cost of ten.
          </p>
          <p className="mt-2">
            <Link href="/pricing" className="text-primary hover:underline font-medium">
              See the full pricing page →
            </Link>
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-4 text-foreground">Who Are We?</h2>
          <p className="text-muted-foreground leading-relaxed">
            Antelope was founded in 2026 as the result of a personal journey of discovery and entrepreneurship by
            Luke Svasti. A graduate of Rutgers University (New Brunswick), Columbia, and Oxford, Luke has an
            academic background in sociology, political science, and law, with policy experience at the Refugee
            Council of Lithuania, New Jersey United Students, the United States Student Association, Oxford Pro
            Bono Publico, and the Rutgers University Student Assembly.
          </p>
          <p className="text-muted-foreground leading-relaxed mt-4">
            Luke was first inspired by his own difficulty with R and other statistical tools. As a sufferer of
            dyscalculia, Luke always wanted a better tool for non-technical individuals and teams. Antelope began
            its spiritual roots with Napolleon, a joint Oxford University incubator project (now defunct), before
            becoming an independent project focusing on surveys. From there, chance encounters with old friends
            involved with political networking and lobbying led Antelope to hone in on being the best-in-class
            lightweight analytical tool for fast, small campaigns.
          </p>
          <p className="text-muted-foreground leading-relaxed mt-4">
            For more information and our full history, take a look{" "}
            <Link href="/blog/our-history" className="text-primary hover:underline font-medium">
              here
            </Link>
            .
          </p>
          <p className="text-muted-foreground leading-relaxed mt-4">
            Currently, Antelope is headed by Luke Svasti, with engineering by Abhishek Rathi and advisory design
            input by Thomas Petersen.
          </p>
        </div>
      </div>
    </div>
    </PublicLayout>
  );
}
