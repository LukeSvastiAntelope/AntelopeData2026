import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
} from "@heroui/modal";
import { Input, Textarea } from "@heroui/input";
import { Button } from "@heroui/button";
import { useRef, useState } from "react";
import Image from "next/image";

const AgentProfileDialog = (
    { isOpen, onClose, name, description, image, isSubmittingProfile, handleSaveProfile }:
        {
            isOpen: boolean, onClose: () => void, name: string, description: string, image: string,
            isSubmittingProfile: boolean, handleSaveProfile: (name: string, description: string, fileRef: React.RefObject<HTMLInputElement>) => void
        }
) => {
    const [agentName, setAgentName] = useState(name);
    const [agentDescription, setAgentDescription] = useState(description);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const [imagePreview, setImagePreview] = useState<string>(image);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="md"
            isDismissable={false}
            classNames={{
                base: "bg-[#1c1c1c] dark",
            }}
        >
            <ModalContent>
                <ModalHeader className="text-white">Profile Information</ModalHeader>
                <ModalBody>
                    {/* Avatar Upload - Simplified */}
                    <div className="flex flex-col items-center gap-4 mb-8">
                        <div
                            className="relative w-[120px] h-[120px] rounded-full overflow-hidden border border-white/10 cursor-pointer bg-[#2c2c2c] flex items-center justify-center"
                            onClick={() => fileRef.current?.click()}
                        >
                            {imagePreview ? (
                                <Image
                                    src={imagePreview}
                                    alt="Agent Avatar"
                                    fill
                                    className="object-cover"
                                />
                            ) : (
                                <div className="text-white/40 text-4xl">+</div>
                            )}
                        </div>
                        <Button
                            color="primary"
                            onPress={() => fileRef.current?.click()}
                            size="sm"
                            className="bg-blue-500"
                        >
                            Change Avatar
                        </Button>
                        <input
                            type="file"
                            accept="image/*"
                            ref={fileRef}
                            className="hidden"
                            onChange={handleImageUpload}
                        />
                    </div>

                    {/* Form Fields - Simplified */}
                    <div className="space-y-4">
                        <Input
                            label="Name"
                            value={agentName}
                            onChange={(e) => setAgentName(e.target.value)}
                            classNames={{
                                input: "bg-[#2c2c2c] text-white",
                                label: "text-white/60",
                            }}
                        />
                        <Textarea
                            label="Description"
                            value={agentDescription}
                            onChange={(e) => setAgentDescription(e.target.value)}
                            classNames={{
                                input: "bg-[#2c2c2c] text-white",
                                label: "text-white/60",
                            }}
                        />
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button
                        color="primary"
                        onPress={() => handleSaveProfile(agentName, agentDescription, fileRef)}
                        className="bg-blue-500"
                        isLoading={isSubmittingProfile}
                    >
                        {isSubmittingProfile ? "Saving..." : "Save"}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    )
}

export default AgentProfileDialog;