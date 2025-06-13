'use client';

import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@heroui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";

interface WagerPrinciplesDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (principles: string) => void;
    onSkip: () => void;
    initialPrinciples: string;
    isLoadingExternally?: boolean;
}

const WagerPrinciplesDialog = ({
    isOpen,
    onClose,
    onSave,
    onSkip,
    initialPrinciples,
    isLoadingExternally = false,
}: WagerPrinciplesDialogProps) => {
    const [principles, setPrinciples] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setPrinciples(initialPrinciples);
        }
    }, [isOpen, initialPrinciples]);

    const handleSaveClick = async () => {
        setIsSubmitting(true);
        try {
            await onSave(principles);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
            <DialogContent className="sm:max-w-[525px] bg-background border-border">
                <DialogHeader>
                    <DialogTitle>Wager Principles</DialogTitle>
                    <DialogDescription>
                                                    Step 3 of 3: Define your agent&apos;s betting strategy
                    </DialogDescription>
                    <Progress value={100} className="h-2" />
                </DialogHeader>

                <div className="space-y-6 py-4">
                    <div className="text-sm text-muted-foreground space-y-2">
                        <p>
                            Based on your agent&apos;s profile, we&apos;ve drafted some initial wager principles.
                                                          These principles will guide your agent&apos;s betting decisions. 
                            Review and edit them as you see fit, or skip this step for now.
                        </p>
                        <p className="text-xs opacity-70">
                            You can always update these later in your agent&apos;s profile settings.
                        </p>
                    </div>

                    {isLoadingExternally ? (
                        <div className="flex flex-col items-center justify-center h-[200px] gap-4">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground">Generating initial principles...</p>
                        </div>
                    ) : (
                        <Textarea
                            value={principles}
                            onChange={(e) => setPrinciples(e.target.value)}
                            placeholder={
                                "e.g.,\n" +
                                "1. Only bet on underdogs with high potential.\n" +
                                "2. Never risk more than 10% of bankroll on a single bet.\n" +
                                "3. Prioritize long-term value over short-term gains."
                            }
                            className="min-h-[200px] bg-muted resize-none"
                            disabled={isLoadingExternally}
                        />
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button
                        variant="ghost"
                        onPress={onSkip}
                        disabled={isLoadingExternally || isSubmitting}
                    >
                        Skip for Now
                    </Button>
                    <Button
                        onPress={handleSaveClick}
                        disabled={isLoadingExternally || isSubmitting}
                    >
                        {isSubmitting ? (
                            <div className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Saving...</span>
                            </div>
                        ) : (
                            "Complete Setup"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default WagerPrinciplesDialog; 