"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    // Example: Clear localStorage or call an API route to invalidate session on the server
    // localStorage.removeItem("my_app_token");

    // Then redirect user to /login or your public homepage
    router.replace("/login");
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-white text-xl">Logging out...</p>
    </div>
  );
} 