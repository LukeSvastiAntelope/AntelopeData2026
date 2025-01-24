'use client';

import { useState, useRef, useEffect, SetStateAction, Dispatch } from "react";
import { Button } from "@nextui-org/button";
import { Input, Textarea } from "@nextui-org/input";
import { useFetch } from "@/app/utils/lib";
import toast from "react-hot-toast";
import { AutomatedPrediction, IAgentProfile } from "@/app/utils/interface";
import Image from "next/image";
import { Select, SelectItem } from "@nextui-org/select";
import { useSearchParams } from "next/navigation";
import { CATEGORIES } from "@/app/utils/const";
import { convertDaysToYMD } from "@/app/utils/lib";
import { Chip } from "@nextui-org/chip";
import EditablePrincipleCard from "@/app/components/EditPrincipleCard";
import { Card, CardBody, CardHeader } from "@nextui-org/card";

interface ChatMessage {
  role: "user" | "agent";
  content: string | JSX.Element;
  type: "training" | "ask" | "strategy";
}

interface TrainingMessageProps {
  agent: IAgentProfile;
  setIsTraining: Dispatch<SetStateAction<boolean>>;
  setAgent: Dispatch<SetStateAction<IAgentProfile | null>>;
}

interface StrategyMessageProps {
  agent: IAgentProfile;
  setAgent: Dispatch<SetStateAction<IAgentProfile | null>>;
  strategyFinish: () => Promise<void>;
  isStrategyLoading: boolean;
}

