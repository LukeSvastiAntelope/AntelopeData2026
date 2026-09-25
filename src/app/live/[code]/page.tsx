import type { Metadata, Viewport } from 'next'
import { LiveParticipantClient } from '@/app/components/live/live-participant-client'

type Props = { params: Promise<{ code: string }> }

export const metadata: Metadata = {
  title: 'Live · Antelope',
  description: 'Join a live Antelope session from your phone',
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Antelope Live',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#134e4a',
  viewportFit: 'cover',
}

export default async function LiveJoinPage({ params }: Props) {
  const { code } = await params
  return <LiveParticipantClient code={decodeURIComponent(code)} />
}
