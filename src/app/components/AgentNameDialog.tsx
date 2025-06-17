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
}

export default function AgentNameDialog({
  isOpen,
  onClose,
  initialName = "",
  onSave,
  isSubmitting = false,
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
          <DialogTitle>Pick a name for your agent</DialogTitle>
          <DialogDescription>
            This is the only step required right now. You can customise more later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Input
            placeholder="e.g. Market Maven"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 