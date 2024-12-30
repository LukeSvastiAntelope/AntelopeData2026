import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center w-screen h-screen bg-mainGradient bg-cover bg-center bg-no-repeat m-0">

      <div className="p-5 flex flex-col items-center justify-center">
        <Image
          src={"/assets/images/logo.svg"}
          alt="Hero Image"
          width={160}
          height={160}

        />
        <h1 className="textGradient text-[1em] m-0 px-0 pt-0 pb-[10px] font-regular">Synthetic Prediction Market</h1>
        <div className="flex flex-col gap-1 w-full">
          <Link href={"/register"} className="bg-content0 text-center text-white p-[10px] rounded-[6px] text-[15px] hover:bg-primary">Register</Link>
          <Link href={"/login"} className="bg-content0 text-center text-white p-[10px] rounded-[6px] text-[15px] hover:bg-primary">Login</Link>
        </div>
      </div>
    </main>
  );
}