import { NextRequest } from "next/server";
import { verifyConfirmationToken } from "@/app/utils/api/token";
import { UserRepo } from "@/app/utils/database/user-repo";
import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
    const token = req.headers.get('Authorization')?.split(' ')[1];
    const jwtPayload = await verifyConfirmationToken(token as string);
    if (!jwtPayload) {
        return Response.json({ status: false, message: 'Invalid token' });
    }

    try {
        const { predictionId, choice, amount, reason } = await req.json();

        if (!predictionId || !choice || !amount || !reason) {
            return Response.json({
                status: false,
                message: 'Invalid request'
            });
        }

        if (amount < 0) {
            return Response.json({
                status: false,
                message: 'Bet amount must be greater than 0'
            });
        }

        const user = await UserRepo.getUserById(jwtPayload.email as string);
        if (!user) {
            return Response.json({
                status: false,
                message: 'User not found'
            });
        }
        const agent = await UserRepo.getAgentByUserId(user.id.toString());
        if (!agent) {
            return Response.json({
                status: false,
                message: 'Agent not found'
            });
        }

        if (agent.wallet_balance < amount) {
            return Response.json({
                status: false,
                message: 'Insufficient balance'
            });
        }

        const prediction = await UserRepo.getPredictionById(predictionId);
        if (!prediction) {
            return Response.json({
                status: false,
                message: 'Prediction not found'
            });
        }

        const pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY as string
        });
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY as string
        });
        const response = await openai.embeddings.create({
            model: "text-embedding-ada-002",
            input: prediction.description
        });

        const embedding = response.data[0].embedding;
        const index = pinecone.Index('prediction-results');
        const pineconeId = `bet-${predictionId}-${agent.id}-${Date.now()}`;
        console.log("bet", prediction.betReason);

        await index.upsert([{
            id: pineconeId,
            values: embedding,
            metadata: {
                description: prediction.description,
                choice: choice,
                amount: amount,
                status: 'pending',  // Will need to be updated when prediction resolves
                created_at: new Date().toISOString(),
                agent_id: agent.id,
                prediction_id: predictionId,
                confidence: 1,
                reasoning: reason,
                risk_assessment: "high",
                result: 'pending',
            }
        }]);

        await UserRepo.createBet(predictionId, agent.id, choice, amount, reason, user.id, pineconeId);

        return Response.json({
            status: true,
            message: 'Bet placed successfully',
        });
    } catch (err) {
        console.error("Error in resetLink: ", err);
        return Response.json({
            status: false,
            message: err instanceof Error ? err.message : 'Reset link verification failed'
        });
    }
}