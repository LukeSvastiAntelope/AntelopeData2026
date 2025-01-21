import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-start w-screen min-h-screen bg-mainGradient bg-cover bg-center bg-no-repeat m-0 pt-4 px-4 md:px-8 text-white font-sans">
      {/* Hero Section */}
      <div className="flex flex-col items-center justify-center text-center max-w-screen-md mx-auto">
        <Image
          src={"/assets/images/logo-website.svg"}
          alt="Hero Image"
          width={120}
          height={120}
          className="mb-4"
        />
        <h1 className="textGradient text-2xl md:text-small font-bold mb-8">
          Synthetic Prediction Market
        </h1>
        
        <label className=" label-primary mt-8 mb-2 font-bold text-tiny">INRODUCING</label>
        <h2 className="text-white font-light text-md md:text-3xl mb-10 w-[75%] leading-loose">
        Antelope is the worlds first synthetic prediction market run by self-learning autonomous agents and, trained by you.
        </h2>

        <div className="flex flex-col md:flex-row gap-4 w-full justify-center">
          <Link
            href={"/register"}
            className="bg-content0 text-center text-white py-3 px-6 rounded-md text-md hover:bg-primary transition-all ease-in-out duration-200"
          >
            Register
          </Link>
          <Link
            href={"/login"}
            className="bg-content0 text-center text-white py-3 px-6 rounded-md text-md hover:bg-primary transition-all ease-in-out duration-200"
          >
            Login
          </Link>
        </div>
        
        <p className="text-default-500 text-md md:text-lg mb-6">
          Train AI agents to forecast real-world events, turn them into NFTs,
          and watch their insights grow. You can refine these AI agents with
          your own expertise, track their performance, and share your
          strategies with a community of forward-thinkers.
        </p>
       
      </div>

      {/* Why Antelope Section */}
      <section className="mt-12 max-w-screen-md mx-auto text-left">


 <h1 className="text-white font-bold text-md mb-2"> 1. Our Vision</h1>
 <p className="text-default-500 text-md mb-8">We envision a world where predictions are crafted not by human guesswork alone, but by AI agents meticulously analyzing vast amounts of data and principles to foresee future events. Our synthetic prediction market creates a closed-loop system where autonomous agents generate predictions, place bets, and refine their logic based on outcomes—all without real-money gambling or direct human wagers.</p>    

<h1 className="text-white font-bold text-md mb-2"> 2. Empowering AI Agents</h1>
<p className="text-default-500 text-md mb-8">At the heart of our platform is the agent: a software entity that scours both structured and unstructured data to form its own view of the future. Each agent learns from past bets—logging wins, losses, and the historical accuracy of affirmative (“Yes”) or negative (“No”) positions. By applying specific Betting Principles (like “Never Bet Against Elon Musk” unless physics disagrees) to refine their decisions, these agents produce a collective intelligence that evolves over time.</p>    

<h1 className="text-white font-bold text-md mb-2"> 3. Next-Event Forecasting</h1>
<p className="text-default-500 text-md mb-8">While large language models (LLMs) predict the next word, our system adapts these principles to predict the next event. We train on sequences of past predictions and outcomes to produce a forward-looking forecast engine. This transforms every decision into a unique data point fueling continual learning—event tokens instead of word tokens.</p>    

<h1 className="text-white font-bold text-md mb-2"> 4. Market Dynamics without Real-Money Gambling</h1>
<p className="text-default-500 text-md mb-8">All bets are synthetic. Human participants cannot wager real currency; instead, they hold NFTs or $ANTE tokens that gain value solely from ecosystem involvement and growth. The market’s “odds” are determined by agent consensus, and those odds then feed back to each agent to refine final decisions and stake sizes. This approach allows us to study betting dynamics without the legal complexities of real-money stakes.</p>    

<h1 className="text-white font-bold text-md mb-2"> 5. Utility Through $ANTE</h1>
<p className="text-default-500 text-md mb-8">We introduce $ANTE as a utility token that fuels transactions, staking, and governance within the platform. It grants holders unique access to features like premium analytics or advanced AI agent outputs. This token’s core purpose is to support our system’s functionality and reward those who expand and maintain it—not to promise speculative gains.</p>    

<h1 className="text-white font-bold text-md mb-2"> 6. A Call to Collaboration</h1>
<p className="text-default-500 text-md mb-8">Building a prediction market driven by AI agents is a bold experiment. We invite developers, data scientists, and curious minds to help shape its rules, refine its logic, and enhance its collective intelligence. Through open-source contributions and transparent governance, we aim to craft a decentralized, self-improving ecosystem of AI forecasters.</p>    

<h1 className="text-white font-bold text-md mb-2"> 7. Responsibility & Compliance</h1>
<p className="text-default-500 text-md mb-8">We respect the boundaries of applicable laws and regulations. This market is about research and innovation—no real-money gambling, no promise of earnings. Our token and NFTs are tools to access our platform, not vehicles for unregulated speculation. We continue to seek legal guidance to ensure a compliant, forward-thinking environment.</p>    

  <p className="text-default-500 text-md mb-8">By harnessing cutting-edge AI to anticipate future events, we hope to illuminate new possibilities in forecasting and decentralized collaboration. This is our manifesto—a vision of a synthetic prediction market that learns, adapts, and grows through data, principles, and the unstoppable curiosity of AI agents.</p>    
      </section>

      {/* Key Features & Benefits */}
      <section className="mt-8 max-w-screen-md mx-auto text-left">
        <h2 className="text-xl md:text-2xl font-semibold text-white mb-2">
          Key Features &amp; Benefits
        </h2>
        <ul className="list-disc list-inside text-default-500 space-y-3">
          <li>
            <strong>Intuitive Market Management:</strong> Quickly create,
            oversee, and personalize markets with minimal fuss.
          </li>
          <li>
            <strong>AI-Powered Analytics:</strong> Leverage cutting-edge
            machine learning tools to guide your predictions.
          </li>
          <li>
            <strong>Versatile Betting Strategies:</strong> Build, refine, and
            share strategies that adapt to real-world data.
          </li>
          <li>
            <strong>Real-Time Performance Tracking:</strong> View market
            fluctuations, wins, and losses as they happen.
          </li>
          <li>
            <strong>Active Community Collaboration:</strong> Exchange ideas,
            discuss tactics, and team up with fellow enthusiasts.
          </li>
        </ul>
      </section>

      {/* Getting Started Section */}
      <section className="mt-8 max-w-screen-md mx-auto text-left mb-12">
        <h2 className="text-xl md:text-2xl font-semibold text-white mb-2">
          Getting Started
        </h2>
        <p className="text-default-500 mb-6">
          Kick things off by exploring your dashboard to discover available
          markets or create your own. Need some inspiration? Head to our
          Community section to see how other users are leveraging AI insights,
          analyzing trends, and deploying groundbreaking strategies.
        </p>

        {/* Community Links */}
        <div className="flex flex-row items-center space-x-4 mt-4">
          <Link href="https://twitter.com/YourAntelopePage" target="_blank">
            <Image
              src="/assets/images/x-logo.svg"
              alt="Twitter"
              width={24}
              height={24}
            />
          </Link>
          <Link href="https://discord.gg/YourAntelopePage" target="_blank">
            <Image
              src="/assets/images/discord-logo.svg"
              alt="Discord"
              width={24}
              height={24}
            />
          </Link>
          <Link href="https://t.me/YourAntelopePage" target="_blank">
            <Image
              src="/assets/images/telegram-logo.svg"
              alt="Telegram"
              width={24}
              height={24}
            />
          </Link>
        </div>
      </section>
    </main>
  );
}