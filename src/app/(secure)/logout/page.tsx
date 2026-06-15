"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";

export default function LogoutPage() {
  useEffect(() => {
    const handleLogout = async () => {
      try {
        console.log("Starting logout process...");
        
        // Clear all storage first
        localStorage.clear();
        sessionStorage.clear();
        
        console.log("Calling NextAuth signOut...");
        
        // Use NextAuth's proper signOut function
        await signOut({
          redirect: false, // Don't auto-redirect, we'll handle it
          callbackUrl: "/auth/login"
        });
        
        console.log("NextAuth signOut complete, clearing cookies...");
        
        // Clear all cookies as fallback
        document.cookie.split(";").forEach((c) => {
          const eqPos = c.indexOf("=");
          const name = eqPos > -1 ? c.substr(0, eqPos).trim() : c.trim();
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
        });
        
        console.log("Forcing redirect to login...");
        
        // Force full page reload to login
        window.location.replace("/auth/login");
        
      } catch (error) {
        console.error("Logout error:", error);
        // Force redirect even if everything fails
        window.location.replace("/auth/login");
      }
    };

    handleLogout();
  }, []);

  return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-white text-xl">Logging out...</p>
    </div>
  );
} 