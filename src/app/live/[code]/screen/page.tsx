import type { Metadata, Viewport } from 'next'
import { LiveScreenClient } from '@/app/components/live/live-screen-client'

type Props = {
  params: Promise<{ code: string }>
  searchParams: Promise<{ ht?: string }>
}

export const metadata: Metadata = {
  title: 'Live Screen · Antelope',
  description: 'Presenter on-screen view for an Antelope Live session',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0c0a09',
}

export default async function LiveScreenPage({ params, searchParams }: Props) {
  const { code } = await params
  const sp = await searchParams
  return (
    <LiveScreenClient
      code={decodeURIComponent(code)}
      initialHostToken={sp.ht || null}
    />
  )
}
