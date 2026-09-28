import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isSuperAdminEmail } from '@/app/utils/auth/super-admin'

/**
 * Server-enforced admin gate. UI-only checks are insufficient —
 * email must match SUPERADMIN_EMAILS / lukesvasti@antelope.org.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    redirect('/')
  }
  return <>{children}</>
}
