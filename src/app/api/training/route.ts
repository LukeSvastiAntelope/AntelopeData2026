// src/app/api/getAgentBetHistory/route.ts
import { NextRequest } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from 'openai';
import { UserRepo } from "@/app/utils/database/user-repo";
import { verifyConfirmationToken } from "@/app/utils/api/token";

const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
});

const getEmbedding = async (text: string) => {
    const response = await openaiClient.embeddings.create({
        model: "text-embedding-ada-002",
        input: text
    });

    return response.data[0].embedding;
}

export async function POST(req: NextRequest) {
    const token = req.headers.get('Authorization')?.split(' ')[1];
    try {
        const jwtPayload = await verifyConfirmationToken(token as string);
        if (!jwtPayload) {
            return Response.json({ error: 'Invalid token' }, { status: 401 });
        }

        const agent = await UserRepo.getAgentByUserId(jwtPayload.email as string);
        if (!agent) {
            return Response.json({ error: 'Agent not found' }, { status: 404 });
        }

        const { predictionId, choice, amount, reasoning, confidence, question, description, category } = await req.json();

        const pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY!,
        });

        const normalizedText = `${question} ${description}`.toLowerCase();
        const index = pinecone.index("prediction-results");
        const embedding = await getEmbedding(normalizedText);

        await index.upsert([{
            id: predictionId,
            values: embedding,
            metadata: {
                question: question,
                description: description,
                choice: choice,
                amount: amount,
                category: category,
                created_at: new Date().toISOString(),
                agent_id: agent.id,
                confidence: confidence,
                reasoning: reasoning,
            }
        }]);

        const train_index = agent.train_index + "," + predictionId;
        await UserRepo.updateAgentTraining(agent.id, train_index);

        return Response.json({
            status: true,
        });
    } catch (error) {
        console.error("Error in getAgentBetHistory: ", error);
        return Response.json({
            status: false,
            message: error instanceof Error ? error.message : 'Internal server error'
        });
    }
}