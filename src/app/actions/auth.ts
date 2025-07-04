"use server"

import { signIn, signOut } from "@/auth"
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"

export async function authenticate(
  email: string,
  password: string,
) {
  try {
    // Force sign out first to clear any existing session
    console.log('Clearing existing session before login...');
    try {
      await signOut({ redirect: false });
      // Add a small delay to ensure signout completes
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (signOutError) {
      console.log('Sign out error (may be expected if no session):', signOutError);
    }
    
    console.log('Attempting sign in for:', email);
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })
    
    console.log('Server action signIn result:', result);
    
    // If signIn was successful, redirect to cohort-chat
    if (result) {
      redirect('/cohort-chat');
    }
    
    return null; // Success
  } catch (error) {
    console.error('Server action error:', error);
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.'
        default:
          return 'Something went wrong.'
      }
    }
    return 'Authentication failed.'
  }
} 