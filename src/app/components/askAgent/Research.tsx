"use client";
import { toast } from "react-hot-toast";
import { ChatMessage, IAskAgentProps } from "@/app/utils/interface";
import { useEffect, useRef, useState } from "react";
import { Textarea } from "@heroui/react";

const Research = ({ agentProfile }: IAskAgentProps) => {
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
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
                className="flex-auto overflow-y-auto px-0 space-y-4 text-small w-full h-[calc(100vh-400px)] mb-5"
            >
                {messages.length === 0 ? (
                    <div className="flex flex-col gap-2 mb-8 border border-white/10 rounded-xl p-6 text-center empty-state place-content-center">
                        <div className="chat-center"></div>
                        <p className="text-gray-400 pb-2 ">
                            Ask your agent anything about previous bets, strategy, or other topics you want more info on.
                        </p>
                    </div>
                ) : (
                    messages.map((msg, index) => {
                        const isUser = msg.role === "user";
                        return (
                            <div
                                key={index}
                                className={`px-0 py-2 rounded-md w-full ${isUser ? "bg-primary/20 self-end" : " self-start"
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
                    <div className="max-w-xl px-0wwwwsdxsX py-2 rounded-md bg-default-200 self-start">
                        <p className="text-default-600">
                            <strong>{agentProfile?.name || "Agent"}:</strong>
                            <span className="ml-2 animate-pulse">Thinking...</span>
                        </p>
                    </div>
                )}
            </div>

            {/* Fixed Bottom Input Area */}
            <div className="py-2 flex items-end bg-default-50 fixed bottom-2 w-full max-w-[800px]">
                <Textarea
                    placeholder="Type your question..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-content0 text-white"
                    minRows={1}
                    maxRows={4}
                    aria-label="Type your message to the agent"
                    endContent={
                        <button
                            onClick={handleSend}
                            disabled={isLoading}
                            className="ml-2 px-4 py-2 icon-send disabled:opacity-50 transition-colors"
                        >
                           
                        </button>
                    }
                />
            </div>
        </>
    );
}

export default Research;