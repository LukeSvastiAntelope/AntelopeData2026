'use client'

import { Chip } from "@nextui-org/chip";
import { Skeleton } from "@nextui-org/skeleton";
import { Button } from "@nextui-org/button";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useFetch } from "@/app/utils/lib";
import Image from "next/image";
import { IAgentProfile } from "@/app/utils/interface";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@nextui-org/modal";
import { Input } from "@nextui-org/input";
import { validatePassword } from "@/app/utils/validation";

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

const AgentProfile = () => {

    const [agent, setAgent] = useState<IAgentProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [totalBets, setTotalBets] = useState(0);
    const [successRate, setSuccessRate] = useState(0);
    const fetch = useFetch();
    const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
    const [passwords, setPasswords] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const fetchAgentProfile = async () => {
            try {
                const response = await fetch.get('/api/getAgentProfile');
                if (response.status) {
                    setAgent(response.agent);
                    setTotalBets(response.totalBets);
                    setSuccessRate(response.successRate);
                } else {
                    toast.error(response.message);
                }
            } catch (error) {
                console.log(error);
                toast.error('Failed to fetch agent profile');
            }
            setIsLoading(false);
        };
        fetchAgentProfile();
    }, []);

    const handleChangePassword = async () => {
        if (passwords.newPassword !== passwords.confirmPassword) {
            toast.error('New passwords do not match');
            return;
        }
        const validationError = validatePassword(passwords.newPassword);
        if (validationError) {
            toast(validationError,
                {
                    icon: '🤬',
                    style: {
                        borderRadius: '10px',
                        background: '#333',
                        color: '#fff',
                    },
                }
            );
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await fetch.post('/api/changePassword', {
                currentPassword: passwords.currentPassword,
                newPassword: passwords.newPassword
            });

            if (response.status) {
                toast.success('Password changed successfully');
                setIsChangePasswordOpen(false);
                setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
            } else {
                toast.error(response.message);
            }
        } catch (error) {
            console.error(error);
            toast.error('Failed to change password');
        }
        setIsSubmitting(false);
    };

    if (isLoading) return <ProfileSkeleton />;

    return (
        <>
            <div className="bg-content1/50 backdrop-blur-md rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 border border-white/10">
                <div className="flex flex-col md:flex-row items-center gap-8">
                    <div className="relative group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-primary/40 to-secondary/40 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition duration-500"></div>
                        <Image
                            src={agent?.image || '/assets/images/default-agent.png'}
                            alt="Agent Image"
                            className="relative w-[140px] h-[140px] rounded-full border-4 border-white/20 group-hover:border-white/30 group-hover:scale-105 transition-all duration-300"
                            width={140}
                            height={140}
                        />
                        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transform group-hover:-translate-y-1 transition-all duration-300">
                            <Button
                                size="sm"
                                color="primary"
                                variant="shadow"
                                className="px-4 py-2 font-medium backdrop-blur-md"
                                href="/editProfile"
                                as="a"
                            >
                                <span className="icon-edit mr-2" />
                                Edit Profile
                            </Button>
                        </div>
                    </div>

                    <div className="flex-1 text-center md:text-left space-y-4">
                        <div className="relative group">
                            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent bg-[length:200%] animate-gradient">
                                {agent?.name || 'Agent Name'}
                            </h1>
                            <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-secondary/20 blur-2xl opacity-0 group-hover:opacity-100 transition duration-500"></div>
                        </div>
                        <p className="text-default-500 text-lg leading-relaxed max-w-2xl">
                            {agent?.description || 'Agent Description'}
                        </p>
                        <div className="flex flex-wrap gap-3 mt-6 justify-center md:justify-start">
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
                                {successRate?.toFixed(2) || '0.00'}% Success Rate
                            </Chip>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-8 flex justify-center md:justify-start">
                <Button 
                    color="primary" 
                    variant="shadow"
                    className="hover:scale-105 transition-transform"
                    onPress={() => setIsChangePasswordOpen(true)}
                >
                    <span className="icon-lock mr-2" />
                    Change Password
                </Button>
            </div>

            <Modal 
                isOpen={isChangePasswordOpen} 
                onClose={() => setIsChangePasswordOpen(false)}
                placement="center"
            >
                <ModalContent>
                    <ModalHeader>Change Password</ModalHeader>
                    <ModalBody>
                        <Input
                            type="password"
                            label="Current Password"
                            value={passwords.currentPassword}
                            onChange={(e) => setPasswords(prev => ({...prev, currentPassword: e.target.value}))}
                        />
                        <Input
                            type="password"
                            label="New Password"
                            value={passwords.newPassword}
                            onChange={(e) => setPasswords(prev => ({...prev, newPassword: e.target.value}))}
                        />
                        <Input
                            type="password"
                            label="Confirm New Password"
                            value={passwords.confirmPassword}
                            onChange={(e) => setPasswords(prev => ({...prev, confirmPassword: e.target.value}))}
                        />
                    </ModalBody>
                    <ModalFooter>
                        <Button
                            color="danger"
                            variant="flat"
                            onPress={() => setIsChangePasswordOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            color="primary"
                            onPress={handleChangePassword}
                            isLoading={isSubmitting}
                        >
                            Change Password
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </>
    );
};

export default AgentProfile;