'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAgent } from '@/app/context/AgentContext'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user } = useAgent()
  const router = useRouter()

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      router.push('/')
    }
  }, [user, router])

  if (!user || user.role !== 'admin') {
    return null
  }

  return <>{children}</>
}
