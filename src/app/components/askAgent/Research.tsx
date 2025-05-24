"use client";
import { toast } from "react-hot-toast";
import { ChatMessage, IAskAgentProps } from "@/app/utils/interface";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const Research = ({ agentProfile }: IAskAgentProps) => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!agentProfile) {
      toast.error("Agent profile not found");
      return;
    }
    if (!input.trim()) {
      toast.error("Please enter a question");
      return;
    }

    const userQuestion = input.trim();
    setInput("");

    setMessages((prev) => [...prev, { role: "user", content: userQuestion, type: "ask" }]);
    setIsLoading(true);

    try {
      const body = {
        userQuestion,
        agentProfileId: agentProfile?.id,
      };

      const token = typeof window !== 'undefined' ? localStorage.getItem("token") ?? "" : "";
      const response = await fetch("/api/askAgent", {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });
      setIsLoading(false);

      if (!response.body) {
        toast.error("Failed to get answer");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // After submitting the user's question, initialize an empty agent message
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: "", type: "ask" }
      ]);

      // Start streaming response data
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        // Update the last agent message by appending the new chunk
        setMessages((prev) => {
          const lastIndex = prev.length - 1;
          const lastMessage = prev[lastIndex];
          if (lastMessage && lastMessage.role === "agent" && lastMessage.type === "ask") {
            const updatedMessage = {
              ...lastMessage,
              content: lastMessage.content + chunk,
            };

            // Replace the last message with the updated one
            const updatedMessages = [...prev];
            updatedMessages[lastIndex] = updatedMessage;
            return updatedMessages;
          }
          return prev;
        });
      }
    } catch (error) {
      console.error("Error asking agent:", error);
      toast.error("Failed to communicate with agent");
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)]">
      <div className="flex-1 relative min-h-0">
        <ScrollArea className="absolute inset-0">
          <div className="space-y-4 p-4 pb-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-8 text-center text-muted-foreground">
                <p className="text-sm">
                  Ask your agent anything about previous bets, strategy, or other topics you want more info on.
                </p>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex gap-3 text-sm",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {message.role === "agent" && (
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={agentProfile?.image || "/assets/images/logo-simple.svg"} />
                      <AvatarFallback>{agentProfile?.name?.[0] || "A"}</AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={cn(
                      "rounded-lg px-4 py-2 max-w-[80%]",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-zinc-800/50 text-foreground"
                    )}
                  >
                    {message.role === "agent" ? (
                      <div className="prose prose-sm prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {String(message.content)}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      message.content
                    )}
                  </div>
                  {message.role === "user" && (
                    <Avatar className="h-8 w-8">
                      <AvatarImage src="/user-avatar.png" />
                      <AvatarFallback>U</AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex gap-3 text-sm justify-start">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={agentProfile?.image || "/assets/images/logo-simple.svg"} />
                  <AvatarFallback>{agentProfile?.name?.[0] || "A"}</AvatarFallback>
                </Avatar>
                <div className="rounded-lg px-4 py-2 bg-zinc-800/50 text-foreground">
                  <span className="animate-pulse">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </div>
      
      <div className="sticky bottom-0 p-4 border-t border-zinc-800 bg-black">
        <div className="flex gap-2">
          <Input
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-zinc-900 border-zinc-800"
            disabled={isLoading}
          />
          <Button 
            onClick={handleSend}
            disabled={isLoading}
            size="icon"
            className="bg-zinc-800 hover:bg-zinc-700"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Research;