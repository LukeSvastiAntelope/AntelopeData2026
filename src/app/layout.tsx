'use client';

import "./globals.css";
import { Noto_Sans } from 'next/font/google';
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "./components/provider/mainProvider";
import Script from "next/script";
import { Analytics } from '@vercel/analytics/react';
import { ThemeProvider } from "@/components/theme-provider";
import Head from 'next/head';

const notoSans = Noto_Sans({
    subsets: ['latin'],
    variable: '--font-noto-sans',
    display: 'swap',
    fallback: ['system-ui', 'arial'],
    preload: false, // Skip preloading to avoid build-time fetch
});

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <link rel="icon" href="/favicon.ico" />
                <Script
                    src="https://www.googletagmanager.com/gtag/js?id=G-RE8DXNRE5W"
                    strategy="afterInteractive"
                />
                <Script id="google-analytics" strategy="afterInteractive">
                    {`
                        window.dataLayer = window.dataLayer || [];
                        function gtag(){dataLayer.push(arguments);}
                        gtag('js', new Date());
                        gtag('config', 'G-RE8DXNRE5W');
                    `}
                </Script>
            </head>
            <body className={`${notoSans.className} antialiased bg-background text-foreground transition-colors duration-300`}>
                <ThemeProvider>
                    <Toaster />
                    <Providers>
                        <main className="min-h-screen">
                            {children}
                        </main>
                        <Analytics />
                    </Providers>
                </ThemeProvider>
            </body>
        </html>
    );
}
