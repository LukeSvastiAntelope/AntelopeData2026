import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from '@/app/utils/auth/require-user';
import { DigitalTwinService } from "@/app/utils/services/digital-twin-service";
import { withUserOrgAiUsage } from '@/app/utils/services/with-org-ai-usage';
import { resolveActiveOrgForUser } from '@/app/utils/auth/resolve-active-org';

// POST /api/digital-twins/query - Query a specific digital twin
export async function POST(req: NextRequest) {
    try {
        // CRITICAL SECURITY: Get user ID from middleware to ensure user can only query their own digital twins
        const auth = requireUserId(req);
        if (typeof auth !== 'string') return auth;
        const userIdNum = Number(auth);

        const body = await req.json();
        
        if (!body.agentToken || !body.question) {
            return NextResponse.json({ 
                error: 'Missing required fields: agentToken, question' 
            }, { status: 400 });
        }

        const organizationId = await resolveActiveOrgForUser(
          req,
          userIdNum,
          body.organizationId
        );
        if (organizationId instanceof NextResponse) return organizationId;

        const response = await withUserOrgAiUsage(
          userIdNum,
          'digital_twins',
          () =>
            DigitalTwinService.queryDigitalTwinForUser(
              body.agentToken,
              body.question,
              auth
            ),
          organizationId
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
