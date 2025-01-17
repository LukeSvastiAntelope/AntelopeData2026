'use client';

import { useState, useRef, useEffect, SetStateAction, Dispatch } from "react";
import { Button } from "@nextui-org/button";
import { Input, Textarea } from "@nextui-org/input";
import { useFetch } from "@/app/utils/lib";
import toast from "react-hot-toast";
import { AutomatedPrediction, IAgentProfile } from "@/app/utils/interface";
import Image from "next/image";
import { useRouter } from "next/navigation";

interface ChatMessage {
  role: "user" | "agent";
  content: string | JSX.Element;
  type: "training" | "ask";
}

interface TrainingMessageProps {
  agent: IAgentProfile;
  setIsTraining: Dispatch<SetStateAction<boolean>>;
  setAgent: Dispatch<SetStateAction<IAgentProfile | null>>;
}

const TrainingMessageComponent = ({ agent, setIsTraining, setAgent }: TrainingMessageProps) => {
  const [isThinking, setIsThinking] = useState(false);
  const [trainingPredictions, setTrainingPredictions] = useState<AutomatedPrediction | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const fetchData = useFetch();
  const [betAmount, setBetAmount] = useState('0');
  const [reason, setReason] = useState<string | null>(null);
  const [choice, setChoice] = useState<string | null>(null);

  const generatePrediction = async () => {
    if (!agent) return;
    if (agent.trainCount == 0) {
      toast.error('Agent training is finished')
      return;
    }
    if (isThinking) {
      return;
    }
    setIsThinking(true)
    try {
      // TODO: Replace with actual API call
      const response = await fetchData.get('/api/createAgentPrediction?agentId=' + agent.id)
      if (response.status) {
        setTrainingPredictions(response.prediction)
        setIsSubmitted(false)
      } else {
        toast.error(response.message)
      }
    } catch (error) {
      console.error('Error generating prediction:', error)
    } finally {
      setIsThinking(false)
    }
  }

  const handleSubmit = async () => {
    if (!trainingPredictions || !agent || !choice || !reason || !betAmount) return
    if (agent.trainCount == 0) {
      toast.error('Agent training is finished')
      return;
    }

    try {
      const result = await fetchData.post('/api/training', {
        predictionId: `prediction-${Date.now()}-${agent?.id}`,
        betAmount: Number(betAmount),
        reasoning: reason,
        agentId: agent.id,
        confidence: 0.8,
        choice: choice,
        question: trainingPredictions.question,
        description: trainingPredictions.description,
        category: trainingPredictions.category,
      });

      if (result.status) {
        toast.success('Training data submitted successfully')
        // Reset form and generate new prediction
        setIsSubmitted(true)
        setBetAmount('0')
        setReason(null)
        setChoice(null)
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error('Error submitting training data:', error)
    }
  }

  const setHandleNewQuestion = () => {
    if (agent.trainCount == 1) {
      toast.error('Agent training is finished')
      return;
    }
    setTrainingPredictions(null);
    setIsSubmitted(false)
    setAgent(prevAgent => prevAgent ? { ...prevAgent, trainCount: prevAgent.trainCount - 1 } : null);
    generatePrediction()
  }

  useEffect(() => {
    generatePrediction();
  }, []);

  return (
    <div className="w-full space-y-4">
      <div className="text-white">Certainly! Let&apos;s dive into some prediction questions related to my field:</div>

      {
        isThinking ? (
          <div className="text-white">Thinking...</div>
        ) : (
          trainingPredictions &&
          <div className="space-y-2">
            <div className="text-white">{6 - agent.trainCount} {trainingPredictions?.question}</div>
            {
              !isSubmitted ?
                <>
                  <div className="flex gap-2">
                    {
                      trainingPredictions.category == "sportDB" ?
                        <>
                          <Button className="bg-success/20 text-success-500 px-4 py-1 rounded-md flex-1 text-center" onPress={() => setChoice(trainingPredictions.event?.home_team || null)}>{trainingPredictions.event?.home_team}</Button>
                          <Button className="bg-[#6820A8] text-white px-4 py-1 rounded-md flex-1 text-center" onPress={() => setChoice(trainingPredictions.event?.away_team || null)}>{trainingPredictions.event?.away_team}</Button>
                          {
                            trainingPredictions.event?.league_id != "4391" && trainingPredictions.event?.league_id != "4387" &&
                            <Button className="bg-[#581C8C] text-white px-4 py-1 rounded-md flex-1 text-center" onPress={() => setChoice("Draw")}>Draw</Button>
                          }
                        </> :
                        <>
                          <Button className="bg-success/20 text-success-500 px-4 py-1 rounded-md flex-1 text-center" onPress={() => setChoice("Yes")}>Yes</Button>
                          <Button className="bg-danger/20 text-danger-500 px-4 py-1 rounded-md flex-1 text-center" onPress={() => setChoice("No")}>No</Button>
                        </>
                    }
                  </div>
                  <div className="space-y-2">
                    <Input type="number" label="Bet Amount" placeholder="Enter bet amount" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} classNames={{
      input: "bg-content1/20 dark:bg-content1/20",
      inputWrapper: "bg-content1/20 dark:bg-content1/20"
    }} />
                  </div>
                  <div className="space-y-2">
                    <Textarea type="text" label="Reason" placeholder="Enter reason" value={reason || ''} onChange={(e) => setReason(e.target.value)} classNames={{
      input: "bg-content1/20 dark:bg-content1/20",
      inputWrapper: "bg-content1/20 dark:bg-content1/20"
    }}  />
                  </div>
                </> :
                <div className="text-white bg-gray-800 p-2 rounded-md w-full">I&apos;ve saved your instructions for question {6 - agent.trainCount}</div>
            }
            {
              !isSubmitted ?
                <Button className="w-full bg-gray-800 text-white py-2 rounded mt-4" onPress={handleSubmit}>Submit</Button> :
                <div className="flex gap-2">
                  <Button className="w-full bg-gray-800 text-white py-2 rounded mt-4" onPress={() => setIsTraining(false)}>Stop Training</Button>
                  <Button className="w-full bg-gray-800 text-white py-2 rounded mt-4" onPress={setHandleNewQuestion}>New Question</Button>
                </div>
            }
          </div>
        )
      }
    </div>
  );
}

