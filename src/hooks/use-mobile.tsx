"use client"

import { useState, useEffect } from "react"

export function useMobile() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    // Only run on client side
    if (typeof window !== "undefined") {
      const checkIsMobile = () => {
        setIsMobile(window.innerWidth < 768) // Standard md breakpoint
      }
      
      // Initial check
      checkIsMobile()
      
      // Add event listener for window resize
      window.addEventListener("resize", checkIsMobile)
      
      // Cleanup
      return () => window.removeEventListener("resize", checkIsMobile)
    }
  }, [])

  return isMobile
}
