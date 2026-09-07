"use client"

import Link from "next/link"
import { Github } from "lucide-react"

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white">
      <div className="flex h-14 items-center px-4 lg:px-6">
        <div className="flex w-full justify-between">
          <div className="flex items-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 5V19H5V5H19ZM19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3Z" fill="currentColor" />
            </svg>
            <span className="ml-2 font-medium">Documents</span>
          </div>
          <div className="flex items-center">
            <Link
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="text-gray-700 hover:text-gray-900"
            >
              GitHub
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
} 