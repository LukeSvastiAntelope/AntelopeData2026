import { IAskAgentProps } from "@/app/utils/interface";
import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { toast } from "react-hot-toast";
import { Select, SelectItem, Button } from "@heroui/react";
import { Switch } from "@heroui/switch";
import { GPT_MODELS as models, PLUGINS as plugins } from "@/app/utils/const";
import * as XLSX from "xlsx";
import { useFetch } from "@/app/utils/lib";
import { useAgent } from "@/app/context/AgentContext";

const Profile = ({ agentProfile, setAgentProfile }: IAskAgentProps) => {

    const [imageUrl, setImageUrl] = useState("");
    const fileRef = useRef<HTMLInputElement | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const { setAgent } = useAgent();
    const fetchData = useFetch();

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

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            // Add size check
            if (file.size > 5000000) { // 5MB
                toast.error("File too large");
                return;
            }

            const compressedBase64 = await compressImage(file);
            setAgentProfile(agent => (agent ? { ...agent, image: 'data:image/jpeg;base64,' + compressedBase64 } : null)); // Add prefix back for display
        } catch (error) {
            console.error('Error compressing image:', error);
            toast.error("Error processing image");
        }
    };

    const downloadPinecone = async () => {
        setIsDownloading(true);
        try {
            const response = await fetchData.get('/api/pinecone');
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(response);
            XLSX.utils.book_append_sheet(wb, ws, "Predictions");
            XLSX.writeFile(wb, "predictions.xlsx");
        } catch (error) {
            console.error("Error downloading excel:", error);
            toast.error("Failed to download excel");
        } finally {
            setIsDownloading(false);
        }
    };

    const saveProfile = async () => {
        setIsSaving(true);
        try {
            const response = await fetchData.post('/api/saveAgentProfile', {
                agent: agentProfile
            });
            if (response.status) {
                setAgent(agentProfile);
                toast.success("Agent profile updated");
            } else {
                toast.error("Error updating agent profile");
            }
        } catch (error) {
            console.error("Error updating agent profile:", error);
            toast.error("Error updating agent profile");
        } finally {
            setIsSaving(false);
        }
    }

    useEffect(() => {
        const updateImage = async (imageUrl: string) => {
            try {
                const file = await fetch(imageUrl).then(res => res.blob());
                if (file.size > 5000000) { // 5MB
                    toast.error("File too large");
                    return;
                }
                const compressedBase64 = await compressImage(file);
                setAgentProfile(agent => (agent ? { ...agent, image: 'data:image/jpeg;base64,' + compressedBase64 } : null)); // Add prefix back for display   
            } catch (error) {
                console.error('Error updating image:', error);
                toast.error("Error updating image");
            }
        }
        updateImage(imageUrl);
    }, [imageUrl]);

    return (
        agentProfile && (
            <div className="flex">
                <div className="w-1/2 flex flex-col pr-[58px]">
                    <div className="text-text-default text-lg">Description</div>
                    <div className="mt-3 flex flex-col gap-2">
                        <label className="text-gray-white text-sm" htmlFor="name">Name</label>
                        <input
                            type="text"
                            className="w-full bg-input-default rounded-md p-2 text-text-default pl-4"
                            name="name"
                            value={agentProfile?.name}
                            onChange={(e) => setAgentProfile({ ...agentProfile, name: e.target.value })}
                        />
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                        <label className="text-gray-white text-sm" htmlFor="description">Short Description</label>
                        <input
                            type="text"
                            className="w-full bg-input-default rounded-md p-2 text-text-default pl-4"
                            name="description"
                            value={agentProfile?.description}
                            onChange={(e) => setAgentProfile({ ...agentProfile, description: e.target.value })}
                        />
                    </div>
                    <div className="mt-5 flex flex-col gap-2">
                        <label className="text-gray-white text-sm" htmlFor="avatar">Avatar</label>
                        <div className="flex gap-6 items-start">
                            <div onClick={() => fileRef.current?.click()} className="overflow-hidden object-cover cursor-pointer !w-20 !h-20 bg-input-default rounded-md relative">
                                {agentProfile.image ? (
                                    <Image
                                        src={agentProfile.image}
                                        alt="Agent Avatar"
                                        width={160}
                                        height={160}
                                        className="object-cover hover:scale-105 duration-200 transition-transform rounded-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20"
                                    />
                                ) : (
                                    <div className="w-20 h-20 flex items-center justify-center text-gray-500 text-6xl bg-input-default rounded-md">
                                        +
                                    </div>
                                )}
                            </div>
                            <input
                                type="text"
                                name="avatar"
                                id="avatar"
                                className="bg-input-default rounded-md text-text-default pl-4 py-2"
                                placeholder="Path to profile image"
                                value={imageUrl}
                                onChange={(e) => setImageUrl(e.target.value)}
                            />
                            <input
                                type="file"
                                accept="image/*"
                                ref={fileRef}
                                className="hidden"
                                onChange={handleImageUpload}
                            />
                        </div>
                    </div>
                    <div className="mt-6 flex flex-col gap-2">
                        <label className="text-gray-white text-sm" htmlFor="principles">Wager Principles</label>
                        <textarea
                            className="w-full bg-input-default rounded-md p-2 text-text-default pl-4 h-[300px]"
                            name="principles"
                            value={agentProfile.principles}
                            placeholder="Enter the reason for you bet so that the agent can learn how you think"
                            onChange={(e) => setAgentProfile({ ...agentProfile, principles: e.target.value })}
                        />
                    </div>
                </div>
                <div className="w-1/2 border-l border-input-default pl-[54px] flex flex-col">
                    <div className="flex flex-col gap-2">
                        <div className="text-text-default text-lg flex items-center gap-2">
                            <Image
                                src={"/assets/images/dropdown.svg"}
                                alt="dropdown"
                                width={16}
                                height={16}
                            />
                            Model
                        </div>
                        <Select
                            defaultSelectedKeys={agentProfile.model}
                            onChange={(e) => {
                                setAgentProfile({ ...agentProfile, model: e.target.value });
                            }}
                            aria-label="Model"
                        >
                            {models.map((model) => (
                                <SelectItem key={model.key} value={model.key}>
                                    {model.label}
                                </SelectItem>
                            ))}
                        </Select>
                    </div>
                    <div className="mt-5 flex flex-col gap-2">
                        <div className="text-text-default text-lg flex items-center gap-2">
                            <Image
                                src={"/assets/images/dropdown.svg"}
                                alt="dropdown"
                                width={16}
                                height={16}
                            />
                            Plugins
                        </div>
                        <div className="flex flex-col gap-3">
                            {
                                plugins.map((plugin) => (
                                    <Switch
                                        key={plugin.key}
                                        value={plugin.key}
                                        isSelected={agentProfile.plugins.includes(plugin.key)}
                                        onChange={(e) => {
                                            const updatedPlugins = [...agentProfile.plugins];
                                            if (e.target.checked) {
                                                updatedPlugins.push(e.target.value);
                                            } else {
                                                const index = updatedPlugins.indexOf(e.target.value);
                                                if (index > -1) {
                                                    updatedPlugins.splice(index, 1);
                                                }
                                            }
                                            setAgentProfile({ ...agentProfile, plugins: updatedPlugins });
                                        }}
                                        aria-label={plugin.label}
                                    >
                                        {plugin.label}
                                    </Switch>
                                ))
                            }
                        </div>
                    </div>
                    <div className="mt-8 flex flex-col gap-2">
                        <div className="text-text-default text-lg flex items-center gap-2">
                            <Image
                                src={"/assets/images/dropdown.svg"}
                                alt="dropdown"
                                width={16}
                                height={16}
                            />
                            Training Files
                        </div>
                        <input type="text" className="w-full bg-input-default rounded-md p-2 text-text-default pl-4" />
                    </div>
                    <div className="mt-4 flex flex-col gap-2">
                        <div className="text-text-default text-lg flex items-center gap-2">
                            <Image
                                src={"/assets/images/dropdown.svg"}
                                alt="dropdown"
                                width={16}
                                height={16}
                            />
                            Knowledge Base
                        </div>
                        <div className="flex text-sm items-center">
                            <div>Pinecone</div>
                            <Button variant="light" size="sm" className="text-text-blue px-0 ml-1 text-sm">View</Button>
                            <Button variant="light" size="sm" className="text-text-blue px-1 text-sm" onPress={downloadPinecone} isLoading={isDownloading}>Download</Button>
                        </div>
                    </div>
                    <Button color="primary" className="w-full mt-4" onPress={saveProfile} isLoading={isSaving}>Save</Button>
                </div>
            </div>
        )
    )
}

export default Profile;