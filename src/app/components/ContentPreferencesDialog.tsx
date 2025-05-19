'use client';

import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
} from "@heroui/modal";
import { Select, SelectItem } from "@heroui/select";
import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import { useState, useEffect } from "react";
import { IAgentProfile } from "@/app/utils/interface"; // Assuming IAgentProfile is here

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
    }) => void;
    onSkip: () => void;
    agent: IAgentProfile | null; // To pre-fill if values already exist, though defaults are for first-time
}

const CATEGORIES = ["General", "Sports", "Finance", "Crypto", "Technology", "Politics", "Entertainment"];
const RISK_LEVELS = ["Low", "Medium", "High"];
const SPORTS_SUB_CATEGORIES = ["NFL", "NBA", "Soccer", "EPL", "MLB", "NHL", "Tennis", "Golf", "Racing", "Other"];

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

    useEffect(() => {
        if (isOpen && agent) {
            const currentCategory = agent.category || "General";
            setCategory(currentCategory);
            setRiskLevel(agent.riskLevel || "Medium");
            setConservativeBetSize(agent.conservativeBetSize || 10);
            setModerateBetSize(agent.moderateBetSize || 30);
            setAggressiveBetSize(agent.aggressiveBetSize || 90);
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
        }
    }, [isOpen, agent]);

    useEffect(() => {
        if (category !== "Sports") {
            setSportPreference("");
        }
    }, [category]);

    const handleSaveClick = () => {
        const prefsToSave: any = {
            category,
            riskLevel,
            conservativeBetSize,
            moderateBetSize,
            aggressiveBetSize,
        };
        if (category === "Sports" && sportPreference) {
            prefsToSave.sportPreference = sportPreference;
        }
        onSave(prefsToSave);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="lg" // Slightly larger for more content
            isDismissable={false} // User must explicitly save or skip
            classNames={{
                base: "bg-[#1c1c1c] dark", // Consistent styling
            }}
        >
            <ModalContent>
                <ModalHeader className="text-white">Set Your Content Preferences</ModalHeader>
                <ModalBody className="space-y-4">
                    <div>
                        <p className="text-sm text-gray-400 mb-2">
                            Help us tailor your experience by setting your preferred content category, risk appetite, and default betting sizes. You can change these later in your profile.
                        </p>
                    </div>
                    <Select
                        label="Preferred Category"
                        selectedKeys={[category]}
                        onChange={(e) => setCategory(e.target.value)}
                        placeholder="Select a category"
                        aria-label="Category Select"
                         classNames={{
                            label: "text-white/60",
                            trigger: "bg-[#2c2c2c] text-white",
                        }}
                    >
                        {CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat} textValue={cat} className="text-white">
                                {cat}
                            </SelectItem>
                        ))}
                    </Select>

                    {category === "Sports" && (
                        <Select
                            label="Specific Sport (Optional)"
                            selectedKeys={sportPreference ? [sportPreference] : []}
                            onChange={(e) => setSportPreference(e.target.value)}
                            placeholder="Select a sport"
                            aria-label="Sport Preference Select"
                            classNames={{
                                label: "text-white/60",
                                trigger: "bg-[#2c2c2c] text-white",
                            }}
                        >
                            {SPORTS_SUB_CATEGORIES.map((sport) => (
                                <SelectItem key={sport} value={sport} textValue={sport} className="text-white">
                                    {sport}
                                </SelectItem>
                            ))}
                        </Select>
                    )}

                    <Select
                        label="Default Risk Level"
                        selectedKeys={[riskLevel]}
                        onChange={(e) => setRiskLevel(e.target.value)}
                        placeholder="Select your risk level"
                        aria-label="Risk Level Select"
                        classNames={{
                            label: "text-white/60",
                            trigger: "bg-[#2c2c2c] text-white",
                        }}
                    >
                        {RISK_LEVELS.map((level) => (
                            <SelectItem key={level} value={level} textValue={level} className="text-white">
                                {level}
                            </SelectItem>
                        ))}
                    </Select>
                    
                    <div className="text-white/80 text-sm mb-1 mt-2">Default Betting Sizes:</div>
                    <div className="grid grid-cols-3 gap-4">
                        <Input
                            label="Small Bet"
                            type="number"
                            value={conservativeBetSize.toString()}
                            onValueChange={(val) => setConservativeBetSize(Number(val))}
                            placeholder="e.g., 10"
                            min={1}
                            classNames={{ input: "bg-[#2c2c2c] text-white", label: "text-white/60" }}
                        />
                        <Input
                            label="Medium Bet"
                            type="number"
                            value={moderateBetSize.toString()}
                            onValueChange={(val) => setModerateBetSize(Number(val))}
                            placeholder="e.g., 30"
                            min={1}
                            classNames={{ input: "bg-[#2c2c2c] text-white", label: "text-white/60" }}
                        />
                        <Input
                            label="Large Bet"
                            type="number"
                            value={aggressiveBetSize.toString()}
                            onValueChange={(val) => setAggressiveBetSize(Number(val))}
                            placeholder="e.g., 90"
                            min={1}
                            classNames={{ input: "bg-[#2c2c2c] text-white", label: "text-white/60" }}
                        />
                    </div>

                </ModalBody>
                <ModalFooter>
                    <Button
                        variant="light" // Less prominent
                        onPress={onSkip}
                        className="text-gray-400 hover:text-white"
                    >
                        Skip for Now
                    </Button>
                    <Button
                        color="primary"
                        onPress={handleSaveClick}
                        className="bg-blue-500" // Consistent with AgentProfileDialog
                    >
                        Save Settings & Continue
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
};

export default ContentPreferencesDialog; 