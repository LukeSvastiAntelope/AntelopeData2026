"use client";
import { toast } from "react-hot-toast";
import { ChatMessage, IAskAgentProps } from "@/app/utils/interface";
import { useEffect, useRef, useState } from "react";
import { useFetch } from "@/app/utils/lib";
import { Button } from "@heroui/react";
import { Textarea } from "@heroui/react";

const Research = ({ agentProfile }: IAskAgentProps) => {
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const fetch = useFetch();
    const containerRef = useRef<HTMLDivElement>(null);

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
            const response = await fetch.post("/api/askAgent", body);
            if (response.status) {
                // 4) Add agent's message to the chat
                setMessages((prev) => [...prev, { role: "agent", content: response.answer, type: "ask" }]);
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

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [messages]);

    return (
        <>
            <div
                ref={containerRef}
                className="flex-auto overflow-y-auto p-2 space-y-4 text-small w-full"
            >
                {messages.length === 0 ? (
                    <div className="flex flex-col gap-2 mb-8 border border-white/10 rounded-xl p-6 text-center empty-state place-content-center">
                        <div className="chat-center"></div>
                        <p className="text-gray-400 pb-2 ">
                            Ask your agent any question about, previous bets, strategy or anything that you want to know about your agent.
                        </p>
                    </div>
                ) : (
                    messages.map((msg, index) => {
                        const isUser = msg.role === "user";
                        return (
                            <div
                                key={index}
                                className={`px-2 py-2 rounded-md w-full ${isUser ? "bg-primary/20 self-end" : " self-start"
                                    }`}
                                style={{ whiteSpace: "pre-wrap" }}
                            >
                                <p
                                    className={
                                        isUser ? "text-primary-600 px-2" : "text-white p-2"
                                    }
                                >
                                    {
                                        isUser || msg.type != "training" ?
                                            <strong>
                                                {isUser ? "You" : agentProfile?.name || "Agent"}: {" "}
                                            </strong>
                                            : null
                                    }
                                    {msg.content}
                                </p>
                            </div>
                        );
                    })
                )}

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
                    placeholder="Type your question..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full"
                    minRows={1}
                    maxRows={4}
                    aria-label="Type your message to the agent"
                />
                <Button
                    color="primary"
                    onPress={handleSend}
                    isDisabled={isLoading}
                >
                    Send
                </Button>
            </div>
        </>
    );
}

export default Research;