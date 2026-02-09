"use client";

import {ThemeProvider as NextThemesProvider} from "next-themes";
import { SessionProvider } from "next-auth/react";
import { Session } from "next-auth";
import { ReactNode } from "react";

interface ProviderProps {
  children: ReactNode;
  session?: Session;
}

export function Providers({children, session}: ProviderProps) {
  return (
    <SessionProvider session={session}>
      {children}
    </SessionProvider>
  )
}