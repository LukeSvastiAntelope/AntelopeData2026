import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface AgentNameDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialName?: string;
  onSave: (name: string) => Promise<void> | void;
  isSubmitting?: boolean;
  userEmail?: string;
}

export default function AgentNameDialog({
  isOpen,
  onClose,
  initialName = "",
  onSave,
  isSubmitting = false,
  userEmail = "",
}: AgentNameDialogProps) {
  const [name, setName] = useState(initialName);

  const handleSave = async () => {
    if (!name.trim()) return;
    await onSave(name.trim());
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px] bg-background border-border">
        <DialogHeader>
          <DialogTitle>Welcome! Let&apos;s get started</DialogTitle>
          <DialogDescription>
            Please enter your real name to set up your account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Email Address
            </label>
            <div className="px-3 py-2 bg-muted rounded-md text-sm text-muted-foreground">
              {userEmail}
            </div>
          </div>
          
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Your Name <span className="text-red-500">*</span>
            </label>
            <Input
              id="name"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? "Setting up..." : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 