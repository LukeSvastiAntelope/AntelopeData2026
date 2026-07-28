import { Suspense } from 'react'
import type { Metadata } from 'next'
import { ClaimClient } from './ClaimClient'

export const metadata: Metadata = {
  title: 'Claim your survey · Antelope',
  description: 'Log in to edit your Garry\'s List survey.',
}

export default function GarrysListClaimPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      }
    >
      <ClaimClient />
    </Suspense>
  )
}
