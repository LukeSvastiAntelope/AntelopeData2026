import { Suspense } from 'react'
import type { Metadata } from 'next'
import { OptInClient } from './OptInClient'

export const metadata: Metadata = {
  title: 'Join the conversation · Antelope',
  description: 'Take a short survey and optionally sign up for text updates.',
}

export default function OptInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      }
    >
      <OptInClient />
    </Suspense>
  )
}
