'use client'

import { SidebarTrigger } from '@/components/ui/sidebar'
import { HandCoins } from 'lucide-react'
import PythonAnalysisPage from '@/app/(secure)/python-analysis/page'

export default function FundraisingUploadPage() {
  // This wraps the existing Python Analysis workflow, but we’ll tweak the
  // file upload + dataset loader to support TSV/TXT/DOCX and add export helpers.
  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-2">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium text-card-foreground flex items-center gap-2">
              <HandCoins className="h-4 w-4" />
              Fundraising segmentation
            </h1>
          </div>
        </div>
        <div className="border-b border-border" />
        <div className="p-6">
          <PythonAnalysisPage />
        </div>
      </div>
    </div>
  )
}