export default function AskAgent() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agentProfile, setAgentProfile] = useState<IAgentProfile | null>(null);
  const [isTraining, setIsTraining] = useState(false);

  const fetch = useFetch();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch Agent Profile on mount, so we have the agent's name, category, image, etc.
  useEffect(() => {
    const loadAgentProfile = async () => {
      try {
        const response = await fetch.get("/api/getAgentProfile");
        if (response.status) {
          if (response.agent.interests.length == 0 || response.agent.principles.length == 0) {
            toast.error("Agent is not ready yet. Please set the strategy first.");
            router.push("/strategy");
            return;
          }
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
  }, []);

  // Auto-scroll to the bottom whenever messages change
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!isTraining) {
      setMessages(prevMessages => prevMessages.filter(msg => msg.type !== "training"));
    }
  }, [isTraining]);

  const handleSend = async () => {
    if (!input.trim()) {
      toast.error("Please enter a question");
      return;
    }

    const userQuestion = input.trim();
    setInput("");

    // 1) Add the user’s message to the chat
    setMessages((prev) => [...prev, { role: "user", content: userQuestion, type: "ask" }]);

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

  // Capture Enter key to trigger handleSend (except when shift + enter is pressed)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const setTraining = async () => {
    if (!agentProfile) return;
    setMessages(prevMessages => [...prevMessages,
    {
      role: "user",
      content: "Can you emulate being someone who asks prediction questions about your subject? And I will answer them for you",
      type: "training"
    }
    ]);
    setIsTraining(true);
    setIsLoading(true);
    setTimeout(() => {
      setMessages(prevMessages => [...prevMessages, {
        role: "agent",
        content: <TrainingMessageComponent
          agent={agentProfile}
          setIsTraining={setIsTraining}
          setAgent={setAgentProfile}
        />,
        type: "training"
      }
      ]);
    }, 2000);
    setIsLoading(false);
  }

  return (
    <div className="h-[calc(100vh-65px)] flex flex-col">
      {/* Header */}
      <div className="p-2 shadow-sm flex items-center gap-4">
        <div className="flex items-center w-full justify-between">
          <div className="flex items-center gap-4">
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
          <Button
            className="bg-[#7828C8] text-white text-sm font-normal hover:bg-[#6820A8]"
            isDisabled={isTraining}
            onPress={setTraining}
          >
            Train
          </Button>
        </div>
      </div>

      {/* Chat Container (no extra background color) */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-2 space-y-4 text-small w-full"
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
                className={`px-2 py-2 rounded-md w-full ${isUser ? "bg-primary/20 self-end" : "bg-gray-800 self-start"
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