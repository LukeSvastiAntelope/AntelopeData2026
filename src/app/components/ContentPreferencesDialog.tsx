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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2, X, ChevronRight, ChevronLeft } from "lucide-react";
import { IAgentProfile } from "@/app/utils/interface";
import { cn } from "@/lib/utils";
import { CATEGORIES, SPORTS_CATEGORIES } from "@/app/utils/const";

interface ContentPreferencesDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (preferences: {
        category: string;
        riskLevel: string;
        conservativeBetSize: number;
        moderateBetSize: number;
        aggressiveBetSize: number;
        sportPreference?: string;
        interests?: string[];
    }) => void;
    onSkip: () => void;
    agent: IAgentProfile | null;
}

const RISK_LEVELS = ["Low", "Medium", "High"];

const ContentPreferencesDialog = ({
    isOpen,
    onClose,
    onSave,
    onSkip,
    agent,
}: ContentPreferencesDialogProps) => {
    const [category, setCategory] = useState("General");
    const [riskLevel, setRiskLevel] = useState("Medium");
    const [conservativeBetSize, setConservativeBetSize] = useState(10);
    const [moderateBetSize, setModerateBetSize] = useState(30);
    const [aggressiveBetSize, setAggressiveBetSize] = useState(90);
    const [sportPreference, setSportPreference] = useState("");
    const [interests, setInterests] = useState<string[]>([]);
    const [newInterest, setNewInterest] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);

    useEffect(() => {
        if (isOpen && agent) {
            const currentCategory = agent.category || "General";
            setCategory(currentCategory);
            setRiskLevel(agent.riskLevel || "Medium");
            setConservativeBetSize(agent.conservativeBetSize || 10);
            setModerateBetSize(agent.moderateBetSize || 30);
            setAggressiveBetSize(agent.aggressiveBetSize || 90);
            setInterests(agent.interests || []);
            if (currentCategory === "Sports") {
                setSportPreference(agent.sport_preference || "");
            } else {
                setSportPreference("");
            }
        } else if (isOpen) {
            setCategory("General");
            setRiskLevel("Medium");
            setConservativeBetSize(10);
            setModerateBetSize(30);
            setAggressiveBetSize(90);
            setSportPreference("");
            setInterests([]);
        }
    }, [isOpen, agent]);

    useEffect(() => {
        if (category !== "Sports") {
            setSportPreference("");
        }
    }, [category]);

    const addInterest = () => {
        if (newInterest && !interests.includes(newInterest)) {
            setInterests([...interests, newInterest]);
            setNewInterest("");
        }
    };

    const removeInterest = (interest: string) => {
        setInterests(interests.filter(i => i !== interest));
    };

    const handleSaveClick = async () => {
        setIsSubmitting(true);
        try {
            const prefsToSave = {
                category,
                riskLevel,
                conservativeBetSize,
                moderateBetSize,
                aggressiveBetSize,
                interests: category !== "Sports" ? interests : [],
                ...(category === "Sports" && sportPreference ? { sportPreference } : {}),
            };
            await onSave(prefsToSave);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className={cn(
                "flex p-0 bg-background border-border",
                isCollapsed ? "sm:max-w-[100px]" : "sm:max-w-[825px]"
            )}>
                {/* Main Content */}
                <div className={cn(
                    "flex-1 p-6",
                    isCollapsed ? "hidden" : "block"
                )}>
                    <DialogHeader>
                        <DialogTitle>Strategy Settings</DialogTitle>
                        <DialogDescription>
                            Step 2 of 3: Configure your agent&apos;s prediction strategy
                        </DialogDescription>
                        <Progress value={66} className="h-2" />
                    </DialogHeader>

                    <div className="space-y-6 py-4">
                        <div className="text-sm text-muted-foreground">
                            Help us tailor your experience by setting your preferred content category, 
                            interests, risk appetite, and default betting sizes. You can change these 
                            later in your profile.
                        </div>

                        <div className="space-y-4">
                            <Select value={category} onValueChange={setCategory}>
                                <SelectTrigger className="w-full bg-muted">
                                    <SelectValue placeholder="Select a category" />
                                </SelectTrigger>
                                <SelectContent>
                                    {CATEGORIES.map((cat) => (
                                        <SelectItem key={cat} value={cat}>
                                            {cat}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {category === "Sports" ? (
                                <Select value={sportPreference} onValueChange={setSportPreference}>
                                    <SelectTrigger className="w-full bg-muted">
                                        <SelectValue placeholder="Select a sport (Optional)" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {SPORTS_CATEGORIES.map((sport) => (
                                            <SelectItem key={sport} value={sport}>
                                                {sport}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <div className="space-y-3">
                                    <label className="text-sm font-medium">Category Interests</label>
                                    <div className="flex flex-wrap gap-2">
                                        {interests.map((interest) => (
                                            <Badge 
                                                key={interest} 
                                                variant="secondary"
                                                className="px-2 py-1 flex items-center gap-1"
                                            >
                                                {interest}
                                                <button
                                                    onClick={() => removeInterest(interest)}
                                                    className="ml-1 hover:text-destructive"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </Badge>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Enter an interest"
                                            value={newInterest}
                                            onChange={(e) => setNewInterest(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && addInterest()}
                                            className="bg-muted"
                                        />
                                        <Button
                                            onClick={addInterest}
                                            variant="secondary"
                                        >
                                            Add
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <Select value={riskLevel} onValueChange={setRiskLevel}>
                                <SelectTrigger className="w-full bg-muted">
                                    <SelectValue placeholder="Select risk level" />
                                </SelectTrigger>
                                <SelectContent>
                                    {RISK_LEVELS.map((level) => (
                                        <SelectItem key={level} value={level}>
                                            {level}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <div className="space-y-3">
                                <label className="text-sm font-medium">Default Betting Sizes</label>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs text-muted-foreground">Small Bet</label>
                                        <Input
                                            type="number"
                                            value={conservativeBetSize}
                                            onChange={(e) => setConservativeBetSize(Number(e.target.value))}
                                            min={1}
                                            className="bg-muted"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs text-muted-foreground">Medium Bet</label>
                                        <Input
                                            type="number"
                                            value={moderateBetSize}
                                            onChange={(e) => setModerateBetSize(Number(e.target.value))}
                                            min={1}
                                            className="bg-muted"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs text-muted-foreground">Large Bet</label>
                                        <Input
                                            type="number"
                                            value={aggressiveBetSize}
                                            onChange={(e) => setAggressiveBetSize(Number(e.target.value))}
                                            min={1}
                                            className="bg-muted"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="gap-2">
                        <Button
                            variant="ghost"
                            onClick={onSkip}
                            disabled={isSubmitting}
                        >
                            Skip for Now
                        </Button>
                        <Button
                            onClick={handleSaveClick}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                "Continue"
                            )}
                        </Button>
                    </DialogFooter>
                </div>

                {/* Right Column */}
                <div className="relative">
                    {/* Expand/Collapse Button */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute -left-3 top-3 h-6 w-6 rounded-full border bg-background shadow-md"
                        onClick={() => setIsCollapsed(!isCollapsed)}
                    >
                        {isCollapsed ? (
                            <ChevronRight className="h-4 w-4" />
                        ) : (
                            <ChevronLeft className="h-4 w-4" />
                        )}
                    </Button>

                    <div className={cn(
                        "h-full bg-muted/30",
                        isCollapsed ? "w-[50px]" : "w-[250px]"
                    )}>
                        {!isCollapsed && (
                            <div className="p-6 space-y-6">
                                <div className="flex items-center">
                                    <h3 className="text-lg font-semibold leading-none tracking-tight">
                                        Strategy
                                    </h3>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <h4 className="text-sm font-medium">Selected Category</h4>
                                        <p className="text-sm text-muted-foreground">{category}</p>
                                    </div>
                                    {category === "Sports" && sportPreference && (
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-medium">Sport</h4>
                                            <p className="text-sm text-muted-foreground">{sportPreference}</p>
                                        </div>
                                    )}
                                    <div className="space-y-1">
                                        <h4 className="text-sm font-medium">Risk Level</h4>
                                        <p className="text-sm text-muted-foreground">{riskLevel}</p>
                                    </div>
                                    {interests.length > 0 && (
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-medium">Interests</h4>
                                            <div className="flex flex-wrap gap-1">
                                                {interests.map((interest) => (
                                                    <Badge 
                                                        key={interest} 
                                                        variant="outline"
                                                        className="text-xs"
                                                    >
                                                        {interest}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default ContentPreferencesDialog; 