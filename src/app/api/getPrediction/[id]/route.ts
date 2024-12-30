import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { verifyConfirmationToken } from "@/app/utils/api/token";

export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    const token = req.headers.get('Authorization')?.split(' ')[1];
    
    try {
        // Verify JWT token
        const jwtPayload = await verifyConfirmationToken(token as string);
        if (!jwtPayload) {
            return Response.json({ error: 'Invalid token' }, { status: 401 });
        }

        // Get prediction details
        const prediction = await UserRepo.getPredictionById(params.id);

        if (!prediction) {
            return Response.json({
                status: false, 
                message: 'Prediction not found' 
            });
        }

        return Response.json({
            status: true,
            prediction: prediction
        });

    } catch (error) {
        console.error("Error in getPrediction: ", error);
        return Response.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        }, { status: 500 });
    }
} 