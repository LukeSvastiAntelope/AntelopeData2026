'use client';

import { PublicLayout } from "@/app/components/PublicLayout";
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from "react";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner"; // Assuming NextUI for Spinner
import { Card, CardHeader, CardBody, CardFooter } from "@heroui/card";
import { Chip } from "@heroui/chip";
import NextLink from "next/link";
import { Image as NextUIImage } from "@heroui/image"; // Import NextUI Image
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter as NextUIModalFooter, useDisclosure } from "@heroui/modal"; // Corrected Modal imports

// Define a type for the bet details we expect
interface PublicBetDetails {
  id: number;
  prediction_id: number;
  amount: number;
  choice: string;
  reason?: string;
  created_at: string;
  prediction_description?: string;
  prediction_source?: string;
  prediction_status?: string;
  prediction_creator_choice?: string;
  prediction_str_thumb?: string;
  prediction_outcome?: string;
  prediction_resolution_date?: string;
}

export default function PublicBetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const betId = params.bet_id as string;

  const [betDetails, setBetDetails] = useState<PublicBetDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isOpen: isLoginModalOpen, onOpen: openLoginModal, onClose: closeLoginModal } = useDisclosure();

  useEffect(() => {
    if (betId) {
      setLoading(true);
      setError(null);
      fetch(`/api/public/bet/${betId}`)
        .then(res => {
          if (!res.ok) {
            return res.json().then(errData => {
              throw new Error(errData.message || `Error: ${res.status}`);
            });
          }
          return res.json();
        })
        .then(data => {
          if (data.status && data.bet) {
            setBetDetails(data.bet);
            console.log("Bet Details Received:", data.bet);
            if (data.bet.prediction_str_thumb) {
              console.log("Prediction Image URL (prediction_str_thumb):", data.bet.prediction_str_thumb);
            } else {
              console.log("No prediction_str_thumb found in bet details.");
            }
          } else {
            setError(data.message || "Bet not found or invalid response.");
          }
          setLoading(false);
        })
        .catch(err => {
          console.error("Error fetching bet details:", err);
          setError(err.message || "Failed to load bet details.");
          setLoading(false);
        });
    }
  }, [betId]);

  if (loading) {
    return <PublicLayout><div className="flex justify-center items-center h-screen"><Spinner label="Loading bet details..." /></div></PublicLayout>;
  }

  if (error || !betDetails) {
    return <PublicLayout><div className="container mx-auto px-4 py-8 text-center"><h2 className="text-2xl text-danger-500">{error || "Bet not found."}</h2></div></PublicLayout>;
  }

  const canPlaceBet = betDetails.prediction_status === 'open';

  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-8">
        <Button onPress={() => router.back()} variant="flat" className="mb-6">Back to Activity</Button>
        <h1 className="text-3xl font-bold mb-2">Bet Details</h1>
        <p className="text-sm text-gray-500 mb-6">Public View for Bet ID: {betDetails.id}</p>
        
        <Card className="bg-content1 dark:bg-gray-800 shadow-lg">
          <CardHeader>
            <div className="flex flex-col">
                <p className="text-lg font-semibold">Bet on: {betDetails.prediction_description || "N/A"}</p>
                <p className="text-xs text-gray-500">Prediction ID: {betDetails.prediction_id}</p>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            {betDetails.prediction_str_thumb && (
              <div className="flex justify-center mb-4">
                <NextUIImage
                  src={betDetails.prediction_str_thumb}
                  alt={betDetails.prediction_description || 'Prediction image'}
                  width={640}
                  className="rounded-lg"
                />
              </div>
            )}
            <p><strong>Choice:</strong> 
                <Chip 
                    color={betDetails.choice?.toLowerCase() === 'yes' ? 'success' : betDetails.choice?.toLowerCase() === 'no' ? 'danger' : 'default'}
                    variant="flat"
                    size="sm"
                    className="ml-2"
                >
                    {betDetails.choice || "N/A"}
                </Chip>
            </p>
            <p><strong>Amount:</strong> {betDetails.amount ? `${betDetails.amount} credits` : "N/A"}</p>
            {betDetails.reason && <p className="text-sm text-gray-400"><strong>Reason:</strong> {betDetails.reason}</p>}
            <p><strong>Date Placed:</strong> {new Date(betDetails.created_at).toLocaleString()}</p>
            <hr className="border-gray-700 my-2"/>
            <h3 className="text-md font-semibold mt-2">Prediction Info:</h3>
            <p><strong>Status:</strong> 
                <Chip 
                    color={betDetails.prediction_status === 'resolved' ? 'primary' : betDetails.prediction_status === 'open' ? 'warning' : 'default'}
                    variant="flat"
                    size="sm"
                    className="ml-2"
                >
                    {betDetails.prediction_status || "N/A"}
                </Chip>
            </p>
            {betDetails.prediction_status === 'resolved' && betDetails.prediction_outcome && (
                <p><strong>Outcome:</strong> 
                    <Chip 
                        color={betDetails.prediction_outcome?.toLowerCase() === 'yes' ? 'success' : betDetails.prediction_outcome?.toLowerCase() === 'no' ? 'danger' : 'default'}
                        variant="flat"
                        size="sm"
                        className="ml-2"
                    >
                        {betDetails.prediction_outcome}
                    </Chip>
                </p>
            )}
            <p className="text-sm"><NextLink href={`/public/prediction/${betDetails.prediction_id}`} className="text-primary-500 hover:underline">View full prediction details</NextLink></p>
          </CardBody>
          {canPlaceBet && (
            <CardFooter>
              <Button color="primary" onPress={openLoginModal} className="w-full">
                Place a Bet on this Prediction
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>

      <Modal isOpen={isLoginModalOpen} onClose={closeLoginModal} placement="center">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">Login to Place a Bet</ModalHeader>
          <ModalBody>
            <p> 
              You need to be logged in to place bets. 
              Please login or create an account to participate!
            </p>
          </ModalBody>
          <NextUIModalFooter>
            <Button color="danger" variant="light" onPress={closeLoginModal}>
              Cancel
            </Button>
            <Button 
              color="secondary" 
              onPress={() => {
                closeLoginModal();
                router.push(`/register?redirect=/predictions/${betDetails.prediction_id}`);
              }}
              className="mr-2"
            >
              Sign Up
            </Button>
            <Button 
              color="primary" 
              onPress={() => {
                closeLoginModal();
                router.push(`/login?redirect=/predictions/${betDetails.prediction_id}`);
              }}
            >
              Login
            </Button>
          </NextUIModalFooter>
        </ModalContent>
      </Modal>
    </PublicLayout>
  );
} 