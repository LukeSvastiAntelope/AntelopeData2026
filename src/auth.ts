import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { UserRepo } from "@/app/utils/database/user-repo";
import { validateEmail } from "@/app/utils/validation";
import bcrypt from "bcryptjs";

const isDev = process.env.NODE_ENV !== "production";
const logDebug = (...args: unknown[]) => {
  if (isDev) {
    console.log(...args);
  }
};

// This file runs in a Node.js runtime (API route). It can safely import mysql2 and bcryptjs.
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        logDebug('Authorize called with credentials:', { email: credentials?.email, hasPassword: !!credentials?.password });

        if (!credentials?.email || !credentials?.password) {
          logDebug('Missing credentials');
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        const emailError = validateEmail(email);
        if (emailError) {
          logDebug('Email validation error:', emailError);
          return null;
        }

        try {
          logDebug('Getting user by email:', email);
          const user = await UserRepo.getUserByEmail(email);
          if (!user) {
            logDebug('No user found with email:', email);
            return null;
          }

          logDebug('User found:', { id: user.id, email: user.email, hasPassword: !!user.password });

          const isPasswordValid = bcrypt.compareSync(password, user.password);
          logDebug('Password validation result:', isPasswordValid);

          if (!isPasswordValid) {
            logDebug('Invalid password for user:', email);
            return null;
          }

          if (user.is_verified === 0) {
            logDebug('User not verified:', email);
            return null;
          }

          return {
            id: user.id.toString(),
            email: user.email,
            name: user.display_name,
            image: null
          } as any;
        } catch (error) {
          console.error("Auth error:", error);
          return null;
        }
      }
    })
  ],
});

