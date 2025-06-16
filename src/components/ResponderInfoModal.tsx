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

interface ResponderInfoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  demographics: {
    name: string
    email: string
  }
  updateDemographics: (field: string, value: string) => void
}

export const ResponderInfoModal = ({
  open,
  onOpenChange,
  demographics,
  updateDemographics,
}: ResponderInfoModalProps) => {
  const [localName, setLocalName] = useState(demographics.name)
  const [localEmail, setLocalEmail] = useState(demographics.email)
  const [error, setError] = useState<string | null>(null)

  // keep local state in sync when modal is reopened
  useEffect(() => {
    setLocalName(demographics.name)
    setLocalEmail(demographics.email)
  }, [demographics])

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
            <Input
              id="responder-email"
              type="email"
              placeholder="your.email@example.com"
              value={localEmail}
              onChange={(e) => setLocalEmail(e.target.value)}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter className="pt-4">
          <Button onClick={handleContinue}>Start Survey</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 