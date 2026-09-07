import NextAuth from "next-auth";
import { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { UserRepo } from "@/app/utils/database/user-repo";
import { validateEmail } from "@/app/utils/validation";
import bcrypt from "bcryptjs";
import { openSql } from "@/app/utils/database/db";

const isDev = process.env.NODE_ENV !== "production";
const logDebug = (...args: unknown[]) => {
  if (isDev) {
    console.log(...args);
  }
};

// This file runs in a Node.js runtime (API route). It can safely import mysql2 and bcryptjs.
// Omit `secret` when unset so setEnvDefaults can fill from AUTH_SECRET / NEXTAUTH_SECRET.
const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;

function credentialsSignIn(code: string) {
  const e = new CredentialsSignin();
  e.code = code;
  return e;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  ...(authSecret ? { secret: authSecret } : {}),
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
          let user;
          try {
            user = await UserRepo.getUserByEmail(email);
          } catch (dbError) {
            console.error("Auth DB error:", dbError);
            const e = dbError as NodeJS.ErrnoException & { sqlState?: string };
            if (e.code === "ECONNREFUSED") {
              throw credentialsSignIn("DbConnectionRefused");
            }
            throw credentialsSignIn("DatabaseError");
          }
          if (!user) {
            logDebug('No user found with email:', email);
            return null;
          }

          const storedPassword = user.password ? String(user.password) : '';
          logDebug('User found:', { id: user.id, email: user.email, hasPassword: !!storedPassword });

          // Password validation:
          // - Most accounts store bcrypt hashes
          // - Some legacy accounts may have plaintext passwords (or empty password)
          let isPasswordValid = false;
          const looksBcrypt = storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$');
          if (storedPassword && looksBcrypt) {
            isPasswordValid = bcrypt.compareSync(password, storedPassword);
          } else if (storedPassword) {
            // Legacy plaintext (best-effort): accept if exact match, then upgrade to bcrypt hash
            isPasswordValid = password === storedPassword;
            if (isPasswordValid) {
              try {
                const db = await openSql();
                const upgraded = bcrypt.hashSync(password, 10);
                await db.execute('UPDATE users SET password = ? WHERE id = ?', [upgraded, user.id]);
                logDebug('Upgraded plaintext password to bcrypt hash for user:', user.id);
              } catch (e) {
                console.warn('Failed to upgrade legacy password hash:', e);
              }
            }
          }
          logDebug('Password validation result:', isPasswordValid);

          if (!isPasswordValid) {
            logDebug('Invalid password for user:', email);
            return null;
          }

          // Treat NULL as verified (older rows may not have set the flag explicitly)
          if (user.is_verified === 0) {
            logDebug('User not verified:', email);
            throw credentialsSignIn("EmailNotVerified");
          }

          return {
            id: user.id.toString(),
            email: user.email,
            name: user.display_name,
            image: null
          } as any;
        } catch (error) {
          if (error instanceof CredentialsSignin) {
            throw error;
          }
          console.error("Auth error:", error);
          throw credentialsSignIn("DatabaseError");
        }
      }
    })
  ],
});

