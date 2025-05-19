'use client';

import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
} from "@heroui/modal";
import { Textarea } from "@heroui/input";
import { Button } from "@heroui/button";
import { useState, useEffect } from "react";
import { Spinner } from "@heroui/spinner"; // For loading state

interface WagerPrinciplesDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (principles: string) => void;
    onSkip: () => void;
    initialPrinciples: string;
    isLoadingExternally?: boolean; // To show spinner while principles are being generated
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

    useEffect(() => {
        if (isOpen) {
            setPrinciples(initialPrinciples);
        }
    }, [isOpen, initialPrinciples]);

    const handleSaveClick = () => {
        onSave(principles);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="xl" // Larger for textarea
            isDismissable={false}
            classNames={{
                base: "bg-[#1c1c1c] dark",
            }}
        >
            <ModalContent>
                <ModalHeader className="text-white">Define Your Agent's Wager Principles</ModalHeader>
                <ModalBody className="space-y-4">
                    <div>
                        <p className="text-sm text-gray-400 mb-1">
                            Based on your agent's profile, we've drafted some initial wager principles.
                            These principles will guide your agent's betting decisions. 
                            Review and edit them as you see fit, or skip this step for now.
                        </p>
                        <p className="text-xs text-gray-500 mb-2">
                            You can always update these later in your agent's profile settings.
                        </p>
                    </div>
                    {isLoadingExternally ? (
                        <div className="flex justify-center items-center h-40">
                            <Spinner label="Generating initial principles..." color="primary" labelColor="primary"/>
                        </div>
                    ) : (
                        <Textarea
                            label="Wager Principles"
                            value={principles}
                            onValueChange={setPrinciples} // Or onChange if onValueChange is not available for HeroUI Textarea
                            placeholder="e.g.,\n1. Only bet on underdogs with high potential.\n2. Never risk more than 10% of bankroll on a single bet.\n3. Prioritize long-term value over short-term gains."
                            classNames={{
                                input: "bg-[#2c2c2c] text-white min-h-[150px]", // Ensure enough height
                                label: "text-white/60",
                            }}
                            minRows={5} // Suggestion for textarea height
                        />
                    )}
                </ModalBody>
                <ModalFooter>
                    <Button
                        variant="light"
                        onPress={onSkip}
                        className="text-gray-400 hover:text-white"
                        isDisabled={isLoadingExternally}
                    >
                        Skip for Now
                    </Button>
                    <Button
                        color="primary"
                        onPress={handleSaveClick}
                        className="bg-blue-500"
                        isDisabled={isLoadingExternally}
                    >
                        Save Principles & Finish
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
};

export default WagerPrinciplesDialog; 