'use client'

import { useState, useEffect, useRef, useCallback } from "react";
import toast from "react-hot-toast";
import Image from "next/image";
import { Button } from "@nextui-org/button";
import { Input, Textarea } from "@nextui-org/input";
import { validatePassword } from "@/app/utils/validation";
import { Skeleton } from "@nextui-org/skeleton";
import { useFetch } from "@/app/utils/lib";
import type { IAgentProfile } from "@/app/utils/interface";

// Skeleton for loading state
const ProfileSkeleton = () => {
    return (
        <div className="bg-content1/50 backdrop-blur-md rounded-2xl p-8 shadow-lg border border-white/10">
            <div className="flex flex-col md:flex-row items-center gap-8">
                <div className="relative">
                    <Skeleton className="w-[140px] h-[140px] rounded-full" />
                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2">
                        <Skeleton className="h-8 w-28 rounded-lg" />
                    </div>
                </div>
                <div className="flex-1 text-center md:text-left space-y-3">
                    <Skeleton className="h-10 w-64 rounded-lg mb-2" />
                    <Skeleton className="h-20 w-full rounded-lg mb-4" />
                    <div className="flex flex-wrap gap-2 mt-4 justify-center md:justify-start">
                        {[...Array(3)].map((_, i) => (
                            <Skeleton key={i} className="h-8 w-28 rounded-full" />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function AgentProfile() {
    const [agent, setAgent] = useState<IAgentProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // For "Profile Info" section
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [imageUrl, setImageUrl] = useState("");

    // For controlling image file input
    const fileRef = useRef<HTMLInputElement | null>(null);
    const [imagePreview, setImagePreview] = useState<string>("");

    // For "Credentials" section
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);
    const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);

    const fetchData = useFetch();

    // Handle the user uploading / previewing a local avatar image
    const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            // This is the base64 preview for local display
            if (reader.result) {
                setImagePreview(reader.result as string);
            }
        };
        reader.readAsDataURL(file);
    }, []);

    useEffect(() => {
        const fetchAgentProfile = async () => {
            try {
                const response = await fetchData.get("/api/getAgentProfile");
                if (response.status) {
                    const a = response.agent as IAgentProfile;
                    setAgent(a);

                    // Prefill editable fields
                    setName(a.name || "");
                    setDescription(a.description || "");
                    setImageUrl(a.image || "/assets/images/default-agent.png");
                    setImagePreview(a.image || "/assets/images/default-agent.png");
                } else {
                    toast.error(response.message);
                }
            } catch (error) {
                console.log(error);
                toast.error("Failed to fetch agent profile");
            }
            setIsLoading(false);
        };
        fetchAgentProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Save "Profile Info"
    const handleSaveProfile = async () => {
        if (!agent) return;
        setIsSubmittingProfile(true);

        try {
            // Create multipart form data
            const formData = new FormData();
            formData.append("name", name);
            formData.append("description", description);

            // Attach avatar file (if the user selected one)
            const avatarFile = fileRef?.current?.files?.[0];
            if (avatarFile) {
                formData.append("avatar", avatarFile);
            } else {
                // In case no new file: store the existing image path
                formData.append("image", imageUrl);
            }

            const token = typeof window !== 'undefined' ? localStorage.getItem("token") ?? "" : "";
            const res = await fetch('/api/saveAgentProfile', {
                method: 'POST',
                body: formData,
                headers: {
                    'Authorization': `Bearer ${token}`,
                }
            });
            const response = await res.json();
            if (response.status) {
                toast.success("Profile info updated successfully!");
            } else {
                toast.error(response.message || "Failed to update profile info.");
            }
        } catch (error) {
            console.error(error);
            toast.error("Profile update failed.");
        }

        setIsSubmittingProfile(false);
    };

    // Change password
    const handleChangePassword = async () => {
        if (newPassword !== confirmPassword) {
            toast.error("New passwords do not match");
            return;
        }
        const validationError = validatePassword(newPassword);
        if (validationError) {
            toast(validationError, {
                icon: "🤬",
                style: {
                    borderRadius: "10px",
                    background: "#333",
                    color: "#fff",
                },
            });
            return;
        }

        setIsSubmittingPassword(true);
        try {
            const response = await fetchData.post("/api/changePassword", {
                currentPassword,
                newPassword,
            });
            if (response.status) {
                toast.success("Password changed successfully!");
                // Clear fields
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
            } else {
                toast.error(response.message || "Failed to change password.");
            }
        } catch (error) {
            console.error(error);
            toast.error("Failed to change password.");
        }
        setIsSubmittingPassword(false);
    };

    if (isLoading) return <ProfileSkeleton />;

    return (
        <div className="space-y-8">
            {/* Profile Info Section */}
            <div className="bg-content1/50 backdrop-blur-md rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 border border-white/10">
                <h2 className="text-2xl font-bold mb-4">Profile Information</h2>

                {/* Avatar Upload */}
                <div className="flex flex-col md:flex-row items-center gap-8 mb-6">
                    <div
                        className="relative group w-[140px] h-[140px] rounded-full overflow-hidden object-cover border-2 border-white/20 cursor-pointer"
                        onClick={() => fileRef.current?.click()}
                    >
                        {imagePreview ? (
                            <Image
                                src={imagePreview}
                                alt="Agent Avatar"
                                fill
                                className="object-cover hover:scale-105 duration-200 transition-transform"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-default-400 text-6xl">
                                +
                            </div>
                        )}
                    </div>
                    <Button
                        color="primary"
                        onPress={() => fileRef.current?.click()}
                        className="hover:scale-105 transition-transform"
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

                <div className="flex flex-col md:flex-row items-start gap-8">
                    {/* Editable Fields for Name & Description */}
                    <div className="flex-1 space-y-4">
                        <Input
                            label="Name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="max-w-md"
                        />
                        <Textarea
                            label="Description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="max-w-md"
                        />

                        {/* <div className="flex flex-wrap gap-3 mt-4">
                            <Chip
                                variant="shadow"
                                classNames={{
                                    base: "bg-gradient-to-br from-primary to-secondary hover:scale-105 transition-transform",
                                    content: "drop-shadow-md text-white font-semibold px-4",
                                }}
                            >
                                Pro Agent
                            </Chip>
                            <Chip
                                variant="bordered"
                                classNames={{
                                    base: "border-primary/30 hover:bg-primary/10 hover:scale-105 transition-all",
                                    content: "text-primary font-medium px-4",
                                }}
                            >
                                {totalBets} Bets
                            </Chip>
                            <Chip
                                variant="bordered"
                                classNames={{
                                    base: "border-secondary/30 hover:bg-secondary/10 hover:scale-105 transition-all",
                                    content: "text-secondary font-medium px-4",
                                }}
                            >
                                {successRate?.toFixed(2) || "0.00"}% Success Rate
                            </Chip>
                        </div> */}
                    </div>
                </div>

                {/* Save Profile Info Button */}
                <div className="mt-6">
                    <Button
                        color="primary"
                        variant="shadow"
                        onPress={handleSaveProfile}
                        isLoading={isSubmittingProfile}
                        className="hover:scale-105 transition-transform"
                    >
                        Update Profile
                    </Button>
                </div>
            </div>

            {/* Credentials Section */}
            <div className="bg-content1/50 backdrop-blur-md rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 border border-white/10">
                <h2 className="text-2xl font-bold mb-4">Credentials</h2>
                <div className="flex flex-col gap-4 max-w-md">
                    <Input
                        label="Current Password"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                    <Input
                        label="New Password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <Input
                        label="Confirm New Password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                </div>

                <div className="mt-6">
                    <Button
                        color="primary"
                        onPress={handleChangePassword}
                        isLoading={isSubmittingPassword}
                        className="hover:scale-105 transition-transform"
                    >
                        Update Password
                    </Button>
                </div>
            </div>
        </div>
    );
}