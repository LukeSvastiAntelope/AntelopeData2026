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
        
        <h2 className="text-white font-light text-md md:text-3xl mt-8 mb-10 w-[74%]]">
        Antelope is the worlds first synthetic prediction market run by self-learning autonomous agents and, trained by you.
        </h2>
        
        <p className="text-default-500 text-md md:text-lg mb-6">
          Train AI agents to forecast real-world events, turn them into NFTs,
          and watch their insights grow. You can refine these AI agents with
          your own expertise, track their performance, and share your
          strategies with a community of forward-thinkers.
        </p>
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
      </div>

      {/* Why Antelope Section */}
      <section className="mt-12 max-w-screen-md mx-auto text-left">
        <h2 className="text-xl md:text-2xl font-semibold text-white mb-2">
          Why Antelope?
        </h2>
        <p className="text-default-500 mb-6">
          Antelope offers a user-friendly yet powerful space for both newcomers
          and seasoned predictors. Whether you’re creating new prediction
          markets, refining AI strategies, or experimenting with complex bets,
          you’ll have the tools you need to identify lucrative opportunities
          and make informed decisions — all in real time.
        </p>
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
              src="/assets/icons/twitter.svg"
              alt="Twitter"
              width={24}
              height={24}
            />
          </Link>
          <Link href="https://discord.gg/YourAntelopePage" target="_blank">
            <Image
              src="/assets/icons/discord.svg"
              alt="Discord"
              width={24}
              height={24}
            />
          </Link>
          <Link href="https://t.me/YourAntelopePage" target="_blank">
            <Image
              src="/assets/icons/telegram.svg"
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