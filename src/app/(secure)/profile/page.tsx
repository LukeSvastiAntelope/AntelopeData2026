'use client'

import { useState, useEffect, useRef, useCallback } from "react";
import toast from "react-hot-toast";
import Image from "next/image";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
import { validatePassword } from "@/app/utils/validation";
import { Skeleton } from "@heroui/skeleton";
import { useFetch } from "@/app/utils/lib";
import type { IAgentProfile } from "@/app/utils/interface";
import { LoginButton, TelegramAuthData } from '@telegram-auth/react';
import { signIn } from "next-auth/react"
import { useSession } from "next-auth/react"

// Skeleton for loading state
const ProfileSkeleton = () => {
    return (
        <div className="space-y-8">
            {/* Profile Info Section Skeleton */}
            <div className="bg-content1/50 backdrop-blur-md rounded-2xl p-8 shadow-lg border border-white/10">
                <Skeleton className="h-8 w-48 mb-4" /> {/* "Profile Information" heading */}

                {/* Avatar and Upload Button */}
                <div className="flex flex-col md:flex-row items-center gap-8 mb-6">
                    <Skeleton className="w-[140px] h-[140px] rounded-full" />
                    <Skeleton className="h-10 w-32" /> {/* Change Avatar button */}
                </div>

                <div className="flex flex-col md:flex-row items-start gap-8">
                    <div className="flex-1 space-y-4">
                        <Skeleton className="h-14 w-full max-w-md" /> {/* Name input */}
                        <Skeleton className="h-24 w-full max-w-md" /> {/* Description textarea */}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-6 flex items-center gap-4">
                    <Skeleton className="h-10 w-32" /> {/* Update Profile button */}
                    <Skeleton className="h-10 w-36" /> {/* Telegram button */}
                </div>
            </div>

            {/* Credentials Section Skeleton */}
            <div className="bg-content1/50 backdrop-blur-md rounded-2xl p-8 shadow-lg border border-white/10">
                <Skeleton className="h-8 w-32 mb-4" /> {/* "Credentials" heading */}
                <div className="flex flex-col gap-4 max-w-md">
                    <Skeleton className="h-14 w-full" /> {/* Current Password */}
                    <Skeleton className="h-14 w-full" /> {/* New Password */}
                    <Skeleton className="h-14 w-full" /> {/* Confirm Password */}
                </div>
                <div className="mt-6">
                    <Skeleton className="h-10 w-36" /> {/* Update Password button */}
                </div>
            </div>
        </div>
    );
};

