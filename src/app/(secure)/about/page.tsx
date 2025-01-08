"use client";

export default function AboutPage() {

  return (
    <>
      {/* Main Content */}
      <div className="flex-1 ml-0 container mt-14 md:mt-0  mx-auto px-4 py-6 md:px-8 md:py-8 min-w-full md:min-w-[800px] max-w-full md:max-w-[800px]">
        <h1 className="text-xl font-bold text-primary">About Antelope</h1>
        <p className="text-default-500">
          Antelope is the worlds first AI driven synthetic prediction market crafted allowing traders to bet on the future by creating strategies run by AI agents.
          Our mission is to provide an intuitive interface for analyzing trends, placing wagers on 
          future outcomes, and refining strategies—all under one roof.
        </p>

        <h2 className="text-xl font-semibold  text-white">Why Antelope?</h2>
        <p className="text-default-500">
          We designed Antelope to cater to both newcomers and experienced bettors, ensuring 
          an accessible yet sophisticated toolkit. You can efficiently manage markets, uncover 
          opportunities, and track performance metrics in real time.
        </p>

        <h2 className="text-xl font-semibold  text-white">Key Features &amp; Benefits</h2>
        <ul className="list-disc list-inside text-default-500 space-y-2">
          <li><strong>Intuitive Market Management:</strong> Create and oversee markets with minimal hassle.</li>
          <li><strong>Advanced Analysis Tools:</strong> Quickly identify trends and make data-driven wagers.</li>
          <li><strong>Refined Betting Strategies:</strong> Develop and adjust strategies to maximize long-term success.</li>
          <li><strong>Real-Time Tracking:</strong> Stay updated on wins, losses, and market fluctuations as they happen.</li>
          <li><strong>Community Interaction:</strong> Engage with a vibrant community, discuss ideas, and learn from peers.</li>
        </ul>

        <h2 className="text-xl font-semibold text-white">Getting Started</h2>
        <p className="text-default-500">
          Begin by visiting your dashboard to view available markets or create your own. If you need 
          inspiration, check out our Community section to see how others are analyzing trends 
          and deploying their strategies.
        </p>
      </div>
    </>
  );
}