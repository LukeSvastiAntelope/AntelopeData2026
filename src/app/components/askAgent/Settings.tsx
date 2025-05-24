import { CATEGORIES, SPORTS_CATEGORIES, AGENT_RISK_LEVEL } from "@/app/utils/const";
import { IAskAgentProps } from "@/app/utils/interface";
import { convertDaysToYMD } from "@/app/utils/lib";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { useFetch } from "@/app/utils/lib";
import { useAgent } from "@/app/context/AgentContext";
import { X } from "lucide-react";

const Settings = ({ agentProfile, setAgentProfile }: IAskAgentProps) => {
    const [newInterest, setNewInterest] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [resolutionDate, setResolutionDate] = useState<{ years: number, months: number, days: number }>(
        convertDaysToYMD(agentProfile?.maxTimelineLimit || 5) // Default to 5 days if no value
    );

    const fetch = useFetch();
    const { setAgent } = useAgent();

    // Set default values when component mounts
    useEffect(() => {
        if (agentProfile && !agentProfile.maxTimelineLimit) {
            setAgentProfile(prev => prev ? { ...prev, maxTimelineLimit: 5 } : null);
            setResolutionDate({ years: 0, months: 0, days: 5 });
        }
    }, []);

    const addInterest = () => {
        if (newInterest) {
            setAgentProfile(prev => (prev ? { ...prev, interests: [...(prev.interests || []), newInterest] } : null));
            setNewInterest('');
        }
    }

    const updateAgentProfile = async () => {
        if (!agentProfile?.category) {
            toast.error("Please select a topic");
            return;
        }

        if (agentProfile.category === 'Sports' && !agentProfile.sport_preference) {
            toast.error("Please select a specific sport");
            return;
        }

        setIsSaving(true);
        try {
            const response = await fetch.post(`/api/updateAgentStrategy`, {
                agent: agentProfile
            });
            if (response.status) {
                setAgent(agentProfile);
                toast.success("Strategy settings updated");
            } else {
                toast.error(response.message);
            }
        } catch (error) {
            console.error("Error updating strategy settings:", error);
            toast.error("Error updating strategy settings");
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <div className="space-y-8">
            {/* 1. Topic Section */}
            <div className="space-y-4 border border-zinc-800 rounded-lg p-6">
                <div className="space-y-1.5">
                    <h2 className="text-lg font-semibold">Topic</h2>
                </div>
                <div className="space-y-4">
                    <div className="flex flex-col gap-2">
                        <div className="text-sm font-medium">Main Topic</div>
                        <Select
                            value={agentProfile?.category || ''}
                            onValueChange={(value) => setAgentProfile(prev => (prev ? { ...prev, category: value } : null))}
                        >
                            <SelectTrigger className="w-[200px]">
                                <SelectValue placeholder="Select a topic" />
                            </SelectTrigger>
                            <SelectContent>
                                {CATEGORIES.map((category) => (
                                    <SelectItem key={category} value={category}>
                                        {category}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Sports subcategory */}
                    {agentProfile?.category === 'Sports' && (
                        <div className="flex flex-col gap-2">
                            <div className="text-sm font-medium">Specific Sport</div>
                            <Select
                                value={agentProfile?.sport_preference || ''}
                                onValueChange={(value) => setAgentProfile(prev => (prev ? { ...prev, sport_preference: value } : null))}
                            >
                                <SelectTrigger className="w-[200px]">
                                    <SelectValue placeholder="Select a sport" />
                                </SelectTrigger>
                                <SelectContent>
                                    {SPORTS_CATEGORIES.map((sport) => (
                                        <SelectItem key={sport} value={sport}>
                                            {sport}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Topic interests for non-Sports categories */}
                    {agentProfile?.category !== 'Sports' && (
                        <div className="flex flex-col gap-2">
                            <div className="text-sm font-medium">Topic Interests</div>
                            <div className="flex flex-wrap gap-2 mb-4">
                                {agentProfile?.interests && agentProfile?.interests.map((interest) => (
                                    <Badge 
                                        key={interest}
                                        variant="secondary"
                                        className="px-2 py-1 flex items-center gap-1"
                                    >
                                        {interest}
                                        <button
                                            onClick={() => setAgentProfile(prev => (prev ? { 
                                                ...prev, 
                                                interests: prev.interests.filter(i => i !== interest) 
                                            } : null))}
                                            className="ml-1 hover:text-destructive"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Add a topic interest"
                                    value={newInterest}
                                    onChange={(e) => setNewInterest(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && addInterest()}
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
                </div>
            </div>

            {/* 2. Preferred Bet Horizon */}
            <div className="space-y-4 border border-zinc-800 rounded-lg p-6">
                <div className="space-y-1.5">
                    <h2 className="text-lg font-semibold">Preferred Bet Horizon</h2>
                </div>
                <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <div className="text-sm font-medium">Years</div>
                        <Input
                            type="number"
                            value={resolutionDate?.years?.toString() || '0'}
                            onChange={(e) => {
                                const years = parseInt(e.target.value);
                                const totalDays = (years * 365) + (resolutionDate?.months || 0) * 30 + (resolutionDate?.days || 0);
                                setAgentProfile(prev => (prev ? { ...prev, maxTimelineLimit: totalDays } : null));
                                setResolutionDate(prev => ({ ...prev, years }));
                            }}
                            min={0}
                        />
                    </div>
                    <div className="space-y-2">
                        <div className="text-sm font-medium">Months</div>
                        <Input
                            type="number"
                            value={resolutionDate?.months?.toString() || '0'}
                            onChange={(e) => {
                                const months = parseInt(e.target.value);
                                const totalDays = ((resolutionDate?.years || 0) * 365) + (months * 30) + (resolutionDate?.days || 0);
                                setAgentProfile(prev => (prev ? { ...prev, maxTimelineLimit: totalDays } : null));
                                setResolutionDate(prev => ({ ...prev, months }));
                            }}
                            min={0}
                        />
                    </div>
                    <div className="space-y-2">
                        <div className="text-sm font-medium">Days</div>
                        <Input
                            type="number"
                            value={resolutionDate?.days?.toString() || '0'}
                            onChange={(e) => {
                                const days = parseInt(e.target.value);
                                const totalDays = ((resolutionDate?.years || 0) * 365) + ((resolutionDate?.months || 0) * 30) + days;
                                setAgentProfile(prev => (prev ? { ...prev, maxTimelineLimit: totalDays } : null));
                                setResolutionDate(prev => ({ ...prev, days }));
                            }}
                            min={0}
                        />
                    </div>
                </div>
            </div>

            {/* 3. Risk Profile */}
            <div className="space-y-4 border border-zinc-800 rounded-lg p-6">
                <div className="space-y-1.5">
                    <h2 className="text-lg font-semibold">Risk Profile</h2>
                </div>
                <div className="space-y-6">
                    <div className="flex flex-col gap-2">
                        <div className="text-sm font-medium">Risk Level</div>
                        <Select
                            value={agentProfile?.riskLevel || ''}
                            onValueChange={(value) => setAgentProfile(prev => (prev ? { ...prev, riskLevel: value } : null))}
                        >
                            <SelectTrigger className="w-[200px]">
                                <SelectValue placeholder="Select risk level" />
                            </SelectTrigger>
                            <SelectContent>
                                {AGENT_RISK_LEVEL.map((level) => (
                                    <SelectItem key={level} value={level}>
                                        {level}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-4">
                        <div className="text-sm font-medium">Betting Sizes</div>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <div className="text-sm text-muted-foreground">Conservative</div>
                                <Input
                                    type="number"
                                    value={agentProfile?.conservativeBetSize?.toString() || '0'}
                                    onChange={(e) => setAgentProfile(prev => (prev ? { 
                                        ...prev, 
                                        conservativeBetSize: parseInt(e.target.value) 
                                    } : null))}
                                    min={0}
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="text-sm text-muted-foreground">Moderate</div>
                                <Input
                                    type="number"
                                    value={agentProfile?.moderateBetSize?.toString() || '0'}
                                    onChange={(e) => setAgentProfile(prev => (prev ? { 
                                        ...prev, 
                                        moderateBetSize: parseInt(e.target.value) 
                                    } : null))}
                                    min={0}
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="text-sm text-muted-foreground">Aggressive</div>
                                <Input
                                    type="number"
                                    value={agentProfile?.aggressiveBetSize?.toString() || '0'}
                                    onChange={(e) => setAgentProfile(prev => (prev ? { 
                                        ...prev, 
                                        aggressiveBetSize: parseInt(e.target.value) 
                                    } : null))}
                                    min={0}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="text-sm font-medium">Max Betting Size</div>
                        <Input
                            type="number"
                            value={agentProfile?.maxBetSize?.toString() || '0'}
                            onChange={(e) => setAgentProfile(prev => (prev ? { 
                                ...prev, 
                                maxBetSize: parseInt(e.target.value) 
                            } : null))}
                            min={0}
                        />
                    </div>
                </div>
            </div>

            <Button 
                onClick={updateAgentProfile} 
                disabled={isSaving}
                className="w-full"
            >
                {isSaving ? "Saving..." : "Save Settings"}
            </Button>
        </div>
    );
}

export default Settings;