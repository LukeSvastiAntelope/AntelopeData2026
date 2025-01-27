'use client';

import { useState, useEffect } from "react";
import { useFetch } from "@/app/utils/lib";
import toast from "react-hot-toast";
import { IAgentProfile } from "@/app/utils/interface";
import { useSearchParams } from "next/navigation";
import { Tabs, Tab } from "@heroui/tabs";
import Research from "@/app/components/askAgent/Research";
import Train from "@/app/components/askAgent/Train";
import Principles from "@/app/components/askAgent/Principles";
import Settings from "@/app/components/askAgent/Settings";

export default function AskAgent() {
  const fetch = useFetch();
  const searchParams = useSearchParams();
  const receiveMode = searchParams.get("mode") || "conversation";
  const [mode, setMode] = useState(receiveMode);
  const [agentProfile, setAgentProfile] = useState<IAgentProfile | null>(null);
  const modeList = [
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
      key: "principles",
      value: "Principles",
      content: <Principles agentProfile={agentProfile} setAgentProfile={setAgentProfile} />
    },
    {
      key: "settings",
      value: "Settings",
      content: <Settings agentProfile={agentProfile} setAgentProfile={setAgentProfile} />
    }
  ]

  // Fetch Agent Profile on mount, so we have the agent's name, category, image, etc.
  useEffect(() => {
    const loadAgentProfile = async () => {
      try {
        const response = await fetch.get("/api/getAgentProfile");
        if (response.status) {
          setAgentProfile(response.agent);
          if (
            response.agent.interests.length == 0 ||
            response.agent.principles.length == 0 ||
            Number(response.agent.maxBetSize) == 0 ||
            Number(response.agent.conservativeBetSize) == 0 ||
            Number(response.agent.moderateBetSize) == 0 ||
            Number(response.agent.aggressiveBetSize) == 0
          ) {
            toast.error("Agent is not ready yet. Please set the strategy first.");
            return;
          }
        } else {
          toast.error(response.message || "Failed to get agent info.");
        }
      } catch (error) {
        console.error("Error fetching agent profile:", error);
        toast.error("Cannot load agent profile");
      }
    };
    loadAgentProfile();
  }, []);

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
    </div>
  );
} 