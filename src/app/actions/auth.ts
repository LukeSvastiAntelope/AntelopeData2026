"use server"

import { signIn, signOut } from "@/auth"
import { AuthError } from "next-auth"

export async function authenticate(
  email: string,
  password: string,
) {
  try {
    // Force sign out first to clear any existing session
    // console.log('Clearing existing session before login...');
    // try {
    //   await signOut({ redirect: false });
    //   // Add a small delay to ensure signout completes
    //   await new Promise(resolve => setTimeout(resolve, 100));
    // } catch (signOutError) {
    //   console.log('Sign out error (may be expected if no session):', signOutError);
    // }
    
    console.log('Attempting sign in for:', email);
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })
    
    console.log('Server action signIn result:', result);
    
    // NextAuth signIn with redirect: false returns undefined on success
    // If no error was thrown, it means authentication was successful
    return { success: true };
  } catch (error: any) {
    console.error('Server action error:', error);
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return { success: false, error: 'Invalid credentials.' };
        default:
          return { success: false, error: 'Something went wrong.' };
      }
    }
    return { success: false, error: 'Authentication failed.' };
  }
} 