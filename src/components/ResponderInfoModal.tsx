"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Loader2, CheckCircle, Info } from "lucide-react"

interface ResponderInfoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  demographics: {
    name: string
    email: string
  }
  updateDemographics: (field: string, value: string) => void
  onExistingTwinFound?: (demographics: any) => void
}

export const ResponderInfoModal = ({
  open,
  onOpenChange,
  demographics,
  updateDemographics,
  onExistingTwinFound,
}: ResponderInfoModalProps) => {
  const [localName, setLocalName] = useState(demographics.name)
  const [localEmail, setLocalEmail] = useState(demographics.email)
  const [error, setError] = useState<string | null>(null)
  const [checkingEmail, setCheckingEmail] = useState(false)
  const [foundExisting, setFoundExisting] = useState(false)
  const [existingTwinData, setExistingTwinData] = useState<any>(null)

  // keep local state in sync when modal is reopened
  useEffect(() => {
    setLocalName(demographics.name)
    setLocalEmail(demographics.email)
    setFoundExisting(false)
    setExistingTwinData(null)
  }, [demographics])

  const checkForExistingTwin = async (email: string) => {
    if (!email || !email.includes('@')) return

    setCheckingEmail(true)
    setError(null)
    
    try {
      const response = await fetch('/api/digital-twin/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      })

      const result = await response.json()
      
      if (result.status && result.found) {
        setFoundExisting(true)
        setExistingTwinData(result.demographics)
        setLocalName(result.demographics.name || '')
        
        // Notify parent component about the existing twin
        if (onExistingTwinFound) {
          onExistingTwinFound(result.demographics)
        }
      } else {
        setFoundExisting(false)
        setExistingTwinData(null)
      }
    } catch (error) {
      console.error('Error checking for existing twin:', error)
      // Don't show error to user for this check, just continue normally
    } finally {
      setCheckingEmail(false)
    }
  }

  const handleEmailBlur = () => {
    if (localEmail && localEmail !== demographics.email) {
      checkForExistingTwin(localEmail)
    }
  }

  const handleContinue = () => {
    // validation
    if (!localName.trim()) {
      setError("Name is required")
      return
    }
    if (!localEmail.trim()) {
      setError("Email is required")
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(localEmail)) {
      setError("Please enter a valid email address")
      return
    }

    // Clear any errors
    setError(null)

    // propagate to parent
    updateDemographics("name", localName.trim())
    updateDemographics("email", localEmail.trim())

    // close modal
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tell us about you</DialogTitle>
          <DialogDescription>
            Before starting the survey, please provide your name and email so we can follow up with your results.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="responder-name">Name *</Label>
            <Input
              id="responder-name"
              placeholder="Your full name"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="responder-email">Email *</Label>
            <div className="relative">
              <Input
                id="responder-email"
                type="email"
                placeholder="your.email@example.com"
                value={localEmail}
                onChange={(e) => setLocalEmail(e.target.value)}
                onBlur={handleEmailBlur}
              />
              {checkingEmail && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
            {foundExisting && (
              <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Digital Twin Found!</span>
                </div>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  We found your existing digital twin and pre-filled your information. You can modify it if needed.
                </p>
              </div>
            )}
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter className="pt-4">
          <Button onClick={handleContinue} disabled={checkingEmail}>
            {checkingEmail ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              "Start Survey"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 