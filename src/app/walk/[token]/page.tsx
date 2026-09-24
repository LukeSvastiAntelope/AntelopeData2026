import type { Metadata, Viewport } from 'next'
import { WalkClient } from '@/app/components/ground-game/walk-client'

type Props = { params: Promise<{ token: string }> }

export const metadata: Metadata = {
  title: 'Walk · Antelope',
  description: 'Canvasser walk list — offline-ready',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Antelope Walk',
  },
  icons: {
    icon: '/walk-icons/icon-192.png',
    apple: '/walk-icons/icon-192.png',
  },
  manifest: '/walk-manifest.webmanifest',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0f766e',
  viewportFit: 'cover',
}

export default async function WalkPage({ params }: Props) {
  const { token } = await params
  return (
    <>
      <link rel="manifest" href="/walk-manifest.webmanifest" />
      <meta name="mobile-web-app-capable" content="yes" />
      <WalkClient token={decodeURIComponent(token)} />
    </>
  )
}
