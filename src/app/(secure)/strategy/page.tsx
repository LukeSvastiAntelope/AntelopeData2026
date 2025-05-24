'use client';

import { useState, useEffect, Suspense } from "react";
import toast from "react-hot-toast";
import { IAgentProfile } from "@/app/utils/interface";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Research from "@/app/components/askAgent/Research";
import Train from "@/app/components/askAgent/Train";
import Settings from "@/app/components/askAgent/Settings";
import { useAgent } from "@/app/context/AgentContext";
import Profile from "@/app/components/askAgent/Profile";
import Monitor from "@/app/components/askAgent/Monitor";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

const AskAgent = () => {
  const searchParams = useSearchParams();
  const receiveMode = searchParams.get("mode") || "research";
  const [mode, setMode] = useState(receiveMode);
  const [agentProfile, setAgentProfile] = useState<IAgentProfile | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { agent } = useAgent();
  const [newInterest, setNewInterest] = useState("");
  const [selectedHorizon, setSelectedHorizon] = useState("Months");

  const modeList = [
    {
      key: "research",
      value: "Research",
      content: <Research agentProfile={agentProfile} setAgentProfile={setAgentProfile} />
    },
    {
      key: "profile",
      value: "Profile",
      content: <Profile agentProfile={agentProfile} setAgentProfile={setAgentProfile} />
    },
    {
      key: "monitor",
      value: "Monitor",
      content: <Monitor agentProfile={agentProfile} setAgentProfile={setAgentProfile} />
    },
    {
      key: "train",
      value: "Train",
      content: <Train agentProfile={agentProfile} setAgentProfile={setAgentProfile} />
    },
    {
      key: "settings",
      value: "Settings",
      content: <Settings agentProfile={agentProfile} setAgentProfile={setAgentProfile} />
    }
  ];

  // Fetch Agent Profile on mount
  useEffect(() => {
    const loadAgentProfile = async (agent: IAgentProfile) => {
      try {
        setAgentProfile(agent);
        if (
          agent.interests.length == 0 ||
          agent.principles.length == 0 ||
          Number(agent.maxBetSize) == 0 ||
          Number(agent.conservativeBetSize) == 0 ||
          Number(agent.moderateBetSize) == 0 ||
          Number(agent.aggressiveBetSize) == 0
        ) {
          toast.error("Agent is not ready yet. Please set the strategy first.");
          return;
        }
      } catch (error) {
        console.error("Error fetching agent profile:", error);
        toast.error("Cannot load agent profile");
      }
    };
    if (agent) {
      loadAgentProfile(agent);
    }
  }, [agent]);

  const handleAddInterest = () => {
    if (newInterest && agentProfile) {
      // Add the new interest to the profile
      const updatedInterests = [...(agentProfile.interests || []), newInterest];
      setAgentProfile({ ...agentProfile, interests: updatedInterests });
      setNewInterest("");
    }
  };

  const handleRemoveInterest = (interest: string) => {
    if (agentProfile) {
      const updatedInterests = agentProfile.interests.filter(i => i !== interest);
      setAgentProfile({ ...agentProfile, interests: updatedInterests });
    }
  };

  return (
    <div className="flex-1 p-2 w-full">
      <div className="mx-auto rounded-lg bg-black text-card-foreground shadow-lg">
        {/* Header */}
        <div className="px-6 py-3">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-zinc-400 hover:text-zinc-100" />
            <div className="h-4 border-l border-zinc-800 mx-4" />
            <h1 className="text-base font-medium">Strategy & Research</h1>
          </div>
        </div>
        
        <div className="border-b border-zinc-800" />

        <div className="flex">
          {/* Main Content */}
          <div className={cn(
            "flex-1 p-6",
            isCollapsed ? "w-[calc(100%-50px)]" : "w-[calc(100%-350px)]"
          )}>
            {/* Tabs Container */}
            {agentProfile && (
              <Tabs value={mode} onValueChange={setMode} className="w-full">
                <TabsList className="w-full justify-start gap-2 bg-transparent p-0">
                  {modeList.map((tab) => (
                    <TabsTrigger
                      key={tab.key}
                      value={tab.key}
                      className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100"
                    >
                      {tab.value}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {modeList.map((tab) => (
                  <TabsContent key={tab.key} value={tab.key} className="mt-6">
                    {tab.content}
                  </TabsContent>
                ))}
              </Tabs>
            )}
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
              isCollapsed ? "w-[50px]" : "w-[350px]"
            )}>
              {!isCollapsed && (
                <div className="p-6">
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium">Strategy Settings</h3>
                      <p className="text-sm text-muted-foreground">
                        Your agent&apos;s strategy configuration and preferences.
                      </p>
                    </div>
                    <Separator />
                    {agentProfile && (
                      <div className="space-y-6">
                        <Card>
                          <CardHeader>
                            <CardTitle>Category & Focus</CardTitle>
                            <CardDescription>
                              Primary focus area and specialization
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="space-y-2.5">
                              <Label className="text-sm font-medium">Category</Label>
                              <div className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm ring-offset-background">
                                <span className="text-foreground">
                                  {agentProfile.category || "Not set"}
                                </span>
                              </div>
                            </div>
                            {agentProfile.category === "Sports" && agentProfile.sport_preference && (
                              <div className="space-y-2.5">
                                <Label className="text-sm font-medium">Sport</Label>
                                <div className="flex h-10 w-full rounded-md border border-input  px-3 py-2 text-sm ring-offset-background">
                                  <span className="text-foreground">
                                    {agentProfile.sport_preference}
                                  </span>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <CardTitle>Risk Profile</CardTitle>
                            <CardDescription>
                              Risk tolerance and betting preferences
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="space-y-2.5">
                              <Label className="text-sm font-medium">Risk Level</Label>
                              <div className="flex h-10 w-full rounded-md border border-input  px-3 py-2 text-sm ring-offset-background">
                                <span className="text-foreground">
                                  {agentProfile.riskLevel || "Not set"}
                                </span>
                              </div>
                            </div>
                            <div className="space-y-2.5">
                              <Label className="text-sm font-medium">Bet Sizes</Label>
                              <div className="grid grid-cols-3 gap-4">
                                <div className="flex flex-col rounded-md border border-input  p-3 text-sm ring-offset-background">
                                  <span className="text-xs text-muted-foreground mb-1">Small</span>
                                  <span className="text-foreground font-medium">
                                    {agentProfile.conservativeBetSize || 0}%
                                  </span>
                                </div>
                                <div className="flex flex-col rounded-md border border-input  p-3 text-sm ring-offset-background">
                                  <span className="text-xs text-muted-foreground mb-1">Medium</span>
                                  <span className="text-foreground font-medium">
                                    {agentProfile.moderateBetSize || 0}%
                                  </span>
                                </div>
                                <div className="flex flex-col rounded-md border border-input  p-3 text-sm ring-offset-background">
                                  <span className="text-xs text-muted-foreground mb-1">Large</span>
                                  <span className="text-foreground font-medium">
                                    {agentProfile.aggressiveBetSize || 0}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        {agentProfile.interests && agentProfile.interests.length > 0 && (
                          <Card>
                            <CardHeader>
                              <CardTitle>Interests</CardTitle>
                              <CardDescription>
                                Specific areas of focus within the category
                              </CardDescription>
                            </CardHeader>
                            <CardContent>
                              <div className="flex h-auto w-full rounded-md border border-input bg-background p-3 text-sm ring-offset-background">
                                <div className="flex flex-wrap gap-1.5">
                                  {agentProfile.interests.map((interest) => (
                                    <span 
                                      key={interest}
                                      className="inline-flex items-center rounded-md bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground"
                                    >
                                      {interest}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl mb-4 text-gray-600">Loading...</h1>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto" />
        </div>
      </div>
    }>
      <AskAgent />
    </Suspense>
  );
}