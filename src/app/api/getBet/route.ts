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

    try {
        const bet = await UserRepo.getBetById(betId);
        if (!bet) {
            return Response.json({
                status: false,
                message: 'Bet not found'
            });
        }

        if (bet.pinecone_id) {
            const pinecone = new Pinecone({
                apiKey: process.env.PINECONE_API_KEY as string
            });

            const index = pinecone.index('prediction-results');
            const result = await index.fetch([bet.pinecone_id]);
            const vector = result.records[bet.pinecone_id];
            return Response.json({
                status: true,
                bet: bet,
                vector: vector
            });
        } else {
            return Response.json({
                status: true,
                bet: bet
            });
        }
    } catch (error) {
        console.log(error);
        return Response.json({
            status: false,
            message: 'Failed to fetch bet details:' + error
        });
    }
}   