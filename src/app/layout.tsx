import "./globals.css";
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "./components/provider/mainProvider";
import Script from "next/script";
import { Analytics } from '@vercel/analytics/react';
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
    display: 'swap',
    fallback: ['system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
    title: {
        default: 'Antelope — AI-Powered Polling & Campaign Intelligence',
        template: '%s · Antelope',
    },
    description:
        'Antelope is an AI-powered platform for polling, voter modeling, and campaign intelligence. Understand your voters before they vote.',
    icons: { icon: '/favicon.ico' },
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
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
            <body className={`${inter.className} antialiased bg-background text-foreground transition-colors duration-300`}>
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
