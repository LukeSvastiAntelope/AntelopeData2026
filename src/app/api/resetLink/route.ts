import { NextRequest } from "next/server";
import { verifyConfirmationToken } from "@/app/utils/api/token";

export async function POST(req: NextRequest) {
    try {
        const { token } = await req.json();
        
        if (!token) {
            return Response.json({ 
                status: false, 
                message: 'Reset link is required' 
            });
        }

        const jwtPayload = await verifyConfirmationToken(token);
        if (!jwtPayload) {
            return Response.json({ 
                status: false, 
                message: 'Invalid reset link' 
            });
        }
        
        return Response.json({ 
            status: true, 
            message: 'Reset link verified successfully',
        });
    } catch (err) {
        console.error("Error in resetLink: ", err);
        return Response.json({ 
            status: false, 
            message: err instanceof Error ? err.message : 'Reset link verification failed' 
        });
    }
}