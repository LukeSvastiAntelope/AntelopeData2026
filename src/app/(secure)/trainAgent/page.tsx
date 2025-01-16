'use client'

import { useEffect, useState } from 'react'
import { Button, Card, Input, Select, SelectItem, Textarea } from '@nextui-org/react'
import { useRouter } from 'next/navigation'
import { useFetch } from '@/app/utils/lib'
import { toast } from 'react-hot-toast'

interface Prediction {
    id: string
    matchDetails: string
    options: string[]
    aiPrediction: string
}

export default function TrainAgentPage() {
    const [prediction, setPrediction] = useState<Prediction | null>(null)
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        selectedOption: '',
        betAmount: '',
        reason: ''
    })
    const router = useRouter()
    const fetchData = useFetch();

    const generatePrediction = async () => {
        setLoading(true)
        try {
            // TODO: Replace with actual API call
            const response = await fetchData.get('/api/createAgentPrediction')
            const data = await response.json()
            setPrediction(data)
        } catch (error) {
            console.error('Error generating prediction:', error)
        } finally {
            setLoading(false)
        }
    }

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!prediction) return

        try {
            await fetchData.post('/api/training/submit', {
                predictionId: prediction.id,
                selectedOption: formData.selectedOption,
                betAmount: Number(formData.betAmount),
                reason: formData.reason,
            })

            // Reset form and generate new prediction
            setFormData({ selectedOption: '', betAmount: '', reason: '' })
            setPrediction(null)
            generatePrediction()
        } catch (error) {
            console.error('Error submitting training data:', error)
        }
    }

    const fetchAgentProfile = async () => {
        setLoading(true);
        try {
            const response = await fetchData.get('/api/getAgentProfile');
            if (response.status) {
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
                Generate New Prediction
            </Button>

            {prediction && (
                <Card className="mb-6 p-4">
                    <h2 className="text-xl mb-4">Match Details</h2>
                    <p className="mb-4">{prediction.matchDetails}</p>
                    <p className="font-semibold">AI Prediction: {prediction.aiPrediction}</p>
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
                        {prediction.options.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                                {opt}
                            </SelectItem>
                        ))}
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
