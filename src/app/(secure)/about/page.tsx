"use client";

import { SidebarTrigger } from "@/components/ui/sidebar"

export default function AboutPage() {

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        {/* Header */}
        <div className="px-6 py-4">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium text-card-foreground">About</h1>
          </div>
        </div>

        <div className="border-b border-border" />

                <div className="p-6">
         <h1 className="text-2xl font-bold text-foreground mt-1 w-fit mb-4">About Antelope</h1>
        <p className="text-muted-foreground leading-relaxed">
          Antelope is a revolutionary survey platform that transforms your survey responses into a live network of synthetic personas. 
          Our AI-powered platform enables you to chat with your survey data in real-time, getting instant insights without the need 
          to read through long reports or manually analyze spreadsheets.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4 text-foreground">Why Antelope?</h2>
        <p className="text-muted-foreground leading-relaxed">
          Traditional survey tools leave you with static data and lengthy reports. Antelope brings your survey responses to life 
          by creating digital twins of your respondents, allowing you to explore insights through natural conversation. 
          Whether you&apos;re a researcher, marketer, or business owner, Antelope makes survey analysis as simple as asking a question.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4 text-foreground">Key Features &amp; Benefits</h2>
        <ul className="list-disc list-inside space-y-3 text-muted-foreground">
          <li><strong className="text-foreground">AI-Powered Survey Builder:</strong> Describe your research goal and let our AI draft engaging questions in seconds, or import from CSV, Excel, Survey Monkey, Google Sheets, and Typeform.</li>
          <li><strong className="text-foreground">Instant Analytics:</strong> Chat directly with your survey data to get real-time insights. No more waiting for reports or manual analysis.</li>
          <li><strong className="text-foreground">Digital Twins:</strong> Every respondent gets an anonymized digital twin that evolves as they share more, boosting engagement and data richness.</li>
          <li><strong className="text-foreground">Real-time Dashboards:</strong> Monitor responses as they come in with interactive charts and visualizations ready for presentations.</li>
          <li><strong className="text-foreground">Cohort Analysis:</strong> Slice and dice your data by demographics, behaviors, or any custom criteria through natural language queries.</li>
          <li><strong className="text-foreground">Unlimited Surveys &amp; Responses:</strong> Create as many surveys as you need with no limits on responses or participants.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-8 mb-4 text-foreground">How It Works</h2>
        <div className="space-y-4 text-muted-foreground">
          <div>
            <h3 className="font-semibold text-foreground mb-2">1. Create or Import</h3>
            <p>Use our AI builder to generate surveys from your research goals, or import existing surveys from popular platforms.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-2">2. Collect Responses</h3>
            <p>Share your survey via link, QR code, or embed. Each response automatically creates a digital twin for deeper analysis.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-2">3. Chat &amp; Analyze</h3>
            <p>Ask questions about your data in plain English. Get instant insights, charts, and summaries without complex tools.</p>
          </div>
        </div>

        <h2 className="text-xl font-semibold mt-8 mb-4 text-foreground">Getting Started</h2>
        <p className="text-muted-foreground leading-relaxed">
          Ready to transform your survey experience? Start by creating your first survey in the &quot;Surveys&quot; section. 
          You can build from scratch, use our AI assistant, or import existing data. Once you have responses, 
          head to the &quot;Chat&quot; feature to start exploring your data through conversation.
        </p>

        <h2 className="text-xl font-semibold mt-12 mb-6 text-foreground">Frequently Asked Questions</h2>
        
        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-foreground mb-2">What makes Antelope different from other survey tools?</h3>
            <p className="text-muted-foreground">Antelope creates digital twins of your respondents and allows you to chat with your data in real-time. Instead of static reports, you get dynamic insights through natural conversation.</p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">How do digital twins work?</h3>
            <p className="text-muted-foreground">Digital twins are anonymized AI representations of your survey respondents. They capture response patterns, demographics, and preferences, allowing you to query specific segments or personas within your data.</p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">Can I import surveys from other platforms?</h3>
            <p className="text-muted-foreground">Yes! Antelope supports imports from CSV, Excel files, Survey Monkey, Google Sheets, and Typeform. Your existing survey data can be easily migrated to our platform.</p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">Is there a limit on surveys or responses?</h3>
            <p className="text-muted-foreground">No limits! Create unlimited surveys and collect unlimited responses. Antelope is designed to scale with your research needs.</p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">How does the AI chat feature work?</h3>
            <p className="text-muted-foreground">Simply ask questions about your survey data in plain English. For example: &quot;What are the main trends?&quot; or &quot;How do users aged 25-35 respond differently?&quot; The AI analyzes your data and provides instant insights.</p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">Is my survey data secure?</h3>
            <p className="text-muted-foreground">Absolutely. All survey responses are encrypted and stored securely. Digital twins are completely anonymized, ensuring respondent privacy while maintaining analytical value.</p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">Can I export my data and insights?</h3>
            <p className="text-muted-foreground">Yes, you can export charts, summaries, and raw data in various formats. All insights generated through chat are also exportable for presentations and reports.</p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">What types of questions can I create?</h3>
            <p className="text-muted-foreground">Antelope supports text responses, single choice, multiple choice, rating scales, yes/no questions, and more. Our AI can suggest optimal question types based on your research goals.</p>
                     </div>
         </div>
        </div>
      </div>
    </div>
  );
}