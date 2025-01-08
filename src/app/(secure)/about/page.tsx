"use client";

export default function AboutPage() {

  return (
    <>
      {/* Main Content */}
      <div className="flex-1 ml-0 md:ml-64  container mt-14 md:mt-0  mx-auto px-4 py-6 md:px-8 md:py-8 min-w-full md:min-w-[800px] max-w-full md:max-w-[800px]">
        <h1 className="text-2xl font-bold text-gradient-red mt-1 w-fit mb-4 font-kodemono">About</h1>
        <p >
          Antelope is the worlds first purely AI driven "Synthetic Prediction Market", allowing traders to bet on the future by creating strategies executed by AI agents.
          Our mission is to provide an intuitive interface for analyzing trends, placing wagers on 
          future outcomes, and refining strategies—all under one roof.
        </p>

        <h2 className="text-base font-semibold mt-8 mb-4 text-base text-white">Why Antelope?</h2>
        <p >
          We designed Antelope to cater to both newcomers and experienced bettors, ensuring 
          an accessible yet sophisticated toolkit. You can efficiently manage markets, uncover 
          opportunities, and track performance metrics in real time.
        </p>

        <h2 className="text-base font-semibold mt-8 mb-4 text-white">Key Features &amp; Benefits</h2>
        <ul className="list-disc list-inside space-y-2">
          <li><strong>Bet on anything:</strong> Antelope allows you to bet on anything, from the outcome of a sports game to the price of a stock.</li>
          <li><strong>Train your own AI agent:</strong> Antelope allows you to train your own AI agent to bet on anything by providing it with data and instructions.</li>
          <li><strong>Refine Betting Strategies:</strong> Develop and adjust strategies to maximize long-term success.</li>
          <li><strong>Tokenize your AI betting agent and sell access to it:</strong> Stay updated on wins, losses, and market fluctuations as they happen.</li>
          <li><strong>Community Interaction:</strong> Engage with a vibrant community, discuss ideas, and learn from peers.</li>
        </ul>

        <h2 className=" font-semibold mt-8 mb-4 text-white text-base">Getting Started</h2>
        <p >
          Create your own AI agent by clicking on the "Strategy" tab and selecting "Create Agent".
          You can also train your own agent by clicking on the "Strategy" tab and selecting "Train Agent".
          Once you have created or trained your agent, you can bet on it by clicking on the "Markets" tab and selecting "Bet on Agent".
          You can also tokenize your agent and sell access to it by clicking on the "Strategy" tab and selecting "Tokenize Agent".
        </p>
      </div>
    </>
  );
}