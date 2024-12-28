import { UserRepo } from "@/app/utils/database/user-repo";

export async function GET() {
    try {
        const leaderboard = await UserRepo.getLeaderboard();
        return Response.json({status: true, leaderboard: leaderboard});
    } catch (error) {
        console.error("Error in getLeaderboard: ", error);
        return Response.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        });
    }
}