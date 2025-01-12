'use client';

import { useState, useRef, useEffect } from "react";
import { Button } from "@nextui-org/button";
import { Textarea } from "@nextui-org/input";
import { useFetch } from "@/app/utils/lib";
import toast from "react-hot-toast";
import { IAgentProfile } from "@/app/utils/interface";
import Image from "next/image";

interface ChatMessage {
  role: "user" | "agent";
  content: string;
}

export default function AskAgent() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agentProfile, setAgentProfile] = useState<IAgentProfile | null>(null);

  const fetch = useFetch();
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch Agent Profile on mount, so we have the agent's name, category, image, etc.
  useEffect(() => {
    const loadAgentProfile = async () => {
      try {
        const response = await fetch.get("/api/getAgentProfile");
        if (response.status) {
          setAgentProfile(response.agent);
        } else {
          toast.error(response.message || "Failed to get agent info.");
        }
      } catch (error) {
        console.error("Error fetching agent profile:", error);
        toast.error("Cannot load agent profile");
      }
    };
    loadAgentProfile();
  }, [fetch]);

  // Auto-scroll to the bottom whenever messages change
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) {
      toast.error("Please enter a question");
      return;
    }

    const userQuestion = input.trim();
    setInput("");

    // 1) Add the user’s message to the chat
    setMessages((prev) => [...prev, { role: "user", content: userQuestion }]);

    setIsLoading(true);
    try {
      // 2) Send userQuestion + agentProfile to the backend
      const body = {
        userQuestion,
        agentProfile, // Includes name, image, category, risk, etc.
      };
      const response = await fetch.post("/api/askAgent", body);
      if (response.status) {
        // 3) Add agent’s message to the chat
        setMessages((prev) => [...prev, { role: "agent", content: response.answer }]);
      } else {
        toast.error(response.message || "Failed to get answer");
      }
    } catch (error) {
      console.error("Error asking agent:", error);
      toast.error("Failed to communicate with agent");
    } finally {
      setIsLoading(false);
    }
  };

  // Capture Enter key to trigger handleSend (except when shift + enter is pressed)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="p-4 shadow-sm flex items-center gap-4">
        {agentProfile?.image && (
          <Image
            src={agentProfile.image}
            alt={agentProfile?.name || "Agent"}
            width={48}
            height={48}
            className="rounded-full"
          />
        )}
        <div>
          <h1 className="text-2xl font-bold">
            {agentProfile?.name ? `Ask ${agentProfile.name}` : "Ask Your Agent"}
          </h1>
          {agentProfile && (
            <p className="text-default-500 text-sm mt-1">
              Category: {agentProfile.category}, Risk: {agentProfile.riskLevel}
            </p>
          )}
        </div>
      </div>

      {/* Chat Container (no extra background color) */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`max-w-xl px-4 py-2 rounded-md ${
              msg.role === "user"
                ? "bg-primary/10 self-end"
                : "bg-default-200 self-start"
            }`}
            style={{ whiteSpace: "pre-wrap" }}
          >
            <p className="text-default-600">
              <strong>
                {msg.role === "user"
                  ? "You"
                  : agentProfile?.name || "Agent"}
                :
              </strong>{" "}
              {msg.content}
            </p>
          </div>
        ))}
      </div>

      {/* Fixed Bottom Input Area */}
      <div className="border-t p-4 flex items-end gap-2 bg-default-50 sticky bottom-0">
        <Textarea
          label=""
          placeholder="Type your question..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full"
          minRows={1}
          maxRows={4}
        />
        <Button color="primary" onPress={handleSend} isLoading={isLoading}>
          Send
        </Button>
      </div>
    </div>
  );
} 