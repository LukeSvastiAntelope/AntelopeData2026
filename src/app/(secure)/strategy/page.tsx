'use client';

import { useState, useEffect, Suspense } from "react";
import toast from "react-hot-toast";
import { IAgentProfile } from "@/app/utils/interface";
import { useSearchParams } from "next/navigation";
import { Tabs, Tab } from "@heroui/tabs";
import Research from "@/app/components/askAgent/Research";
import Train from "@/app/components/askAgent/Train";
import Settings from "@/app/components/askAgent/Settings";
import { useAgent } from "@/app/context/AgentContext";
import Profile from "@/app/components/askAgent/Profile";
import Monitor from "@/app/components/askAgent/Monitor";

const AskAgent = () => {
  const searchParams = useSearchParams();
  const receiveMode = searchParams.get("mode") || "profile";
  const [mode, setMode] = useState(receiveMode);
  const [agentProfile, setAgentProfile] = useState<IAgentProfile | null>(null);
  const { agent } = useAgent();

  const modeList = [
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
      key: "conversation",
      value: "Research",
      content: <Research agentProfile={agentProfile} setAgentProfile={setAgentProfile} />
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
  ]

  // Fetch Agent Profile on mount, so we have the agent's name, category, image, etc.
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

  return (
    <div className="h-[calc(100vh-65px)] flex flex-col">
      {/* Header */}
      <div className="py-2 shadow-sm flex items-center gap-4">
        <div className="flex items-center w-full justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-kodemono">
              Strategy & Research
            </h1>
          </div>
        </div>
      </div>

      {/* Chat Container (no extra background color) */}
      {agentProfile && (
        <Tabs
          aria-label="Mode"
          selectedKey={mode}
          onSelectionChange={(key) => setMode(key as string)}
          disableCursorAnimation
          classNames={{
            base: "my-4 font-kodemono",
            tabList: "bg-transparent p-0 gap-4",
            cursor: "bg-transparent shadow-none",
            tab: "bg-transparent data-[selected=true]:bg-transparent"
          }}
        >
          {modeList.map((mode) => (
            <Tab
              key={mode.key}
              title={mode.value}
              className="flex-auto flex flex-col px-0 mx-0"
            >
              {mode.content}
            </Tab>
          ))}
        </Tabs>
      )}
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