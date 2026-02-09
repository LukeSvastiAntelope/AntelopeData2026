'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Legacy prediction detail page — no longer applicable.
 * Redirects back to admin dashboard.
 */
export default function AdminDetailPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/admin')
  }, [router])

  return null
}
