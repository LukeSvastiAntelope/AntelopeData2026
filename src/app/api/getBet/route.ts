import { Pinecone } from "@pinecone-database/pinecone";
import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";

export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const betId = searchParams.get('id');
    if (!betId) {
        return Response.json({
            status: false,
            message: 'No bet id provided'
        });
    }

    const bet = await UserRepo.getBetById(betId);

    try {
        const pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY as string
        });
    
        const index = pinecone.index('prediction-results');
        const result = await index.fetch([id]);
        const vector = result.records[id];
    
        return Response.json({
            status: true,
            data: vector
        });
    } catch (error) {
        console.error('Failed to fetch Pinecone data:', error);
        return Response.json({
            status: false,
            message: 'Failed to fetch Pinecone data:' + error
        });

    }
}   