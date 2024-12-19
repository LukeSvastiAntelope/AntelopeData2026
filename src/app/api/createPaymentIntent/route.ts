import { verifyConfirmationToken } from '@/app/utils/api/token';
import { UserRepo } from '@/app/utils/database/user-repo';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
    const { amount, creditAmount, paymentMethod, walletAddress } = await req.json();
    const token = req.headers.get('Authorization')?.split(' ')[1];
    // Generate unique payment ID and expected signature
    const paymentId = uuidv4();

    try {
        const jwtPayload = await verifyConfirmationToken(token as string);
        if (!jwtPayload) {
            return Response.json({ error: 'Invalid token' }, { status: 401 });
        }        

        const agent = await UserRepo.getAgentByUserId(jwtPayload.email as string);
        if (!agent) {
            return Response.json({ status: false, message: 'Agent not found' });
        }
        await UserRepo.createPaymentIntent(paymentId, jwtPayload.email as string, agent.id, amount, creditAmount, paymentMethod, walletAddress);
        return NextResponse.json({ status: true, paymentId });

    } catch (error) {
        console.error("Error in getAgentBetHistory: ", error);
        return Response.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        });
    }
} 