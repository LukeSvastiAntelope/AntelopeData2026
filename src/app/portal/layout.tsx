import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Volunteer · Antelope',
  description: 'Your shifts, tasks, and contacts — mobile-first',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Antelope Volunteer',
  },
  icons: {
    icon: '/walk-icons/icon-192.png',
    apple: '/walk-icons/icon-192.png',
  },
  manifest: '/portal-manifest.webmanifest',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0f766e',
  viewportFit: 'cover',
}

export default function PortalRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <link rel="manifest" href="/portal-manifest.webmanifest" />
      <meta name="mobile-web-app-capable" content="yes" />
      {children}
    </>
  )
}
