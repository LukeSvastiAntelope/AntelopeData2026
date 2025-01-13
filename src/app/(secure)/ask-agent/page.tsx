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

    // 2) Show the "thinking" state
    setIsLoading(true);

    try {
      // 3) Send userQuestion + agentProfile to the backend
      const body = {
        userQuestion,
        agentProfile, // Includes name, image, category, risk, etc.
      };
      const response = await fetch.post("/api/askAgent", body);
      if (response.status) {
        // 4) Add agent’s message to the chat
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
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-[calc(100vh-65px)] flex flex-col">
      {/* Header */}
      <div className="p-2 shadow-sm flex items-center gap-4">
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
          <h1 className="text-xl font-kodemono">
            {agentProfile?.name ? `Ask ${agentProfile.name}` : "Ask Your Agent"}
          </h1>
          {agentProfile && (
            <p className="text-default-500 text-sm mt-0">
              Category: {agentProfile.category}, Risk: {agentProfile.riskLevel}
            </p>
          )}
        </div>
      </div>

      {/* Chat Container (no extra background color) */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-2 space-y-4 text-small"
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-default-400">Ask the agent any question about, previous bets, strategy, etc.</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={index}
                className={`max-w-xl px-2 py-2 rounded-md ${
                  isUser ? "bg-primary/20 self-end" : "bg-gray-800 self-start"
                }`}
                style={{ whiteSpace: "pre-wrap" }}
              >
                <p
                  className={
                    isUser ? "text-primary-600 px-2" : "text-white p-2"
                  }
                >
                  <strong>
                    {isUser ? "You" : agentProfile?.name || "Agent"}:
                  </strong>{" "}
                  {msg.content}
                </p>
              </div>
            );
          })
        )}
        {/* If the agent is "thinking," show a loader bubble */}
        {isLoading && (
          <div className="max-w-xl px-4 py-2 rounded-md bg-default-200 self-start">
            <p className="text-default-600">
              <strong>{agentProfile?.name || "Agent"}:</strong> 
              <span className="ml-2 animate-pulse">Thinking...</span>
            </p>
          </div>
        )}
      </div>

      {/* Fixed Bottom Input Area */}
      <div className="p-2 flex items-end gap-2 bg-default-50 sticky bottom-0">
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
        <Button
          color="primary"
          onPress={handleSend}
          isDisabled={isLoading}
        >
          Send
        </Button>
      </div>
    </div>
  );
} 