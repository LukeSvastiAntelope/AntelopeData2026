import type { Metadata } from "next";
import "./globals.css";
import { Rubik } from 'next/font/google';
import { Kode_Mono } from 'next/font/google';
import { Toaster } from "react-hot-toast";
import { Providers } from "./components/provider/mainProvider";
import { SolProvider } from "./components/provider/solProvider";

export const metadata: Metadata = {
  title: "Antelope",
  description: "Synthetic Prediction Market",
};

const rubik = Rubik({
  subsets: ['latin'],
  variable: '--font-rubik',
});

const kodemono = Kode_Mono({
  subsets: ['latin'],
  variable: '--font-kodemono',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ backgroundColor: '#16181c' }}>
      <body
        className={`${rubik.className} antialiased dark text-foreground bg-background min-h-screen`}
      >
        <Toaster
          position="top-right"
          reverseOrder={true}
        />
        <Providers>
          <SolProvider>
            <main className="min-h-screen bg-mainGradient">
              {children}
            </main>
          </SolProvider>
        </Providers>
      </body>
    </html>
  );
}
