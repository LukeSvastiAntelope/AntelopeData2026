import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from '@/app/utils/auth/require-user';
import { DigitalTwinService } from "@/app/utils/services/digital-twin-service";

// POST /api/digital-twins/query - Query a specific digital twin
export async function POST(req: NextRequest) {
    try {
        // CRITICAL SECURITY: Get user ID from middleware to ensure user can only query their own digital twins
        const auth = requireUserId(req);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);

        const body = await req.json();
        
        if (!body.agentToken || !body.question) {
            return NextResponse.json({ 
                error: 'Missing required fields: agentToken, question' 
            }, { status: 400 });
        }

        const response = await DigitalTwinService.queryDigitalTwinForUser(
            body.agentToken,
            body.question,
            userId
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