import type { NextAuthConfig } from "next-auth";

// Edge-safe auth configuration shared by middleware and route handlers.
// Do not import any Node.js-only modules or database code from this file.
export const authConfig: NextAuthConfig = {
  trustHost: true,
  debug: process.env.NODE_ENV === 'development',
  // Explicitly provide an empty providers array for middleware safety
  providers: [],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, account, user }) {
      if (account && user) {
        // Minimal fields used by the app's session
        // Note: account.access_token may be undefined for credentials
        // We keep the assignment for parity with existing session usage
        // but avoid referencing any non-edge APIs here.
        (token as any).accessToken = (account as any)?.access_token;
        (token as any).userId = (user as any).id;
        token.email = (user as any).email;
        token.name = (user as any).name;
        // Volunteer V1 — role routing (staff ↔ portal) needs these on the JWT
        if ((user as any).orgRole != null) {
          (token as any).orgRole = (user as any).orgRole;
        }
        if ((user as any).organizationId != null) {
          (token as any).organizationId = (user as any).organizationId;
        }
        if ((user as any).personRecordId != null) {
          (token as any).personRecordId = (user as any).personRecordId;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = (token as any).userId as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        (session.user as any).orgRole = (token as any).orgRole ?? null;
        (session.user as any).organizationId =
          (token as any).organizationId ?? null;
        (session.user as any).personRecordId =
          (token as any).personRecordId ?? null;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/login',
    error: '/auth/login',
  },
};
