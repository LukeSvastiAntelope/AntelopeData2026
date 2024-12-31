import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-start w-screen min-h-screen bg-mainGradient bg-cover bg-center bg-no-repeat m-0 pt-10 px-4 md:px-8 text-white font-sans">
      {/* Hero Section */}
      <div className="flex flex-col items-center justify-center text-center max-w-screen-md mx-auto">
        <Image
          src={"/assets/images/logo.svg"}
          alt="Hero Image"
          width={160}
          height={160}
          className="mb-4"
        />
        <h1 className="textGradient text-2xl md:text-4xl font-bold mb-2">
          Synthetic Prediction Market
        </h1>
        <p className="text-default-500 text-md md:text-lg mb-6">
          An AI-driven platform empowering you to predict the future and trade confidently with data-driven insights.
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
          We designed Antelope to cater to both newcomers and experienced bettors, ensuring 
          an accessible yet sophisticated toolkit. You can efficiently manage markets, 
          uncover opportunities, and track performance metrics in real time.
        </p>
      </section>

      {/* Key Features & Benefits */}
      <section className="mt-8 max-w-screen-md mx-auto text-left">
        <h2 className="text-xl md:text-2xl font-semibold text-white mb-2">
          Key Features &amp; Benefits
        </h2>
        <ul className="list-disc list-inside text-default-500 space-y-3">
          <li>
            <strong>Intuitive Market Management:</strong> Create and oversee markets with minimal hassle.
          </li>
          <li>
            <strong>Advanced Analysis Tools:</strong> Quickly identify trends and make data-driven wagers.
          </li>
          <li>
            <strong>Refined Betting Strategies:</strong> Develop and adjust strategies to maximize success.
          </li>
          <li>
            <strong>Real-Time Tracking:</strong> Stay updated on wins, losses, and market fluctuations as they happen.
          </li>
          <li>
            <strong>Community Interaction:</strong> Engage with a vibrant community, share ideas, and learn from peers.
          </li>
        </ul>
      </section>

      {/* Getting Started Section */}
      <section className="mt-8 max-w-screen-md mx-auto text-left mb-12">
        <h2 className="text-xl md:text-2xl font-semibold text-white mb-2">
          Getting Started
        </h2>
        <p className="text-default-500">
          Begin by visiting your dashboard to view available markets or create your own. 
          If you need inspiration, check out our Community section to see how others 
          are analyzing trends and deploying their strategies.
        </p>
      </section>
    </main>
  );
}