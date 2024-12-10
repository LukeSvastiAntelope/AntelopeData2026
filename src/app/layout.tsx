import type { Metadata } from "next";
import "./globals.css";
import { Rubik } from 'next/font/google';
import { Toaster } from "react-hot-toast";
import { Providers } from "./components/provider/mainProvider";

export const metadata: Metadata = {
  title: "Market Maker Agent",
  description: "Market Maker Agent",
};

const rubik = Rubik({
  subsets: ['latin'],
  variable: '--font-rubik',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${rubik.className} antialiased dark text-foreground bg-background min-h-screen`}
      >
        <Toaster
          position="top-right"
          reverseOrder={true}
        />
        <Providers>
          <main className="min-h-screen">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
