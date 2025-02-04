import { UserRepo } from "@/app/utils/database/user-repo";

export async function GET() {
    try {
        const predictions = await UserRepo.getPredictionsfromAdmin();
        return Response.json({status: true, predictions: predictions});
    } catch (error) {
        console.error("Error in getAgentProfile: ", error);
        return Response.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        });
    }
}