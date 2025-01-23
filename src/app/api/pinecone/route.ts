import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { verifyConfirmationToken } from "@/app/utils/api/token";
import { Pinecone } from "@pinecone-database/pinecone";

export async function GET(req: NextRequest) {
    const token = req.headers.get('Authorization')?.split(' ')[1];
    const pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY!,
    });

    try {
        const jwtPayload = await verifyConfirmationToken(token as string);
        if (!jwtPayload) {
            return Response.json({ error: 'Invalid token' }, { status: 401 });
        }        
        const agent = await UserRepo.getAgentByUserId(jwtPayload.email as string);
        if (!agent) {
            return Response.json({ error: 'Agent not found' }, { status: 404 });
        }
        
        const index = pinecone.index('prediction-results');
        const queryResults = await index.query({
            vector: new Array(1536).fill(0),
            topK: 10000,
            includeMetadata: true,
            filter: {
                agent_id: agent.id
            }
        });

        // Transform the data for Excel
        const excelData = queryResults.matches.map(match => ({
            id: match.id,
            description: match.metadata?.description || '',
            choice: match.metadata?.choice || '',
            amount: match.metadata?.amount || 0,
            status: match.metadata?.status || '',
            created_at: match.metadata?.created_at || '',
            predictionId: match.metadata?.predictionId || '',
            confidence: match.metadata?.confidence || 0,
            comment: match.metadata?.comment || '',
            reasoning: match.metadata?.reasoning || '',
            riskAssessment: match.metadata?.riskAssessment || '',
            result: match.metadata?.result || '',
            log: match.metadata?.log || ''
        }));

        // Set headers for Excel download
        return new Response(JSON.stringify(excelData), {
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': 'attachment; filename="prediction-data.json"'
            }
        });
    } catch (error) {
        console.error("Error in getAgentProfile: ", error);
        return Response.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        });
    }
}