const TrainingMessageComponent = ({ agent, setIsTraining, setAgent }: TrainingMessageProps) => {
  const [isThinking, setIsThinking] = useState(false);
  const [trainingPredictions, setTrainingPredictions] = useState<AutomatedPrediction | null>(null);
  const [trainingPredictionsList, setTrainingPredictionsList] = useState<AutomatedPrediction[]>([]);
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
        setTrainingPredictions(prev => prev ? {
          ...prev,
          choice: choice,
          reasoning: reason,
          initialStake: Number(betAmount)
        } : null)
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
    if (agent.trainCount == 1 || !trainingPredictions) {
      toast.error('Agent training is finished')
      return;
    }
    setTrainingPredictionsList(prevList => [...prevList, trainingPredictions]);
    setTrainingPredictions(null);
    setIsSubmitted(false)
    setAgent(prevAgent => prevAgent ? { ...prevAgent, trainCount: prevAgent.trainCount - 1 } : null);
    generatePrediction();
  }

  useEffect(() => {
    generatePrediction();
  }, []);

  return (
    <div className="w-full space-y-4">
      <div className="text-white">{agent.name || "Agent"}: Certainly! Let&apos;s dive into some prediction questions related to my field:</div>
      {
        trainingPredictionsList.length > 0 && trainingPredictionsList.map((prediction, index) => (
          <div key={index}>
            <div className="text-white">{6 - agent.trainCount - trainingPredictionsList.length + index} {prediction.question}</div>
            <div className="text-white">{prediction.choice}</div>
            <div className="text-white">{prediction.reasoning}</div>
            <div className="text-white">{prediction.initialStake}</div>
          </div>
        ))
      }
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
                    <Input
                      type="number"
                      label="Bet Amount"
                      placeholder="Enter bet amount"
                      value={betAmount}
                      onChange={(e) => setBetAmount(e.target.value)}
                      classNames={{
                        input: "bg-content1/20 dark:bg-content1/20",
                        inputWrapper: "bg-content1/20 dark:bg-content1/20"
                      }}
                      aria-label="Enter bet amount for training prediction"
                    />
                  </div>
                  <div className="space-y-2">
                    <Textarea
                      type="text"
                      label="Reason"
                      placeholder="Enter reason"
                      value={reason || ''}
                      onChange={(e) => setReason(e.target.value)}
                      classNames={{
                        input: "bg-content1/20 dark:bg-content1/20",
                        inputWrapper: "bg-content1/20 dark:bg-content1/20"
                      }}
                      aria-label="Enter reasoning for training prediction"
                    />
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

const TrainStart = ({ setTrain }: { setTrain: () => void }) => {
  return (
    <div className="flex flex-col gap-2 mb-8 border border-white/10 rounded-xl p-6 text-center empty-state place-content-center">
      <div className="training-center"></div>
      <div className="text-gray-400 pb-2">
        Teach your agent to reason about your subject of interest by breaking down your own reasoning based on relevants bets.
      </div>
      <Button className="w-fit mx-auto" color="primary" variant="flat" onPress={setTrain}>Begin Training</Button>
    </div>
  )
}

const StrategyMessageComponent = ({ agent, setAgent, strategyFinish, isStrategyLoading }: StrategyMessageProps) => {
  const [strategyStep, setStrategyStep] = useState(0);
  const strategyList = ["Update Agent Category", "Update Agent Principles", "Update Agent Risk Level"];

  const BasicStrategy = () => {
    const [resolutionDate, setResolutionDate] = useState<{ years: number, months: number, days: number }>(convertDaysToYMD(agent.maxTimelineLimit));
    const [newInterest, setNewInterest] = useState('');

    const updateAgent = (updates: Partial<IAgentProfile>) => {
      console.log(updates);
      setAgent(prevAgent => {
        if (!prevAgent) return null;
        return { ...prevAgent, ...updates };
      });
    };

    const addInterest = () => {
      if (newInterest.trim() !== '') {
        updateAgent({ interests: [...agent.interests, newInterest] });
        setNewInterest('');
      }
    };

    return (
      <div className="container mx-auto px-4 pt-8">
        <Card className="mb-8 bg-content0">
          <CardHeader className="text-xl font-regular">Basic Settings</CardHeader>
          <CardBody className="space-y-6">
            <Input
              label="Maximum Bet Size"
              type="number"
              endContent={<span className="text-default-400">credits</span>}
              variant="bordered"
              value={agent?.maxBetSize?.toString() || '0'}
              onChange={(e) => updateAgent({ maxBetSize: parseInt(e.target.value) })}
              min={0}
              aria-label="Maximum bet size in credits"
            />
            <Select
              label="Category"
              variant="bordered"
              defaultSelectedKeys={[agent?.category]}
              onChange={(e) => updateAgent({ category: e.target.value })}
            >
              {CATEGORIES.map((category) => (
                <SelectItem key={category.toLowerCase()}>{category}</SelectItem>
              ))}
            </Select>

            <div className="flex flex-col gap-2">
              <div className="flex gap-4">
                <Input
                  label="Years"
                  type="number"
                  variant="bordered"
                  value={resolutionDate?.years?.toString() || '0'}
                  onChange={(e) => {
                    const years = parseInt(e.target.value);
                    const totalDays = (years * 365) + (resolutionDate?.months || 0) * 30 + (resolutionDate?.days || 0);
                    updateAgent({ maxTimelineLimit: totalDays });
                    setResolutionDate(prev => ({ ...prev, years }));
                  }}
                  aria-label="Resolution timeline in years"
                />
                <Input
                  label="Months"
                  type="number"
                  variant="bordered"
                  value={resolutionDate?.months?.toString() || '0'}
                  onChange={(e) => {
                    const months = parseInt(e.target.value);
                    const totalDays = ((resolutionDate?.years || 0) * 365) + (months * 30) + (resolutionDate?.days || 0);
                    updateAgent({ maxTimelineLimit: totalDays });
                    setResolutionDate(prev => ({ ...prev, months }));
                  }}
                  min={0}
                  aria-label="Resolution timeline in months"
                />
                <Input
                  label="Days"
                  type="number"
                  variant="bordered"
                  value={resolutionDate?.days?.toString() || '0'}
                  onChange={(e) => {
                    const days = parseInt(e.target.value);
                    const totalDays = ((resolutionDate?.years || 0) * 365) + ((resolutionDate?.months || 0) * 30) + days;
                    updateAgent({ maxTimelineLimit: totalDays });
                    setResolutionDate(prev => ({ ...prev, days }));
                  }}
                  min={0}
                  aria-label="Resolution timeline in days"
                />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="mb-8 bg-content0">
          <CardHeader className="text-xl font-regular">Interests</CardHeader>
          <CardBody>
            <div className="flex flex-wrap gap-2 mb-4">
              {agent.interests && agent.interests.length > 0 && agent.interests.map((interest) => (
                <Chip
                  key={interest}
                  onClose={() => updateAgent({ interests: agent.interests.filter(i => i !== interest) })}
                  variant="flat"
                >
                  {interest}
                </Chip>
              ))}
            </div>
            <Input
              label="Add Interest"
              placeholder="Enter new interest"
              variant="bordered"
              value={newInterest}
              onChange={(e) => setNewInterest(e.target.value)}
              endContent={
                <Button size="sm" onPress={addInterest}>Add</Button>
              }
              aria-label="Add new interest"
            />
          </CardBody>
        </Card>
      </div>
    )
  }

  const PrinciplesStrategy = () => {
    const updatePrinciple = (index: number, field: 'title' | 'description', value: string) => {
      setAgent(agent ? {
        ...agent, principles: agent.principles.map((principle, i) =>
          i === index ? { ...principle, [field]: value } : principle
        )
      } : null);
    };

    const addPrinciple = () => {
      setAgent(agent ? { ...agent, principles: [...agent.principles, { title: "New Principle", description: "Description" }] } : null);
    };

    const deletePrinciple = (index: number) => {
      setAgent(agent ? { ...agent, principles: agent.principles.filter((_, i) => i !== index) } : null);
    };

    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="mb-8 bg-background0">
          <CardHeader className="flex justify-between items-center">
            <h2 className="text-xl font-regular">Betting Principles</h2>
            <Button
              color="primary"
              size="sm"
              onPress={addPrinciple}
            >
              Add Principle
            </Button>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-1 gap-4 ">
              {agent.principles.length > 0 && agent.principles.map((principle, index) => (
                <EditablePrincipleCard
                  key={index}
                  title={principle.title}
                  description={principle.description}
                  onTitleChange={(value) => updatePrinciple(index, 'title', value)}
                  onDescriptionChange={(value) => updatePrinciple(index, 'description', value)}
                  onDelete={() => deletePrinciple(index)}
                />
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    )
  }

  const RiskLevelStrategy = () => {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="mb-8 bg-content0">
          <CardHeader className="text-xl font-regular">Risk Settings</CardHeader>
          <CardBody className="space-y-6">
            <Select
              label="Default Risk Level"
              variant="bordered"
              defaultSelectedKeys={[agent?.riskLevel]}
              onChange={(e) => setAgent({ ...agent, riskLevel: e.target.value as 'conservative' | 'moderate' | 'aggressive' })}
            >
              <SelectItem key="conservative" value="conservative">Conservative</SelectItem>
              <SelectItem key="moderate" value="moderate">Moderate</SelectItem>
              <SelectItem key="aggressive" value="aggressive">Aggressive</SelectItem>
            </Select>

            <Input
              label="Conservative Bet Size"
              type="number"
              endContent={<span className="text-default-400">credits</span>}
              variant="bordered"
              value={agent?.conservativeBetSize?.toString() || '0'}
              onChange={(e) => setAgent({ ...agent, conservativeBetSize: parseInt(e.target.value) })}
              min={0}
              aria-label="Conservative bet size in credits"
            />
            <Input
              label="Moderate Bet Size"
              type="number"
              endContent={<span className="text-default-400">credits</span>}
              variant="bordered"
              value={agent?.moderateBetSize?.toString() || '0'}
              onChange={(e) => setAgent({ ...agent, moderateBetSize: parseInt(e.target.value) })}
              min={0}
              aria-label="Moderate bet size in credits"
            />
            <Input
              label="Aggressive Bet Size"
              type="number"
              endContent={<span className="text-default-400">credits</span>}
              variant="bordered"
              value={agent?.aggressiveBetSize?.toString() || '0'}
              onChange={(e) => setAgent({ ...agent, aggressiveBetSize: parseInt(e.target.value) })}
              min={0}
              aria-label="Aggressive bet size in credits"
            />
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 mb-8 border border-white/10 rounded-xl p-6 text-center empty-state place-content-center">
      <div className="strategy-center"></div>
      <div className="text-white">{strategyList[strategyStep]}</div>
      <div className="text-gray-400">
        {
          strategyStep == 0 ?
            <BasicStrategy /> :
            strategyStep == 1 ?
              <PrinciplesStrategy /> :
              <RiskLevelStrategy />
        }
      </div>
      <div className="flex gap-2 justify-end">
        {
          strategyStep > 0 &&
          <Button className="w-fit bg-gray-800 text-white py-2 rounded" onPress={() => setStrategyStep(prev => prev - 1)}>Previous</Button>
        }
        {
          strategyStep < strategyList.length - 1 ?
            <Button className="w-fit bg-gray-800 text-white py-2 rounded" onPress={() => setStrategyStep(prev => prev + 1)}>Next</Button> :
            <Button className="w-fit bg-gray-800 text-white py-2 rounded" isLoading={isStrategyLoading} onPress={() => strategyFinish()}>Finish</Button>
        }
      </div>
    </div>
  )
}

const StrategyStart = ({ setStartStrategy }: { setStartStrategy: () => void }) => {
  return (
    <div className="flex flex-col gap-2 mb-8 border border-white/10 rounded-xl p-6 text-center empty-state place-content-center">
      <div className="strategy-center"></div>
      <div className="text-gray-400 pb-2 ">
        Set your agent&apos;s strategy to start asking questions.
      </div>
      <Button className="w-fit mx-auto" color="primary" variant="flat" onPress={setStartStrategy}>Begin Strategy</Button>
    </div>
  )
}

export default function AskAgent() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agentProfile, setAgentProfile] = useState<IAgentProfile | null>(null);
  const [isTraining, setIsTraining] = useState(false);
  const [strategy, setStrategy] = useState(false);
  const [isStrategy, setIsStrategy] = useState(false);
  const [isStrategyLoading, setIsStrategyLoading] = useState(false);

  const fetch = useFetch();
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  let receiveMode = searchParams.get("mode") || "conversation";
  const [mode, setMode] = useState(receiveMode);
  const modeList = [
    {
      key: "conversation",
      value: "Conversation"
    },
    {
      key: "train",
      value: "Train Agent"
    },
    {
      key: "database",
      value: "Search Database"
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
            setStrategy(true);
            return;
          }
          if (receiveMode == "train") {
            setTraining(response.agent);
            receiveMode = "";
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

  useEffect(() => {
    if (!agentProfile || strategy) return;
    if (mode == "train" && receiveMode != "train") {
      setMessages(prevMessages => [...prevMessages, {
        role: "agent",
        content: <TrainStart setTrain={() => setTraining(agentProfile)} />,
        type: "training"
      }]);
    } else {
      setMessages(prevMessages => prevMessages.filter(msg => msg.type !== "training"));
    }
  }, [mode]);

  const startStrategy = () => {
    setMessages([{
      role: "agent",
      content: <StrategyStart setStartStrategy={setStartStrategy} />,
      type: "strategy"
    }]);
  }

  useEffect(() => {
    if (strategy) {
      startStrategy();
    }
  }, [strategy]);

  const handleSend = async () => {
    if (mode == "train" || strategy) {
      return;
    }
    if (!input.trim()) {
      toast.error("Please enter a question");
      return;
    }

    const userQuestion = input.trim();
    setInput("");

    // 1) Add the user's message to the chat
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

  // Capture Enter key to trigger handleSend (except when shift + enter is pressed)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const setTraining = async (agent: IAgentProfile) => {
    if (!agent || isTraining || strategy) return;
    setMessages(prevMessages => prevMessages.filter(msg => msg.type !== "training"));
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
          agent={agent}
          setIsTraining={setIsTraining}
          setAgent={setAgentProfile}
        />,
        type: "training"
      }
      ]);
    }, 2000);
    setIsLoading(false);
  }

  const strategyFinish = async () => {
    setIsStrategyLoading(true);
    try {
      if (agentProfile?.interests.length == 0 || agentProfile?.principles.length == 0 || Number(agentProfile?.maxBetSize) == 0 || Number(agentProfile?.conservativeBetSize) == 0 || Number(agentProfile?.moderateBetSize) == 0 || Number(agentProfile?.aggressiveBetSize) == 0) {
        toast.error("Agent is not ready yet. Please set the strategy first.");
        return;
      }
      const response = await fetch.post("/api/updateAgentStrategy", { agent: agentProfile });
      if (response.status) {
        setIsStrategy(false);
        setStrategy(false);
      } else {
        toast.error(response.message || "Failed to update agent strategy");
      }
    } catch (error) {
      console.error("Error updating agent strategy:", error);
      toast.error("Failed to update agent strategy");
    } finally {
      setIsStrategyLoading(false);
    }
  }

  const setStartStrategy = () => {
    if (!agentProfile || isStrategy) return;
    setIsStrategy(true);
    setMessages([
      {
        role: "user",
        content: "I want to set my agent's strategy",
        type: "strategy"
      }
    ]);
  }

  useEffect(() => {
    if (isStrategy && agentProfile) {
      setMessages([{
        role: "agent",
        content: <StrategyMessageComponent
          agent={agentProfile}
          setAgent={setAgentProfile}
          strategyFinish={strategyFinish}
          isStrategyLoading={isStrategyLoading}
        />,
        type: "strategy"
      }]);
    }
    if (!isStrategy) {
      setMessages(prevMessages => prevMessages.filter(msg => msg.type !== "strategy"));
    }
  }, [agentProfile, isStrategy]);

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
                <div className="text-default-500 text-sm mt-0">
                  Category: {agentProfile.category}, Risk: {agentProfile.riskLevel}
                </div>
              )}
            </div>
          </div>
          <Select
            variant='bordered'
            className="w-[200px]"
            selectedKeys={new Set([mode])}
            onChange={(e) => setMode(e.target.value)}
            classNames={{
              trigger: "border-1 border-white/20 hover:border-white/40",
            }}
          >
            {modeList.map((mode) => (
              <SelectItem key={mode.key} value={mode.key}>
                {mode.value}
              </SelectItem>
            ))}
          </Select>
        </div>
      </div>

      {/* Chat Container (no extra background color) */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-2 space-y-4 text-small w-full"
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
    </div>
  );
} 