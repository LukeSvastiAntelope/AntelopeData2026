import NextAuth, { Session } from "next-auth"
import Discord from "next-auth/providers/discord"
import { JWT } from 'next-auth/jwt';
import { Account } from "next-auth";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Discord],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, account, user }: { token: JWT, account?: Account | null, user?: any }) {
      if (account) {
          token.accessToken = account.access_token
          token.name = account.providerAccountId.toString();
          token.email = account.name as string;
      }
      return token
    },
    async session({ session, token, }: { session: Session, token: JWT }) {
      if (session.user) {
        session.user.name = token.name as string;
        session.user.email = token.email as string;
      }
      return session;
    },
  },
})