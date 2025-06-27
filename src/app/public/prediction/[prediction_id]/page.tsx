'use client';

import { PublicLayout } from "@/app/components/PublicLayout";
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from "react";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Card, CardHeader, CardBody, CardFooter, CardProps } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Image } from "@heroui/image";
import NextLink from "next/link";

// Define a type for individual bets within a prediction
interface PublicPredictionBet {
  id: number;
  amount: number;
  choice: string;
  created_at: string;
  // agent_name?: string; // Potentially add if we fetch agent details for bets
}

// Define a type for the prediction details we expect
interface PublicPredictionDetails {
  id: number;
  user_id: number; // Or username string
  description: string;
  source?: string;
  source_url?: string;
  created_at: string;
  status: string;
  bet_amount?: number;
  creator_choice?: string;
  event_id?: number;
  league_id?: number;
  team_a?: string;
  team_b?: string;
  str_thumb?: string;
  predicted_outcome?: string;
  resolution_date?: string;
  choices?: string[]; // Assuming it's an array of strings
  context?: string;
  outcome?: string;
  bets: PublicPredictionBet[];
}

export default function PublicPredictionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const predictionId = params.prediction_id as string;

  const [predictionDetails, setPredictionDetails] = useState<PublicPredictionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (predictionId) {
      setLoading(true);
      setError(null);
      fetch(`/api/public/prediction/${predictionId}`)
        .then(res => {
          if (!res.ok) {
            return res.json().then(errData => {
              throw new Error(errData.message || `Error: ${res.status}`);
            });
          }
          return res.json();
        })
        .then(data => {
          if (data.status && data.prediction) {
            setPredictionDetails(data.prediction);
          } else {
            setError(data.message || "Prediction not found or invalid response.");
          }
          setLoading(false);
        })
        .catch(err => {
          console.error("Error fetching prediction details:", err);
          setError(err.message || "Failed to load prediction details.");
          setLoading(false);
        });
    }
  }, [predictionId]);

  const cardProps: CardProps = {
    shadow: "lg",
    className: "bg-content1 dark:bg-gray-800 mb-6",
  };

  if (loading) {
    return <PublicLayout><div className="flex justify-center items-center h-screen"><Spinner label="Loading prediction details..." /></div></PublicLayout>;
  }

  if (error || !predictionDetails) {
    return <PublicLayout><div className="container mx-auto px-4 py-8 text-center"><h2 className="text-2xl text-danger-500">{error || "Prediction not found."}</h2></div></PublicLayout>;
  }

  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-8">
        <Button onPress={() => router.back()} variant="flat" className="mb-6">Back to Activity</Button>
        <h1 className="text-3xl font-bold mb-2">Prediction Details</h1>
        <p className="text-sm text-gray-500 mb-6">Public View for Prediction ID: {predictionDetails.id}</p>

        <Card {...cardProps}>
          <CardHeader className="flex gap-3">
            {predictionDetails.str_thumb && (
              <Image
                alt={`${predictionDetails.description} thumbnail`}
                height={60}
                width={60}
                src={predictionDetails.str_thumb}
                className="rounded-md object-cover"
              />
            )}
            <div className="flex flex-col">
              <p className="text-xl font-semibold">{predictionDetails.description}</p>
              <p className="text-xs text-gray-500">
                Created: {new Date(predictionDetails.created_at).toLocaleDateString()}
                {predictionDetails.source && ` | Source: ${predictionDetails.source}`}
              </p>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            <p><strong>Status:</strong> 
                <Chip 
                    color={predictionDetails.status === 'resolved' ? 'primary' : predictionDetails.status === 'open' ? 'warning' : 'default'}
                    variant="flat" 
                    size="sm" 
                    className="ml-2"
                >
                    {predictionDetails.status}
                </Chip>
            </p>
            {predictionDetails.creator_choice && <p><strong>Creator&apos;s Choice:</strong> {predictionDetails.creator_choice}</p>}
            {predictionDetails.predicted_outcome && <p><strong>Agent Predicted Outcome:</strong> {predictionDetails.predicted_outcome}</p>}
            {predictionDetails.choices && predictionDetails.choices.length > 0 && (
              <p><strong>Possible Choices:</strong> {predictionDetails.choices.join(", " )}</p>
            )}
            {predictionDetails.status === 'resolved' && predictionDetails.outcome && (
                <p><strong>Actual Outcome:</strong> 
                    <Chip 
                        color={predictionDetails.outcome?.toLowerCase() === 'yes' ? 'success' : predictionDetails.outcome?.toLowerCase() === 'no' ? 'danger' : 'default'} 
                        variant="flat" 
                        size="sm" 
                        className="ml-2"
                    >
                        {predictionDetails.outcome}
                    </Chip>
                </p>
            )}
            {predictionDetails.resolution_date && <p><strong>Resolution Date:</strong> {new Date(predictionDetails.resolution_date).toLocaleDateString()}</p>}
            {predictionDetails.source_url && <p><a href={predictionDetails.source_url} target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:underline">View Source</a></p>}
          </CardBody>
        </Card>

        {predictionDetails.bets && predictionDetails.bets.length > 0 && (
          <Card {...cardProps}>
            <CardHeader><h2 className="text-xl font-semibold">Public Bets on this Prediction</h2></CardHeader>
            <CardBody>
              <div className="space-y-2">
                {predictionDetails.bets.map(bet => (
                  <div key={bet.id} className="p-3 bg-gray-700/50 rounded-md">
                    <p>Bet ID: {bet.id} | Choice: {bet.choice} | Amount: {bet.amount} credits</p>
                    <p className="text-xs text-gray-400">Placed: {new Date(bet.created_at).toLocaleString()}</p>
                    <NextLink href={`/public/bet/${bet.id}`} className="text-xs text-primary-400 hover:underline">View Bet Details</NextLink>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        <Card {...cardProps} className={`${cardProps.className} mt-8`}>
          <CardHeader><h2 className="text-xl font-semibold">Want to participate?</h2></CardHeader>
          <CardBody>
            <p className="mb-4 text-gray-400">Login or create an account to join the action!</p>
          </CardBody>
          <CardFooter>
                            <Button color="primary" onPress={() => router.push('/login?redirect=/overview')} className="mr-2">
              Login
            </Button>
            <Button variant="bordered" onPress={() => router.push('/register')}>
              Sign Up
            </Button>
          </CardFooter>
        </Card>

      </div>
    </PublicLayout>
  );
} 