import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from '@/app/utils/auth/require-user';
import { DigitalTwinService } from "@/app/utils/services/digital-twin-service";

// POST /api/digital-twins/search - Find similar digital twins
export async function POST(req: NextRequest) {
    try {
        // CRITICAL SECURITY: Get user ID from middleware to ensure user can only access their own digital twins
        const auth = requireUserId(req);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);

        console.log('🔍 Digital twins search - User ID:', userId);

        const body = await req.json();
        
        let results;
        
        if (!body.query || body.query.trim() === '') {
            // If no query provided, get all digital twins FOR THIS USER ONLY
            results = await DigitalTwinService.getUserDigitalTwins(userId);
            console.log('🔍 User twins found:', results.length);
        } else {
            // If query provided, do similarity search FOR THIS USER ONLY
            results = await DigitalTwinService.findSimilarTwinsForUser(
                body.query,
                userId,
                body.topK || 5,
                body.filter
            );
        }
        
        return NextResponse.json({ 
            status: true, 
            results: results.map(match => ({
                agentToken: match.metadata?.agentId, // Using agentId field from metadata
                score: match.score,
                demographics: match.metadata?.demographics ? JSON.parse(match.metadata.demographics) : null,
                principles: match.metadata?.principles ? JSON.parse(match.metadata.principles) : null,
                surveyTitle: match.metadata?.surveyTitle,
                createdAt: match.metadata?.created_at,
                createdBy: match.metadata?.createdBy // Add for debugging
            }))
        });

    } catch (error) {
        console.error("Error in POST /api/digital-twins/search:", error);
        return NextResponse.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        }, { status: 500 });
    }
} 