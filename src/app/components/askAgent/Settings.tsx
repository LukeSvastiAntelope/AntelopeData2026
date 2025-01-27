import { CATEGORIES, AGENT_RISK_LEVEL } from "@/app/utils/const";
import { IAskAgentProps } from "@/app/utils/interface";
import { convertDaysToYMD } from "@/app/utils/lib";
import { Button, Chip, Input, Select, SelectItem, Tooltip, Switch } from "@heroui/react";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { useFetch } from "@/app/utils/lib";

const Settings = ({ agentProfile, setAgentProfile }: IAskAgentProps) => {
    const [newInterest, setNewInterest] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [resolutionDate, setResolutionDate] = useState<{ years: number, months: number, days: number }>(convertDaysToYMD(agentProfile?.maxTimelineLimit || 0));
    const fetch = useFetch();
    const addInterest = () => {
        if (newInterest) {
            setAgentProfile(prev => (prev ? { ...prev, interests: [...prev.interests, newInterest] } : null));
            setNewInterest('');
        }
    }

    const updateAgentProfile = async () => {
        setIsSaving(true);
        try {
            await fetch.post(`/api/updateAgentStrategy`, {
                agent: agentProfile
            });
            toast.success("Agent strategy updated");
        } catch (error) {
            console.error("Error updating agent strategy:", error);
            toast.error("Error updating agent strategy");
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <div className="flex flex-col h-full w-full">
            <div className="flex flex-col gap-4 border border-white/10 rounded-xl p-4">
                <div className="text-xl font-regular flex flex-row justify-between">
                    <div className="text-sm font-regular">Betting Category</div>
                    <div className="flex flex-row justify-between items-center gap-2">
                        <Tooltip
                            content={
                                agentProfile?.is_bet
                                    ? "Agent's automated betting is currently enabled"
                                    : "Agent's automated betting is currently disabled"
                            }
                            showArrow
                        >
                            <div>
                                <p className="text-default-500 text-small">
                                    {agentProfile?.is_bet ? "Betting is currently enabled" : "Betting is currently disabled"}
                                </p>
                            </div>
                        </Tooltip>
                        <Switch
                            isSelected={agentProfile?.is_bet}
                            onValueChange={() => {
                                setAgentProfile(prev => (prev ? { ...prev, is_bet: !prev.is_bet } : null));
                            }}
                            color="success"
                            size="sm"
                        />
                    </div>
                </div>
                <div className="flex gap-4">
                    <div className="flex flex-col gap-2">
                        <div className="text-sm font-regular">Main Category</div>
                        <Select
                            variant="bordered"
                            className="w-[200px]"
                            defaultSelectedKeys={[agentProfile?.category?.toLowerCase() || '']}
                            onChange={(e) => setAgentProfile(prev => (prev ? { ...prev, category: e.target.value } : null))}
                        >
                            {CATEGORIES.map((category) => (
                                <SelectItem key={category.toLowerCase()}>{category}</SelectItem>
                            ))}
                        </Select>
                    </div>

                </div>
                <div className="flex flex-col gap-2">
                    <div className="text-sm font-regular">Category interests</div>
                    <div className="flex flex-wrap gap-2 mb-4">
                        {agentProfile?.interests && agentProfile?.interests.length > 0 && agentProfile?.interests.map((interest) => (
                            <Chip
                                key={interest}
                                onClose={() => setAgentProfile(prev => (prev ? { ...prev, interests: prev.interests.filter(i => i !== interest) } : null))}
                                variant="flat"
                            >
                                {interest}
                            </Chip>
                        ))}
                    </div>
                    <Input
                        label="Add Interest"
                        placeholder="Enter new interest"
                        variant="bordered"
                        value={newInterest}
                        onChange={(e) => setNewInterest(e.target.value)}
                        endContent={
                            <Button size="sm" onPress={addInterest}>Add</Button>
                        }
                        aria-label="Add new interest"
                    />
                </div>

            </div>

            <div className="flex flex-col gap-2 border border-white/10 rounded-xl p-4 my-8">
                <div className="text-xl font-regular">Preferred Bet Horizon</div>
                <div className="text-sm font-regular">Select</div>
                <div className="flex gap-4">
                    <Input
                        label="Years"
                        type="number"
                        variant="bordered"
                        value={resolutionDate?.years?.toString() || '0'}
                        onChange={(e) => {
                            const years = parseInt(e.target.value);
                            const totalDays = (years * 365) + (resolutionDate?.months || 0) * 30 + (resolutionDate?.days || 0);
                            setAgentProfile(prev => (prev ? { ...prev, maxTimelineLimit: totalDays } : null));
                            setResolutionDate(prev => ({ ...prev, years }));
                        }}
                        aria-label="Resolution timeline in years"
                    />
                    <Input
                        label="Months"
                        type="number"
                        variant="bordered"
                        value={resolutionDate?.months?.toString() || '0'}
                        onChange={(e) => {
                            const months = parseInt(e.target.value);
                            const totalDays = ((resolutionDate?.years || 0) * 365) + (months * 30) + (resolutionDate?.days || 0);
                            setAgentProfile(prev => (prev ? { ...prev, maxTimelineLimit: totalDays } : null));
                            setResolutionDate(prev => ({ ...prev, months }));
                        }}
                        min={0}
                        aria-label="Resolution timeline in months"
                    />
                    <Input
                        label="Days"
                        type="number"
                        variant="bordered"
                        value={resolutionDate?.days?.toString() || '0'}
                        onChange={(e) => {
                            const days = parseInt(e.target.value);
                            const totalDays = ((resolutionDate?.years || 0) * 365) + ((resolutionDate?.months || 0) * 30) + days;
                            setAgentProfile(prev => (prev ? { ...prev, maxTimelineLimit: totalDays } : null));
                            setResolutionDate(prev => ({ ...prev, days }));
                        }}
                        min={0}
                        aria-label="Resolution timeline in days"
                    />
                </div>
            </div>

            <div className="flex flex-col gap-4 border border-white/10 rounded-xl p-4">
                <div className="text-xl font-regular">Risk Profile</div>
                <div className="flex flex-col gap-2">
                    <div className="text-sm font-regular">Max Betting Size</div>
                    <Input
                        type="number"
                        endContent={<span className="text-default-400">credits</span>}
                        variant="bordered"
                        value={agentProfile?.maxBetSize?.toString() || '0'}
                        onChange={(e) => setAgentProfile(prev => (prev ? { ...prev, maxBetSize: parseInt(e.target.value) } : null))}
                        min={0}
                        aria-label="Maximum bet size in credits"
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <div className="text-sm font-regular">Default</div>
                    <Select
                        variant="bordered"
                        className="w-[200px]"
                        defaultSelectedKeys={[agentProfile?.riskLevel || '']}
                        onChange={(e) => setAgentProfile(prev => (prev ? { ...prev, riskLevel: e.target.value } : null))}
                    >
                        {AGENT_RISK_LEVEL.map((level: string) => (
                            <SelectItem key={level}>{level}</SelectItem>
                        ))}
                    </Select>
                </div>
                <div className="text-sm font-regular">Betting Size</div>
                <div className="flex gap-4">
                    <Input
                        label="Conservative Bet Size"
                        type="number"
                        endContent={<span className="text-default-400">credits</span>}
                        variant="bordered"
                        value={agentProfile?.conservativeBetSize?.toString() || '0'}
                        onChange={(e) => setAgentProfile(prev => (prev ? { ...prev, conservativeBetSize: parseInt(e.target.value) } : null))}
                        min={0}
                        aria-label="Conservative bet size in credits"
                    />
                    <Input
                        label="Moderate Bet Size"
                        type="number"
                        endContent={<span className="text-default-400">credits</span>}
                        variant="bordered"
                        value={agentProfile?.moderateBetSize?.toString() || '0'}
                        onChange={(e) => setAgentProfile(prev => (prev ? { ...prev, moderateBetSize: parseInt(e.target.value) } : null))}
                        min={0}
                        aria-label="Moderate bet size in credits"
                    />
                    <Input
                        label="Aggressive Bet Size"
                        type="number"
                        endContent={<span className="text-default-400">credits</span>}
                        variant="bordered"
                        value={agentProfile?.aggressiveBetSize?.toString() || '0'}
                        onChange={(e) => setAgentProfile(prev => (prev ? { ...prev, aggressiveBetSize: parseInt(e.target.value) } : null))}
                        min={0}
                        aria-label="Aggressive bet size in credits"
                    />
                </div>
            </div>

            <Button className="mt-4" onPress={updateAgentProfile} isLoading={isSaving}>Save</Button>
        </div>
    );
}

export default Settings;