export default function AgentProfile() {
    const [agent, setAgent] = useState<IAgentProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const { data: session } = useSession()

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
    const [isSubmittingDiscord, setIsSubmittingDiscord] = useState(false);

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

    const compressImage = (file: File | Blob): Promise<string> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new window.Image() as HTMLImageElement;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // Reduced maximum dimensions
                    const MAX_SIZE = 200; // Reduced from 500 to 200
                    if (width > height) {
                        if (width > MAX_SIZE) {
                            height = Math.round((height * MAX_SIZE) / width);
                            width = MAX_SIZE;
                        }
                    } else {
                        if (height > MAX_SIZE) {
                            width = Math.round((width * MAX_SIZE) / height);
                            height = MAX_SIZE;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);

                    // More aggressive compression
                    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.3); // Reduced quality to 30%

                    // Remove the data URL prefix to save some bytes
                    const base64Data = compressedBase64.split(',')[1];
                    resolve(base64Data);
                };
                img.src = e.target?.result as string;
            };
            reader.readAsDataURL(file);
        });
    };
    
    // Save "Profile Info"
    const handleSaveProfile = async () => {
        if (!agent) return;
        setIsSubmittingProfile(true);

        try {
            // Create multipart form data
            const agentProfile = {
                ...agent,
                name,
                description,
            }

            // Attach avatar file (if the user selected one)
            const avatarFile = fileRef?.current?.files?.[0];
            if (avatarFile) {
                const compressedImage = await compressImage(avatarFile);
                agentProfile.image = 'data:image/jpeg;base64,' + compressedImage;
            }

            const token = typeof window !== 'undefined' ? localStorage.getItem("token") ?? "" : "";
            const res = await fetch('/api/saveAgentProfile', {
                method: 'POST',
                body: JSON.stringify({
                    agent: agentProfile
                }),
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

    const connectTelegram = async (data: TelegramAuthData) => {
        const response = await fetchData.post("/api/connectTelegram", {
            telegram_id: data.id,
            username: data.username,
            first_name: data.first_name,
            last_name: data.last_name,
            type: 'telegram',
        });
        if (response.status) {
            toast.success(response.message || "Telegram connected successfully!");
            // Optionally you can refetch or update local state to show "Connected"
            setAgent(prev => prev ? { ...prev, platform_accounts: [...prev.platform_accounts, { platform_id: data.id, platform: 'telegram' }] } : null);
        } else {
            toast.error(response.message || "Failed to connect Telegram.");
        }
    }

    const connectDiscord = async () => {
        setIsSubmittingDiscord(true);
        try {
            await signIn("discord", {
                callbackUrl: window.location.origin + "/profile",
                redirect: true,
            });
        } catch (error) {
            console.error("Discord connection failed:", error);
            toast.error("Failed to connect Discord");
        } finally {
            setIsSubmittingDiscord(false);
        }
    }

    useEffect(() => {
        const importDiscord = async (name: string, email: string) => {
            setIsSubmittingDiscord(true);
            try {
                const response = await fetchData.post("/api/connectTelegram", {
                    telegram_id: name,
                    username: email,
                    first_name: "",
                    last_name: "",
                    type: 'discord',
                });
                if (response.status) {
                    toast.success(response.message || "Discord connected successfully!");
                    setAgent(prev => prev ? { ...prev, platform_accounts: [...prev.platform_accounts, { platform_id: parseInt(name), platform: 'discord' }] } : null);
                } else {
                    toast.error(response.message || "Failed to connect Discord.");
                }
            } catch (error) {
                console.error("Discord connection failed:", error);
                toast.error("Failed to connect Discord");
            } finally {
                setIsSubmittingDiscord(false);
            }
        }
        if (session && agent) {
            if (session.user?.name && session.user?.email && !agent?.platform_accounts.find(account => account.platform === 'discord')) {
                importDiscord(session.user.name, session.user.email);
            }
        }
    }, [session]);

    if (isLoading) return <ProfileSkeleton />;

    return (
        <div className="space-y-8">
            {/* Profile Info Section */}
            <div className="bg-content1/50 backdrop-blur-md rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 border border-white/10">
                <h2 className="text-base font-bold mb-4">Profile Information</h2>

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
                            <div className="w-full h-full flex items-center justify-center text-gray-500 text-6xl">
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
                    </div>
                </div>

                {/* Save Profile Info Button */}
                <div className="mt-6 flex items-center gap-4">
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

            {/* Telegram Connection Status */}
            <div className="bg-content1/50 backdrop-blur-md rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 border border-white/10">
                <h2 className="text-base font-bold mb-4">External Connections</h2>
                <div className="flex max-md:flex-col gap-2">
                    {
                        agent?.platform_accounts &&
                            agent?.platform_accounts.length > 0 &&
                            agent?.platform_accounts.find(account => account.platform === 'telegram') ?
                            (
                                <div className="flex items-center gap-2">
                                    <span className="bg-success-50 text-success-600 px-2 py-1 rounded-lg">
                                        Telegram Connected
                                    </span>
                                    {/* Optional: Show Telegram username if you store it */}
                                    {/* <span className="text-white">(@{agent?.telegramUsername})</span> */}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {/* <p className="text-default-500 text-md">
                                        No Telegram connection is active.
                                    </p> */}
                                    <LoginButton
                                        botUsername="AntelopeTerminal_Bot"
                                        buttonSize="large"
                                        cornerRadius={5}
                                        showAvatar={true}
                                        lang="en"
                                        onAuthCallback={(data) => connectTelegram(data)}
                                    />
                                </div>
                            )
                    }
                    {
                        agent?.platform_accounts &&
                            agent?.platform_accounts.length > 0 &&
                            agent?.platform_accounts.find(account => account.platform === 'discord') ?
                            (
                                <div className="flex items-center gap-2">
                                    <span className="bg-success-50 text-success-600 px-2 py-1 rounded-lg">
                                        Discord Connected
                                    </span>
                                    {/* Optional: Show Telegram username if you store it */}
                                    {/* <span className="text-white">(@{agent?.telegramUsername})</span> */}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {/* <p className="text-default-500 text-md">
                                        No Discord connection is active.
                                    </p> */}
                                    <Button
                                        color="secondary"
                                        className="bg-[#5865F2] hover:bg-[#4752C4] transition-colors flex items-center gap-2 text-white"
                                        onPress={connectDiscord}
                                        isLoading={isSubmittingDiscord}
                                    >
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09c-.01-.02-.04-.03-.07-.03c-1.5.26-2.93.71-4.27 1.33c-.01 0-.02.01-.03.02c-2.72 4.07-3.47 8.03-3.1 11.95c0 .02.01.04.03.05c1.8 1.32 3.53 2.12 5.24 2.65c.03.01.06 0 .07-.02c.4-.55.76-1.13 1.07-1.74c.02-.04 0-.08-.04-.09c-.57-.22-1.11-.48-1.64-.78c-.04-.02-.04-.08-.01-.11c.11-.08.22-.17.33-.25c.02-.02.05-.02.07-.01c3.44 1.57 7.15 1.57 10.55 0c.02-.01.05-.01.07.01c.11.09.22.17.33.26c.04.03.04.09-.01.11c-.52.31-1.07.56-1.64.78c-.04.01-.05.06-.04.09c.32.61.68 1.19 1.07 1.74c.03.01.06.02.09.01c1.72-.53 3.45-1.33 5.25-2.65c.02-.01.03-.03.03-.05c.44-4.53-.73-8.46-3.1-11.95c-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.83 2.12-1.89 2.12z" />
                                        </svg>
                                        Connect Discord
                                    </Button>
                                </div>
                            )
                    }
                </div>
            </div>

            {/* Credentials Section */}
            <div className="bg-content1/50 backdrop-blur-md rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 border border-white/10">
                <h2 className="text-base font-bold mb-4">Credentials</h2>
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