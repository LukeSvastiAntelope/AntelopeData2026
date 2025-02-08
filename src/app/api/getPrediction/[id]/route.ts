import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";

export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    console.log("getPrediction", req);
    try {
        // Get prediction details
        const prediction = await UserRepo.getPredictionById(params.id);
        if (prediction && prediction.choices && typeof prediction.choices === 'string') {
            prediction.choices = JSON.parse(prediction.choices);
        }

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