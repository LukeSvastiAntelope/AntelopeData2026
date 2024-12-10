import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center w-screen h-screen bg-mainImage bg-cover bg-center bg-no-repeat m-0">
      <div className="bg-[#00000080] p-5 rounded-xl flex flex-col items-center justify-center">
        <h1 className="text-white text-[2em] m-0 px-0 pt-0 pb-[10px] font-bold">MarketMaker</h1>
        <div className="flex gap-1">
          <Link href={"/register"} className="bg-secondary text-white p-[10px] rounded-[6px] text-[15px]">Register</Link>
          <Link href={"/login"} className="bg-secondary text-white p-[10px] rounded-[6px] text-[15px]">Login</Link>
        </div>
      </div>
    </main>
  );
}