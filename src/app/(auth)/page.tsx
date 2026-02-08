'use client';

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

export default function Home() {
  const faqData = [
    {
      question: "What is Antelope Politico?",
      answer: `Antelope Politico is an AI-powered political survey and campaign intelligence platform. It enables campaigns, pollsters, and political organizations to create polls, collect voter responses, and transform each respondent into a queryable synthetic voter profile. Instead of static polling data, you get a living, interactive model of your electorate that you can interrogate with new questions at any time.`
    },
    {
      question: "How does synthetic voter modeling work?",
      answer: `When a voter completes a survey, Antelope creates an AI-powered voter profile based on their responses, demographics, and stated positions. These profiles capture the respondent's political views, issue priorities, and reasoning patterns. You can then query these profiles with new questions—like testing a campaign message or exploring a policy position—without needing to run another expensive poll.`
    },
    {
      question: "What can I do with voter profiles?",
      answer: `Voter profiles unlock powerful capabilities for campaign strategy:

• Message Testing: Test how different voter segments react to campaign messaging before going public.
• Cohort Analysis: Ask natural language questions about voter segments (e.g., "How do suburban independents feel about healthcare reform?").
• Tracking Sentiment: Run longitudinal polls and track how opinions shift over time.
• Report Generation: Generate campaign briefings with demographic breakdowns, issue analysis, and strategic insights.
• Segment Discovery: Identify persuadable voters, cross-pressured segments, and mobilization targets.`
    },
    {
      question: "What types of polls can I create?",
      answer: `Antelope supports a wide range of political survey types:

• Voter Sentiment Polls — approval ratings, direction of country, top issues
• Candidate Comparison — head-to-head matchups and favorability ratings
• Issue Deep Dives — detailed opinions on specific policy areas
• Message Testing — compare how different framings resonate across segments
• Post-Event Reaction — debate, rally, or news event response surveys
• District Pulse Checks — quick local sentiment snapshots

You can also create custom surveys or use our AI to generate polls from a research prompt.`
    },
    {
      question: "Can I import existing polling data?",
      answer: `Yes. Antelope supports imports from CSV, Excel, Google Sheets, SurveyMonkey, and Typeform. Import your historical polling data and Antelope will create voter profiles from existing responses, giving you an instant queryable model of your past research.`
    },
    {
      question: "How does the AI chat feature work?",
      answer: `The Cohort Chat lets you ask questions about your polling data in plain language. For example:

• "What are the top three issues for independent voters in swing districts?"
• "How do women aged 25-44 feel about the candidate's education plan?"
• "Compare sentiment on immigration between rural and suburban respondents."

The AI analyzes your actual survey data and voter profiles to provide evidence-based answers with citations to specific responses.`
    },
    {
      question: "Is voter data secure and private?",
      answer: `Absolutely. All survey responses are encrypted and stored securely. Antelope supports multiple anonymity levels—full identity, semi-anonymous, and fully anonymous—to comply with your research requirements. Voter profiles are synthetic representations, not raw personal data. We take respondent privacy seriously and follow data protection best practices.`
    },
    {
      question: "How do I get started?",
      answer: `Getting started with Antelope Politico is straightforward:

1) Sign Up — Create your account at the registration page.
2) Create or Import a Poll — Use our AI-powered survey builder or import existing data.
3) Distribute — Share your poll via link, QR code, or embed it on your site.
4) Analyze — As responses come in, voter profiles are created automatically. Use Cohort Chat to ask questions and generate campaign intelligence reports.

No technical expertise required. If you can describe what you want to know, Antelope can help you find the answer.`
    },
    {
      question: "Who is Antelope Politico for?",
      answer: `Antelope Politico is built for anyone working in political research and campaign strategy:

• Campaign managers and strategists
• Political pollsters and researchers
• PACs and advocacy organizations
• Party committees and caucuses
• Academic political scientists
• Journalists covering elections

Whether you're running a local school board race or a statewide campaign, Antelope scales to your needs.`
    },
    {
      question: "Is there a cost?",
      answer: `Antelope Politico is currently in beta with unlimited surveys and responses at no charge. We'll introduce premium features (advanced analytics, team collaboration, voter file integrations) in the future, with transparent pricing and advance notice.`
    },
    {
      question: "Still have questions?",
      answer: `Reach out to us at support@getantelope.com, or visit our Community on Telegram to connect with other political researchers and campaign professionals using Antelope.`
    }
  ];

  return (
    <main className="flex flex-col items-center justify-start min-h-screen bg-mainGradient bg-cover bg-center bg-no-repeat m-0 pt-0 px-4 md:px-8 text-white font-sans">

      <div className="announcement text-sm">
        Want to join the Antelope team? Connect with us on <a href="https://t.me/+F5F2ah0bBzU0ZDAx" target="_blank" className="underline telegram-inline-icon">Telegram</a>
      </div>

      {/* Hero Section */}
      <div className="flex flex-col items-center justify-center text-center max-w-screen-md mx-auto mt-12">
        <Image
          src={"/assets/images/logo-website.svg"}
          alt="Antelope Politico"
          width={120}
          height={120}
          className="mb-2"
        />
        <h1 className="textGradient text-2xl md:text-small font-bold mb-2">
          Political Survey &amp; Campaign Intelligence
        </h1>

        <div className="flex flex-row items-center space-x-4 mt-4">
          <Link href="https://x.com/antelopeHQ" target="_blank">
            <Image src="/assets/images/x-logo.svg" alt="Twitter" width={24} height={24} />
          </Link>
          <Link href="https://t.me/+F5F2ah0bBzU0ZDAx" target="_blank">
            <Image src="/assets/images/telegram-logo.svg" alt="Telegram" width={24} height={24} />
          </Link>
        </div>

        <label className="label-primary mt-8 mb-2 font-bold text-tiny">INTRODUCING</label>
        <h2 className="text-white font-light text-md md:text-3xl mb-10 w-[75%] leading-loose">
          Understand your voters before they vote. AI-powered polling that turns every response into actionable campaign intelligence.
        </h2>

        <div className="flex gap-4 mb-12">
          <Link
            href="/register"
            className="px-8 py-3 bg-primary hover:bg-primary/80 text-white rounded-md font-medium"
          >
            Get Started Free
          </Link>
          <Link
            href="/login"
            className="px-8 py-3 border border-white/20 hover:border-white/40 text-white rounded-md font-medium"
          >
            Sign In
          </Link>
        </div>
      </div>

      {/* Key Features */}
      <section className="mt-8 mx-auto max-w-screen-md text-left">
        <div className="grid md:grid-cols-3 grid-cols-1 gap-4 mb-4 text-default-500 px-8 md:px-0">
          <div className="text-center icon-house">
            <h3 className="text-white font-bold text-md mb-2">AI-Powered Polling</h3>
            Create professional polls in seconds. Just describe your research goal and our AI builds the survey.
          </div>
          <div className="text-center icon-train text-default-500">
            <h3 className="text-white font-bold text-md mb-2">Synthetic Voter Profiles</h3>
            Every respondent becomes a queryable AI profile you can ask new questions at any time.
          </div>
          <div className="text-center icon-refine text-default-500">
            <h3 className="text-white font-bold text-md mb-2">Campaign Intelligence</h3>
            Chat with your data, test messages, and generate briefings — all through natural language.
          </div>
        </div>

        <div className="grid md:grid-cols-2 grid-cols-1 gap-4">
          <div className="w-2/3 col-span-1 col-center-2 text-center icon-tokenize flex flex-col items-center justify-center mx-auto text-default-500">
            <h3 className="text-white font-bold text-md mb-2">Voter Segmentation</h3>
            Identify swing voters, persuadables, and base supporters with AI-driven cohort analysis.
          </div>
          <div className="w-2/3 col-span-1 col-center-1 text-center icon-chat flex flex-col items-center justify-center mx-auto text-default-500">
            <h3 className="text-white font-bold text-md mb-2">Import Any Data</h3>
            Bring in existing polls from CSV, Excel, SurveyMonkey, Google Sheets, or Typeform.
          </div>
        </div>
      </section>

      {/* Vision Section */}
      <section className="mt-12 max-w-screen-md mx-auto text-left">

        <h1 className="text-white font-bold text-md mb-2">1. Our Vision</h1>
        <p className="text-default-500 text-md mb-8">We believe campaigns deserve better tools than static crosstabs and two-week-old poll decks. Antelope Politico transforms political research by turning every survey response into a persistent, queryable voter profile. Instead of running a new poll every time you have a question, ask your existing data — and get answers instantly.</p>

        <h1 className="text-white font-bold text-md mb-2">2. Synthetic Voter Intelligence</h1>
        <p className="text-default-500 text-md mb-8">At the heart of our platform are synthetic voter profiles: AI representations built from real survey responses, demographics, and political positions. These profiles can be queried with new questions, tested with different messages, and segmented in ways that traditional polling simply cannot match. It&apos;s like having a perpetual focus group on demand.</p>

        <h1 className="text-white font-bold text-md mb-2">3. From Data to Decisions</h1>
        <p className="text-default-500 text-md mb-8">Campaign decisions are only as good as the intelligence behind them. Antelope&apos;s AI chat interface lets strategists ask plain-language questions about their polling data and get evidence-based answers with citations. No SQL queries, no data science degree required — just ask what you need to know.</p>

        <h1 className="text-white font-bold text-md mb-2">4. Message Testing at Scale</h1>
        <p className="text-default-500 text-md mb-8">Test campaign messages, policy framings, and attack/defense narratives against your synthetic voter segments before spending a dollar on advertising. See how different demographics respond, identify which messages resonate with persuadable voters, and refine your communications strategy with data, not gut instinct.</p>

        <h1 className="text-white font-bold text-md mb-2">5. Privacy by Design</h1>
        <p className="text-default-500 text-md mb-8">Voter privacy is paramount. All responses are encrypted, anonymization levels are configurable, and synthetic profiles are AI-generated representations — not raw personal data. We follow data protection best practices and design every feature with respondent privacy at the center.</p>

        <h1 className="text-white font-bold text-md mb-2">6. Built for Campaign Teams</h1>
        <p className="text-default-500 text-md mb-8">From campaign managers to field directors, pollsters to comms staff — Antelope is designed for the entire team. Create polls, share insights, generate briefings, and collaborate on strategy, all in one platform that speaks the language of political campaigns.</p>

        <h1 className="text-white font-bold text-md mb-2">7. Open and Evolving</h1>
        <p className="text-default-500 text-md mb-8">Antelope Politico is in active development. We&apos;re building features based on real campaign needs — voter file integrations, geographic intelligence, tracking polls, and predictive modeling are all on the roadmap. We welcome feedback and collaboration from political professionals.</p>
      </section>

      {/* FAQ Section */}
      <section className="mt-12 max-w-screen-md mx-auto container pb-12">
        <h1 className="text-2xl font-bold text-white mb-6 text-center">
          Frequently Asked Questions
        </h1>
        <div className="max-w-screen-lg mx-auto space-y-4">
          {faqData.map((faq, idx) => (
            <details
              key={idx}
              className="py-2 cursor-pointer hover:border-white/20 transition-colors"
            >
              <summary className="font-semibold text-md md:text-lg mb-2">
                {faq.question}
              </summary>
              <div className="mt-2 text-default-500 text-base whitespace-pre-wrap">
                {faq.answer}
              </div>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
