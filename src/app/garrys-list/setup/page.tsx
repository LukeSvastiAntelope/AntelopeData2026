import { Suspense } from 'react'
import type { Metadata } from 'next'
import { SetupClient } from './SetupClient'

export const metadata: Metadata = {
  title: 'Set up your survey · Antelope',
  description: "Turn a published story into a short, neutral reader survey — no log in required.",
}

export default function GarrysListSetupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      }
    >
      <SetupClient />
    </Suspense>
  )
}
