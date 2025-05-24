// src/app/api/getAgentBetHistory/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { UserRepo } from '@/app/utils/database/user-repo';
import { verifyConfirmationToken } from '@/app/utils/api/token';
import { Pinecone } from '@pinecone-database/pinecone';

export async function GET(req: NextRequest) {
    try {
        const token = req.headers.get('Authorization')?.split(' ')[1];
        const searchParams = req.nextUrl.searchParams;
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = (page - 1) * limit;

        const jwtPayload = await verifyConfirmationToken(token as string);
        if (!jwtPayload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const agent = await UserRepo.getAgentByUserId(jwtPayload.email as string);
        if (!agent) {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
        }

        const bets = await UserRepo.getBetHistoryByAgentId(agent.id, limit, offset);
        const betsStats = await UserRepo.getBetsStatsByAgentId(agent.id);

        console.log('Bets Stats:', betsStats);

        // Initialize Pinecone
        const pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY!
        });

        // Fetch Pinecone data for each bet that has a pinecone_id
        const betsWithReasoning = await Promise.all(bets.map(async (bet: any) => {
            if (bet.pinecone_id) {
                const index = pinecone.Index('prediction-results');
                try {
                    const records = await index.fetch([bet.pinecone_id]);
                    const pineconeData = records.records[bet.pinecone_id];
                    return {
                        ...bet,
                        fullReasoning: pineconeData?.metadata?.log ? JSON.parse(pineconeData.metadata.log as string) : null
                    };
                } catch (error) {
                    console.error('Error fetching from Pinecone:', error);
                    return bet;
                }
            }
            return bet;
        }));

        return NextResponse.json({
            status: true,
            bets: betsWithReasoning,
            bets_stats: betsStats,
            hasMore: bets.length === limit
        });
    } catch (error) {
        console.error('Error in getAgentBetHistory:', error);
        return NextResponse.json({ 
            status: false,
            error: 'Internal Server Error' 
        }, { status: 500 });
    }
}