import { IAskAgentProps, AutomatedPrediction, IAgentProfile } from "@/app/utils/interface";
import { useFetch } from "@/app/utils/lib";
import { Button, Textarea, Input, RadioGroup, Radio } from "@heroui/react";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { useAgent } from "@/app/context/AgentContext";

const Train = ({ agentProfile, setAgentProfile }: IAskAgentProps) => {

    const fetchData = useFetch();
    const [betAmount, setBetAmount] = useState('0');
    const [isThinking, setIsThinking] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [reason, setReason] = useState<string | null>(null);
    const [choice, setChoice] = useState<string | null>(null);
    const [trainingPredictions, setTrainingPredictions] = useState<AutomatedPrediction | null>(null);
    const [trainingPredictionsList, setTrainingPredictionsList] = useState<AutomatedPrediction[]>([]);
    const [isTraining, setIsTraining] = useState(false);
    const { agent, setAgent } = useAgent();

    const generatePrediction = async () => {
        if (!agentProfile) return;
        if (agentProfile.trainCount == 0) {
            setIsTraining(false);
            toast.error('Agent training is finished')
            return;
        }
        if (
            agentProfile.principles.length == 0 ||
            agentProfile.interests.length == 0 ||
            Number(agentProfile.maxBetSize) == 0 ||
            Number(agentProfile.maxTimelineLimit) == 0 ||
            Number(agentProfile.aggressiveBetSize) == 0 ||
            Number(agentProfile.conservativeBetSize) == 0 ||
            Number(agentProfile.moderateBetSize) == 0
        ) {
            toast.error('Agent strategy is not set')
            return;
        }
        if (isThinking) {
            return;
        }
        setIsThinking(true)
        try {
            // TODO: Replace with actual API call
            const response = await fetchData.get('/api/createAgentPrediction?agentId=' + agentProfile.id)
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
        if (!trainingPredictions || !agentProfile || !choice || !reason || !betAmount) return
        if (agentProfile.trainCount == 0) {
            toast.error('Agent training is finished')
            return;
        }

        try {
            const result = await fetchData.post('/api/training', {
                predictionId: `prediction-${Date.now()}-${agentProfile.id}`,
                betAmount: Number(betAmount),
                reasoning: reason,
                agentId: agentProfile.id,
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
        if (!agentProfile || agentProfile.trainCount == 1 || !trainingPredictions) {
            toast.error('Agent training is finished')
            return;
        }
        setTrainingPredictionsList(prevList => [...prevList, trainingPredictions]);
        setTrainingPredictions(null);
        setIsSubmitted(false)
        setAgentProfile(prevAgent => prevAgent ? { ...prevAgent, trainCount: prevAgent.trainCount - 1 } : null);
        setAgent(prevAgent => prevAgent ? { ...prevAgent, trainCount: prevAgent.trainCount - 1 } : null);
        generatePrediction();
    }

    const regenerateQuestion = () => {
        if (!agentProfile || agentProfile.trainCount == 1 || !trainingPredictions) {
            toast.error('Agent training is finished')
            return;
        }
        setTrainingPredictionsList(prevList => [...prevList, trainingPredictions]);
        setTrainingPredictions(null);
        setIsSubmitted(false)
        generatePrediction();
    }

    const startTraining = () => {
        setIsTraining(true);
        generatePrediction();
    }

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
        isTraining && agentProfile ?
            (
                <div className="w-full space-y-4 text-sm">
                    <div className=" rounded-md py-2 px-4  bg-primary/20 text-primary-600 w-fit">
                        Fetching
                        {
                            (6 - agentProfile.trainCount - trainingPredictionsList.length) == 0 ?
                                " first question about " + agentProfile.name :
                                (6 - agentProfile.trainCount - trainingPredictionsList.length) == 1 ?
                                    " second question about " + agentProfile.name :
                                    (6 - agentProfile.trainCount - trainingPredictionsList.length) == 2 ?
                                        " third question about " + agentProfile.name :
                                        (6 - agentProfile.trainCount - trainingPredictionsList.length) == 3 ?
                                            " fourth question about " + agentProfile.name :
                                            " fifth question about " + agentProfile.name
                        }
                    </div>
                    {
                        trainingPredictionsList.length > 0 && trainingPredictionsList.map((prediction, index) => (
                            <div key={index}>
                                <div className="text-white">{6 - agentProfile.trainCount - trainingPredictionsList.length + index} {prediction.question}</div>
                                <div className="text-white">{prediction.choice}</div>
                                <div className="text-white">{prediction.reasoning}</div>
                                <div className="text-white">{prediction.initialStake}</div>
                            </div>
                        ))
                    }
                    {
                        isThinking ? (
                            <div className="text-white bg-primary-600 rounded-md p-2">Thinking...</div>
                        ) : (
                            trainingPredictions ?
                                <div className="space-y-2 px-3 py-2 rounded-md bg-[#2F344E]/20">
                                    <div className="text-white text-xl">{trainingPredictions?.question}</div>
                                    {
                                        !isSubmitted ?
                                            <>
                                                <div className="flex flex-col gap-2">
                                                    <div className="text-white">Choose your answer</div>
                                                    <RadioGroup
                                                        value={choice || ''}
                                                        onValueChange={setChoice}
                                                        className="gap-2"
                                                    >
                                                        {
                                                            trainingPredictions.category == "sportDB" ? (
                                                                <div className="flex gap-2">
                                                                    <Radio value={trainingPredictions.event?.home_team || ''}>
                                                                        {trainingPredictions.event?.home_team}
                                                                    </Radio>
                                                                    <Radio value={trainingPredictions.event?.away_team || ''}>
                                                                        {trainingPredictions.event?.away_team}
                                                                    </Radio>
                                                                    {trainingPredictions.event?.league_id != "4391" &&
                                                                        trainingPredictions.event?.league_id != "4387" && (
                                                                            <Radio value="Draw">
                                                                                Draw
                                                                            </Radio>
                                                                        )}
                                                                </div>
                                                            ) : (
                                                                <div className="flex gap-2">
                                                                    <Radio value="Yes">Yes</Radio>
                                                                    <Radio value="No">No</Radio>
                                                                </div>
                                                            )
                                                        }
                                                    </RadioGroup>
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    <div className="text-white">Choose amount you would bet</div>
                                                    <Input
                                                        type="number"
                                                        label="Bet Amount"
                                                        placeholder="Amount"
                                                        value={betAmount}
                                                        onChange={(e) => setBetAmount(e.target.value)}
                                                        classNames={{
                                                            input: "bg-content0 dark:bg-content0",
                                                            inputWrapper: "bg-content0 dark:content0"
                                                        }}
                                                        aria-label="Enter bet amount for training prediction"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="text-white">Reason</div>
                                                    <Textarea
                                                        type="text"
                                                        label="Reason"
                                                        placeholder="Enter the reason for you bet so that the agent can learn how you think"
                                                        value={reason || ''}
                                                        onChange={(e) => setReason(e.target.value)}
                                                        classNames={{
                                                            input: "bg-content0 dark:bg-content0",
                                                            inputWrapper: "bg-content0 dark:bg-content0",
                                                            mainWrapper: "w-full h-[200px]"
                                                        }}
                                                        aria-label="Enter reasoning for training prediction"
                                                    />
                                                </div>
                                            </> :
                                            <div className="text-white bg-gray-800 p-2 rounded-md w-full">I&apos;ve saved your instructions for question {6 - agentProfile.trainCount}</div>
                                    }
                                    {
                                        !isSubmitted ?
                                            <div className="flex gap-2">
                                                <Button className="w-full bg-gray-800 text-white py-2 rounded mt-4" onPress={() => setIsTraining(false)}>Cancel</Button>
                                                <Button className="w-full bg-gray-800 text-white py-2 rounded mt-4" onPress={handleSubmit}>Submit</Button>
                                            </div> :
                                            <div className="flex gap-2">
                                                <Button className="w-full bg-gray-800 text-white py-2 rounded mt-4" onPress={() => setIsTraining(false)}>Stop Training</Button>
                                                <Button className="w-full bg-gray-800 text-white py-2 rounded mt-4" onPress={setHandleNewQuestion}>New Question</Button>
                                            </div>
                                    }
                                </div> :
                                <Button className="w-full bg-gray-800 text-white py-2 rounded mt-4" onPress={regenerateQuestion}>New Question</Button>

                        )
                    }
                </div>
            ) : (
                <div className="flex flex-col gap-2 mb-8 border border-white/10 rounded-xl p-6 text-center empty-state place-content-center">
                    <div className="training-center"></div >
                    <div className="text-gray-400 pb-2 text-sm">
                        Teach your agent to reason about your subject of interest by breaking down your own reasoning based on relevants bets.
                    </div>
                    <Button className="w-fit mx-auto" color="primary" variant="flat" onPress={startTraining}>Begin Training</Button>
                </div >
            )
    );
}

export default Train;