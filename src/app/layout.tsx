import type { Metadata } from "next";
import "./globals.css";
import { Rubik } from 'next/font/google';
import { Toaster } from "react-hot-toast";
import { Providers } from "./components/provider/mainProvider";
import { SolProvider } from "./components/provider/solProvider";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Antelope",
  description: "Synthetic Prediction Market",
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
    <html lang="en" style={{ backgroundColor: '#16181c' }}>
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-RE8DXNRE5W"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){ dataLayer.push(arguments); }
            gtag('js', new Date());
            gtag('config', 'G-RE8DXNRE5W');
          `}
        </Script>
      </head>
      <body
        className={`${rubik.className} antialiased dark text-foreground bg-mainGradient `}
      >
        <Toaster
          position="top-right"
          reverseOrder={true}
        />
        <Providers>
          <SolProvider>
            <main className="min-h-screen">
              {children}
            </main>
          </SolProvider>
        </Providers>
      </body>
    </html>
  );
}
