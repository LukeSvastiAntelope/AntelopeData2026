import { Suspense } from 'react'
import type { Metadata } from 'next'
import { ResultsClient } from './ResultsClient'

export const metadata: Metadata = {
  title: 'Survey results · Antelope',
  description: 'Token-gated reader survey results dashboard.',
}

export default function GarrysListResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      }
    >
      <ResultsClient />
    </Suspense>
  )
}
