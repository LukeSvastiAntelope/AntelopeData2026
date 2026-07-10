"use client";

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
          <div className="text-left space-y-2 flex">
            <div className="flex-col mb-4">
              <h2 className="text-2xl font-bold">About Antelope Politico</h2>
              <p className="text-muted-foreground text-base max-w-2xl mx-auto">
                Antelope Politico is an AI-powered political survey and campaign intelligence platform. We transform your polling responses into synthetic voter profiles you can query, test messages against, and analyze through natural conversation — giving campaigns faster, deeper insights at a fraction of traditional polling costs.
              </p>
            </div>
          </div>

          <h2 id="why-antelope" className="text-xl font-semibold mt-8 mb-4 text-foreground scroll-mt-24">Why Antelope Politico?</h2>
          <p className="text-muted-foreground leading-relaxed">
            Traditional polling gives you a snapshot — a static set of numbers that&apos;s already aging by the time it reaches your desk. 
            Antelope Politico transforms that data into a living, queryable model of your electorate. Every survey response 
            becomes a synthetic voter profile that you can interrogate with new questions, test campaign messages against, 
            and segment in ways traditional crosstabs simply cannot match.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-4 text-foreground">Key Features &amp; Benefits</h2>
          <ul className="list-disc list-inside space-y-3 text-muted-foreground">
            <li><strong className="text-foreground">AI-Powered Poll Builder:</strong> Describe your research goal and let our AI draft professional poll questions in seconds, or import existing data from CSV, Excel, SurveyMonkey, Google Sheets, and Typeform.</li>
            <li><strong className="text-foreground">Synthetic Voter Profiles:</strong> Every respondent is automatically transformed into a queryable voter profile that captures their political views, demographics, and reasoning patterns.</li>
            <li><strong className="text-foreground">Campaign Chat:</strong> Ask plain-language questions about your polling data and get instant, evidence-based answers with citations to actual responses.</li>
            <li><strong className="text-foreground">Message Testing:</strong> Test campaign messages, policy framings, and narratives against specific voter segments before spending money on advertising.</li>
            <li><strong className="text-foreground">Voter Segmentation:</strong> Identify swing voters, persuadable segments, base supporters, and cross-pressured voters through AI-driven cohort analysis.</li>
            <li><strong className="text-foreground">Campaign Briefings:</strong> Generate comprehensive reports with demographic breakdowns, issue analysis, and strategic recommendations ready for your team.</li>
            <li><strong className="text-foreground">Unlimited Polls &amp; Responses:</strong> Create as many surveys as you need with no limits during the beta period.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-4 text-foreground">How It Works</h2>
          <div className="space-y-4 text-muted-foreground">
            <div>
              <h3 className="font-semibold text-foreground mb-2">1. Create or Import</h3>
              <p>Use our AI builder to generate polls from your research goals, or import existing polling data from popular platforms and file formats.</p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2">2. Collect Responses</h3>
              <p>Share your poll via link or embed. Each response automatically creates a synthetic voter profile with political demographics, issue positions, and reasoning patterns.</p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2">3. Analyze &amp; Strategize</h3>
              <p>Ask questions about your electorate in plain language. Get instant insights, segment voters, test messages, and generate campaign briefings — all without a data science team.</p>
            </div>
          </div>

          <h2 className="text-xl font-semibold mt-8 mb-4 text-foreground">Who It&apos;s For</h2>
          <p className="text-muted-foreground leading-relaxed">
            Antelope Politico is built for campaign managers, political pollsters, PACs, advocacy organizations, 
            party committees, academic researchers, and anyone working in political strategy. Whether you&apos;re 
            running a local race or a statewide campaign, Antelope scales to your needs.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-4 text-foreground">Getting Started</h2>
          <p className="text-muted-foreground leading-relaxed">
            Ready to transform your polling experience? Start by creating your first poll in the &quot;Surveys&quot; section.
            You can build from scratch using our AI assistant, or import existing polling data. Once you have responses,
            use the &quot;Chat&quot; feature to explore your voter data through conversation and generate campaign intelligence reports.
          </p>

          <h2 className="text-xl font-semibold mt-12 mb-6 text-foreground">Frequently Asked Questions</h2>
          
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-foreground mb-2">What makes Antelope different from other polling tools?</h3>
              <p className="text-muted-foreground">Antelope creates synthetic voter profiles from each response, allowing you to query your data conversationally, test new messages against existing respondents, and get campaign-ready insights without waiting for a new poll cycle.</p>
            </div>

            <div>
              <h3 className="font-semibold text-foreground mb-2">How do synthetic voter profiles work?</h3>
              <p className="text-muted-foreground">Voter profiles are AI representations built from actual survey responses and demographics. They capture political views, issue priorities, and reasoning patterns, allowing you to ask new questions of your existing data at any time.</p>
            </div>

            <div>
              <h3 className="font-semibold text-foreground mb-2">Can I import polls from other platforms?</h3>
              <p className="text-muted-foreground">Yes. Antelope supports imports from CSV, Excel, SurveyMonkey, Google Sheets, and Typeform. Your existing polling data can be easily migrated and transformed into queryable voter profiles.</p>
            </div>

            <div>
              <h3 className="font-semibold text-foreground mb-2">Is voter data secure?</h3>
              <p className="text-muted-foreground">All responses are encrypted and stored securely. Antelope supports configurable anonymity levels (full identity, semi-anonymous, or fully anonymous). Synthetic profiles are AI-generated representations, not raw personal data.</p>
            </div>

            <div>
              <h3 className="font-semibold text-foreground mb-2">How does the campaign chat work?</h3>
              <p className="text-muted-foreground">Ask questions about your polling data in plain language — for example: &quot;What are the top concerns for independent voters?&quot; or &quot;How do suburban women respond to our healthcare message?&quot; The AI analyzes your data and provides evidence-based answers.</p>
            </div>

            <div>
              <h3 className="font-semibold text-foreground mb-2">Can I export insights for presentations?</h3>
              <p className="text-muted-foreground">Yes. You can export charts, summaries, campaign briefings, and raw data in various formats ready for presentations, memos, and strategy meetings.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    </PublicLayout>
  );
}
