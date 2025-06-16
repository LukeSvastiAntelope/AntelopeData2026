import { NextRequest, NextResponse } from "next/server";
import { DigitalTwinService } from "@/app/utils/services/digital-twin-service";

// POST /api/digital-twins/search - Find similar digital twins
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        
        let results;
        
        if (!body.query || body.query.trim() === '') {
            // If no query provided, get all digital twins
            results = await DigitalTwinService.getAllDigitalTwins(body.topK || 50);
        } else {
            // If query provided, do similarity search
            results = await DigitalTwinService.findSimilarTwins(
                body.query,
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
                createdAt: match.metadata?.created_at
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