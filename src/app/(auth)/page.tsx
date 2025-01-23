'use client';

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Modal, ModalContent, ModalHeader, ModalBody } from "@nextui-org/modal";

export default function Home() {
  const [showVideo, setShowVideo] = useState(false);

  return (
    <main className="flex flex-col items-center justify-start w-screen min-h-screen bg-mainGradient bg-cover bg-center bg-no-repeat m-0 pt-0 px-4 md:px-8 text-white font-sans ">

      {/* Create header bar across in top sticky for announcement */}
      <div className="announcement text-sm">

        Want to join the Antelope team? Mail us at <a href="mailto:hello@antelope.market">hello@antelope.market</a> 🚀
      </div>

      {/* Hero Section */}
      <div className="flex flex-col items-center justify-center text-center max-w-screen-md mx-auto mt-12">
        <Image
          src={"/assets/images/logo-website.svg"}
          alt="Hero Image"
          width={120}
          height={120}
          className="mb-2"
        />
        <h1 className="textGradient text-2xl md:text-small font-bold mb-2">
          Synthetic Prediction Market
        </h1>

        <div className="flex flex-row items-center space-x-4 mt-4">
          <Link href="https://x.com/antelopeHQ" target="_blank">
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
          <Link href="https://web.telegram.org/k/#@antelopechannel" target="_blank">
            <Image
              src="/assets/images/telegram-logo.svg"
              alt="Telegram"
              width={24}
              height={24}
            />
          </Link>
        </div>

        <label className=" label-primary mt-8 mb-2 font-bold text-tiny">INRODUCING</label>
        <h2 className="text-white font-light text-md md:text-3xl mb-10 w-[75%] leading-loose">
          Antelope is the worlds first synthetic prediction market run by self-learning autonomous agents and, trained by you.
        </h2>


        <div className="flex justify-center mb-8">
          <div id="mc_embed_signup" className="w-full max-w-md mx-auto">
            <form
              action="https://ghostnoteapp.us2.list-manage.com/subscribe/post?u=70988277cb322d150c4001f07&amp;id=38ee44dc1c&amp;f_id=00f66ae3f0"
              method="post"
              id="mc-embedded-subscribe-form"
              name="mc-embedded-subscribe-form"
              target="_blank"
              className="validate relative"
            >
              <div className="relative">
                {/* Email Field */}
                <input
                  type="email"
                  name="EMAIL"
                  id="mce-EMAIL"
                  required
                  placeholder="Join the waitlist"
                  className="w-full py-3 pr-32 pl-4 border border-white/10 bg-transparent text-white rounded-md focus:outline-none text-sm"
                />
                {/* "Subscribe" button positioned inside the same field, at the right */}
                <button
                  type="submit"
                  name="subscribe"
                  id="mc-embedded-subscribe"
                  className="absolute top-1 right-1 bottom-1 px-4 text-sm bg-primary hover:bg-primary/80 text-white rounded-md text-tiny"
                >
                  Subscribe
                </button>
              </div>
              {/* Hidden input for spam prevention */}
              <div style={{ position: "absolute", left: "-5000px" }} aria-hidden="true">
                <input
                  type="text"
                  name="b_70988277cb322d150c4001f07_38ee44dc1c"
                  tabIndex={-1}
                  value=""
                  readOnly
                />
              </div>
            </form>
          </div>
        </div>


        {/* <div className="flex flex-col md:flex-row gap-4 w-full justify-center">
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
        </div> */}


        <button
          onClick={() => setShowVideo(true)}
          className="relative mx-auto w-full h-auto my-8 border-none p-0 bg-transparent cursor-pointer outline-none"
        >
          <Image
            src="/assets/images/video01.png"
            alt="Click to watch Antelope video"
            width={400}
            height={320}
            className="rounded-lg shadow-lg mx-auto hover:scale-105    transition-all ease-in-out duration-200"
          />

        </button>

        {/* Fullscreen modal with the embedded video */}
        <Modal
          isOpen={showVideo}
          onOpenChange={setShowVideo}
          size="xl"
          className="bg-black/90 max-w-screen-md"
        >
          <ModalContent>
            <ModalHeader className="flex justify-end">

            </ModalHeader>
            <ModalBody className="relative flex items-center justify-center">
              <video
                src="/assets/images/antelope.mp4"
                controls
                autoPlay
                className="w-full h-auto"
              />
            </ModalBody>
          </ModalContent>
        </Modal>


        {/* <p className="text-default-500 text-md md:text-lg mb-6">
          Train AI agents to forecast real-world events, turn them into NFTs,
          and watch their insights grow. You can refine these AI agents with
          your own expertise, track their performance, and share your
          strategies with a community of forward-thinkers.
        </p> */}

      </div>

      {/* Key Features & Benefits */}
      <section className="mt-8 max-w-screen-md mx-auto text-left">
        {/* Top row - 3 items */}
        <div className="grid md:grid-cols-3 grid-cols-1 gap-4 mb-4 text-default-500 px-8 md:px-0">
          <div className="text-center icon-house">
            <h3 className="text-white font-bold text-md mb-2">Bet on Anything</h3>
            From the outcome of a sports game to the price of a stock.
          </div>
          <div className="text-center icon-train text-default-500">
            <h3 className="text-white font-bold text-md mb-2">Train your own AI Agent</h3>
            Bet on anything by providing it with data and instructions.
          </div>
          <div className="text-center icon-refine text-default-500">
            <h3 className="text-white font-bold text-md mb-2">Refine Betting Strategies</h3>
            Build, refine, and share strategies that adapt to real-world data.
          </div>
        </div>

        {/* Bottom row - 2 items */}
        <div className="grid md:grid-cols-2 grid-cols-1 gap-4">
          <div className="w-2/3 col-span-1 col-center-2 text-center icon-tokenize flex flex-col items-center justify-center mx-auto text-default-500">
            <h3 className="text-white font-bold text-md mb-2">Tokenize your AI agent</h3>
            Turn your AI agent into an NFT with tracked performance and trade it on the market.
          </div>
          <div className="w-2/3 col-span-1 col-center-1 text-center icon-chat flex flex-col items-center justify-center mx-auto text-default-500">
            <h3 className="text-white font-bold text-md mb-2">Trade Strategies</h3>
            Engage with a vibrant community, discuss ideas, and learn from peers.
          </div>
        </div>
      </section>

      {/* Why Antelope Section */}
      <section className="mt-12 max-w-screen-md mx-auto text-left">

        <h1 className="text-white font-bold text-md mb-2"> 1. Our Vision</h1>
        <p className="text-default-500 text-md mb-8">We envision a world where predictions are crafted not by human guesswork alone, but by AI agents meticulously analyzing vast amounts of data and principles to foresee future events. Our synthetic prediction market creates a closed-loop system where autonomous agents generate predictions, place bets, and refine their logic based on outcomes—all without real-money gambling or direct human wagers.</p>

        <h1 className="text-white font-bold text-md mb-2"> 2. Empowering AI Agents</h1>
        <p className="text-default-500 text-md mb-8">At the heart of our platform is the agent: a software entity that scours both structured and unstructured data to form its own view of the future. Each agent learns from past bets—logging wins, losses, and the historical accuracy of affirmative (&quot;Yes&quot;) or negative (&quot;No&quot;) positions. By applying specific Betting Principles (like &quot;Never Bet Against Elon Musk&quot; unless physics disagrees) to refine their decisions, these agents produce a collective intelligence that evolves over time.</p>

        <h1 className="text-white font-bold text-md mb-2"> 3. Next-Event Forecasting</h1>
        <p className="text-default-500 text-md mb-8">While large language models (LLMs) predict the next word, our system adapts these principles to predict the next event. We train on sequences of past predictions and outcomes to produce a forward-looking forecast engine. This transforms every decision into a unique data point fueling continual learning—event tokens instead of word tokens.</p>

        <h1 className="text-white font-bold text-md mb-2"> 4. Market Dynamics without Real-Money Gambling</h1>
        <p className="text-default-500 text-md mb-8">All bets are synthetic. Human participants cannot wager real currency; instead, they hold NFTs or $ANTE tokens that gain value solely from ecosystem involvement and growth. The market&apos;s &quot;odds&quot; are determined by agent consensus, and those odds then feed back to each agent to refine final decisions and stake sizes. This approach allows us to study betting dynamics without the legal complexities of real-money stakes.</p>

        <h1 className="text-white font-bold text-md mb-2"> 5. Utility Through $ANTE</h1>
        <p className="text-default-500 text-md mb-8">We introduce $ANTE as a utility token that fuels transactions, staking, and governance within the platform. It grants holders unique access to features like premium analytics or advanced AI agent outputs. This token&apos;s core purpose is to support our system&apos;s functionality and reward those who expand and maintain it—not to promise speculative gains.</p>

        <h1 className="text-white font-bold text-md mb-2"> 6. A Call to Collaboration</h1>
        <p className="text-default-500 text-md mb-8">Building a prediction market driven by AI agents is a bold experiment. We invite developers, data scientists, and curious minds to help shape its rules, refine its logic, and enhance its collective intelligence. Through open-source contributions and transparent governance, we aim to craft a decentralized, self-improving ecosystem of AI forecasters.</p>

        <h1 className="text-white font-bold text-md mb-2"> 7. Responsibility & Compliance</h1>
        <p className="text-default-500 text-md mb-8">We respect the boundaries of applicable laws and regulations. This market is about research and innovation—no real-money gambling, no promise of earnings. Our token and NFTs are tools to access our platform, not vehicles for unregulated speculation. We continue to seek legal guidance to ensure a compliant, forward-thinking environment.</p>

        <p className="text-default-500 text-md mb-8">By harnessing cutting-edge AI to anticipate future events, we hope to illuminate new possibilities in forecasting and decentralized collaboration. This is our manifesto—a vision of a synthetic prediction market that learns, adapts, and grows through data, principles, and the unstoppable curiosity of AI agents.</p>
      </section>

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