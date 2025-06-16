import { NextRequest, NextResponse } from "next/server";
import { DigitalTwinService } from "@/app/utils/services/digital-twin-service";

// POST /api/digital-twins/query - Query a specific digital twin
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        
        if (!body.agentToken || !body.question) {
            return NextResponse.json({ 
                error: 'Missing required fields: agentToken, question' 
            }, { status: 400 });
        }

        const response = await DigitalTwinService.queryDigitalTwin(
            body.agentToken,
            body.question
        );
        
        return NextResponse.json({ 
            status: true, 
            response,
            agentToken: body.agentToken
        });

    } catch (error) {
        console.error("Error in POST /api/digital-twins/query:", error);
        return NextResponse.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        }, { status: 500 });
    }
} 