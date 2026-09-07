import { handlers } from "@/auth" // Referring to the auth.ts we just created

// NextAuth credentials provider depends on Node-only modules (e.g. mysql2/bcrypt).
// Force Node runtime and dynamic execution to avoid static worker chunk issues.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const { GET, POST } = handlers