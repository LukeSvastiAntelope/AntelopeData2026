"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    localStorage.clear();
    router.replace("/login");
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-white text-xl">Logging out...</p>
    </div>
  );
} 