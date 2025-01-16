'use client'

import { useEffect, useState } from 'react'
import { Button, Card, Input, Select, SelectItem, Textarea } from '@nextui-org/react'
import { useRouter } from 'next/navigation'
import { useFetch } from '@/app/utils/lib'
import { toast } from 'react-hot-toast'
import { IAgentProfile } from '@/app/utils/interface'
import { AutomatedPrediction } from '@/app/utils/interface'

export default function TrainAgentPage() {
    const [prediction, setPrediction] = useState<AutomatedPrediction | null>(null)
    const [loading, setLoading] = useState(false);
    const [agent, setAgent] = useState<IAgentProfile | null>(null);
    const [formData, setFormData] = useState({
        selectedOption: '',
        betAmount: '',
        reason: ''
    })
    const router = useRouter()
    const fetchData = useFetch();

    const generatePrediction = async () => {
        if (!agent) return;
        if (agent.trainCount == 0) {
            toast.error('Agent training is finished')
            return;
        }
        if (loading) {
            return;
        }
        setLoading(true)
        try {
            // TODO: Replace with actual API call
            const response = await fetchData.get('/api/createAgentPrediction?agentId=' + agent.id)
            if (response.status) {
                setPrediction(response.prediction)
            } else {
                toast.error(response.message)
            }
        } catch (error) {
            console.error('Error generating prediction:', error)
        } finally {
            setLoading(false)
        }
    }

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!prediction || !agent) return
        if (agent.trainCount == 0) {
            toast.error('Agent training is finished')
            return;
        }

        try {
            await fetchData.post('/api/training', {
                predictionId: `prediction-${Date.now()}-${agent?.id}`,
                betAmount: Number(formData.betAmount),
                reasoning: formData.reason,
                agentId: agent.id,
                confidence: 0.8,
                choice: formData.selectedOption,
                question: prediction.question,
                description: prediction.description,
                category: prediction.category,
            })

            // Reset form and generate new prediction
            setFormData({ selectedOption: '', betAmount: '', reason: '' })
            setPrediction(null);
            setAgent(prevAgent => prevAgent ? { ...prevAgent, trainCount: prevAgent.trainCount - 1 } : null);
        } catch (error) {
            console.error('Error submitting training data:', error)
        }
    }

    const fetchAgentProfile = async () => {
        setLoading(true);
        try {
            const response = await fetchData.get('/api/getAgentProfile');
            if (response.status) {
                setAgent(response.agent);
                if (!response.agent.principles || response.agent.principles.length === 0 || !response.agent.interests || response.agent.interests.length === 0) {
                    toast.error('Agent strategy is not complete. Please complete the strategy before training.');
                    setTimeout(() => {
                        router.push('/strategy');
                    }, 1000);
                }
            } else {
                toast.error(response.message);
            }
        } catch (error) {
            console.log(error);
            toast.error('Failed to fetch agent profile');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAgentProfile();
    }, []);

    return (
        <div className="max-w-2xl mx-auto p-4">
            <h1 className="text-2xl font-bold mb-6">Train AI Agent</h1>

            <Button
                color="primary"
                onPress={generatePrediction}
                isLoading={loading}
                isDisabled={prediction !== null}
                className="mb-6"
            >
                Generate New Prediction {agent?.trainCount}
            </Button>

            {prediction && (
                <Card className="mb-6 p-4">
                    <p className="font-semibold">AI Prediction: {prediction.question}</p>
                </Card>
            )}

            {prediction && (
                <form onSubmit={onSubmit} className="space-y-4">
                    <Select
                        label="Select Your Choice"
                        placeholder="Choose an option"
                        value={formData.selectedOption}
                        onChange={(e) => setFormData(prev => ({ ...prev, selectedOption: e.target.value }))}
                        isRequired
                    >
                        {
                            prediction.category == "sportDB" ?
                                <>
                                    <SelectItem value={prediction.event?.home_team} key={prediction.event?.home_team}>{prediction.event?.home_team}</SelectItem>
                                    <SelectItem value={prediction.event?.away_team} key={prediction.event?.away_team}>{prediction.event?.away_team}</SelectItem>
                                    {
                                        prediction.event?.league_id != "4391" && prediction.event?.league_id != "4387" &&
                                        <SelectItem value="Draw" key="Draw">Draw</SelectItem>
                                    }
                                </> :
                                <>
                                    <SelectItem value="Yes" key="Yes">Yes</SelectItem>
                                    <SelectItem value="No" key="No">No</SelectItem>
                                </>
                        }
                    </Select>

                    <Input
                        type="number"
                        label="Bet Amount"
                        placeholder="Enter bet amount"
                        value={formData.betAmount}
                        onChange={(e) => setFormData(prev => ({ ...prev, betAmount: e.target.value }))}
                        min={1}
                        isRequired
                    />

                    <Textarea
                        label="Reasoning"
                        placeholder="Enter your reasoning"
                        value={formData.reason}
                        onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                        minRows={4}
                        isRequired
                    />

                    <Button
                        color="primary"
                        type="submit"
                        className="mt-4"
                    >
                        Submit Training Data
                    </Button>
                </form>
            )}
        </div>
    )
}
