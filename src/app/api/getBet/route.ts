import { Pinecone } from "@pinecone-database/pinecone";
import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { verifyConfirmationToken } from "@/app/utils/api/token";

export async function GET(req: NextRequest) {
    const token = req.headers.get('Authorization')?.split(' ')[1];
    const jwtPayload = await verifyConfirmationToken(token as string);
    if (!jwtPayload) {
        return Response.json({ error: 'Invalid token' }, { status: 401 });
    }
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

        if (!bet.prediction_id) {
            return Response.json({
                status: false,
                message: 'Bet not found'
            });
        }

        const prediction = await UserRepo.getPredictionById(bet.prediction_id);
        const email = jwtPayload.email as number;
        console.log(bet.user_id, jwtPayload);

        if (bet.pinecone_id && bet.user_id == email) {
            const pinecone = new Pinecone({
                apiKey: process.env.PINECONE_API_KEY as string
            });

            const index = pinecone.index('prediction-results');
            const result = await index.fetch([bet.pinecone_id]);
            const vector = result.records[bet.pinecone_id];
            return Response.json({
                status: true,
                bet: bet,
                vector: vector,
                prediction: prediction
            });
        } else {
            return Response.json({
                status: true,
                bet: bet,
                prediction: prediction
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

export async function POST(req: NextRequest) {
    const token = req.headers.get('Authorization')?.split(' ')[1];
    const jwtPayload = await verifyConfirmationToken(token as string);
    if (!jwtPayload) {
        return Response.json({ error: 'Invalid token' }, { status: 401 });
    }
    const { id, comment } = await req.json();
    try {

        // Validate required fields
        if (!id || !comment) {
            return Response.json({
                status: false,
                message: 'Missing required fields: id and comment'
            });
        }

        const bet = await UserRepo.getBetById(id);
        if (!bet || bet.user_id !== jwtPayload.id) {
            return Response.json({
                status: false,
                message: 'Bet not found'
            });
        }

        // Check if bet has a pinecone_id
        if (!bet.pinecone_id) {
            return Response.json({
                status: false,
                message: 'No prediction data found for this bet'
            });
        }

        const pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY as string
        });

        const index = pinecone.index('prediction-results');
        await index.update({
            id: bet.pinecone_id,
            metadata: {
                comment: comment
            }
        });

        const result = await index.fetch([bet.pinecone_id]);
        const vector = result.records[bet.pinecone_id];

        return Response.json({
            status: true,
            vector: vector
        });
    } catch (error) {
        console.error('Error updating bet comment:', error);
        return Response.json({
            status: false,
            message: 'Failed to update bet comment: ' + error
        });
    }
}
