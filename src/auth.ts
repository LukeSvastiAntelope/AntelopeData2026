import NextAuth, { Session } from "next-auth"
import Credentials from "next-auth/providers/credentials"
// import Google from "next-auth/providers/google"
import { JWT } from 'next-auth/jwt';
import { Account } from "next-auth";
import { UserRepo } from "@/app/utils/database/user-repo";
import { validateEmail, validatePassword } from "@/app/utils/validation";
import bcrypt from "bcryptjs";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  debug: process.env.NODE_ENV === 'development',
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        console.log('Authorize called with credentials:', { email: credentials?.email, hasPassword: !!credentials?.password });
        
        if (!credentials?.email || !credentials?.password) {
          console.log('Missing credentials');
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        // Validate input
        const emailError = validateEmail(email);
        if (emailError) {
          console.log('Email validation error:', emailError);
          return null;
        }

        const passwordError = validatePassword(password);
        if (passwordError) {
          console.log('Password validation error:', passwordError);
          return null;
        }

        try {
          console.log('Getting user by email:', email);
          // Get user by email
          const user = await UserRepo.getUserByEmail(email);
          if (!user) {
            console.log('No user found with email:', email);
            return null;
          }

          console.log('User found:', { id: user.id, email: user.email, hasPassword: !!user.password });

          // Verify password
          const isPasswordValid = bcrypt.compareSync(password, user.password);
          console.log('Password validation result:', isPasswordValid);
          
          if (!isPasswordValid) {
            console.log('Invalid password for user:', email);
            return null;
          }

          // Check if user is verified
          if (user.is_verified === 0) {
            console.log('User not verified:', email);
            return null;
          }

          // Return user object for NextAuth
          const userResult = {
            id: user.id.toString(),
            email: user.email,
            name: user.display_name,
            image: null
          };
          
          console.log('Returning user result:', userResult);
          return userResult;
        } catch (error) {
          console.error("Auth error:", error);
          return null;
        }
      }
    }),
    // TODO: Implement Google OAuth properly with correct credentials
    // Google({
    //   clientId: process.env.GOOGLE_CLIENT_ID,
    //   clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    // })
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, account, user }: { token: JWT, account?: Account | null, user?: any }) {
      // Initial sign in
      if (account && user) {
        token.accessToken = account.access_token;
        token.userId = user.id;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }: { session: Session, token: JWT }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
      }
      return session;
    },
    async signIn({ user, account, profile }) {
      // TODO: Implement Google OAuth sign in logic when Google provider is enabled
      // Handle Google OAuth sign in
      // if (account?.provider === "google" && profile?.email) {
      //   try {
      //     // Check if user exists
      //     const existingUser = await UserRepo.getUserByEmail(profile.email);
      //     
      //     if (!existingUser) {
      //       // Create new user from Google OAuth
      //       const displayName = profile.name || profile.email.split('@')[0];
      //       await UserRepo.registerPassword({
      //         email: profile.email,
      //         password: bcrypt.hashSync(Math.random().toString(36), 10), // Random password for OAuth users
      //         displayName: displayName
      //       });
      //       
      //       // Get the newly created user
      //       const newUser = await UserRepo.getUserByEmail(profile.email);
      //       if (newUser) {
      //         user.id = newUser.id.toString();
      //         user.name = newUser.display_name;
      //         (user as any).isFirstLogin = newUser.is_first_login === 1;
      //       }
      //     } else {
      //       // User exists, update their info
      //       user.id = existingUser.id.toString();
      //       user.name = existingUser.display_name;
      //       (user as any).isFirstLogin = existingUser.is_first_login === 1;
      //     }
      //   } catch (error) {
      //     console.error("Google sign in error:", error);
      //     return false;
      //   }
      // }
      
      return true;
    }
  },
  pages: {
    signIn: '/login',
    error: '/login',
  }
})