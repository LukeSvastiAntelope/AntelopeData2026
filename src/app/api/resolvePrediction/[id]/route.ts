import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { PredictionDB } from "@/app/utils/interface";

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    const { outcome, type } = await req.json();
    if (type === "manual") {
        await UserRepo.resolvePrediction(params.id, outcome);
        const prediction = await UserRepo.getPredictionById(params.id);
        if (prediction) {
            await resolvePrediction(prediction);
        } else {
            return Response.json({
                status: false,
                message: "Prediction not found"
            });
        }
    } else {
        
    }
}

async function resolvePrediction(prediction: PredictionDB) {
    const bets = await UserRepo.getBetsByPredictionId(prediction.id.toString());
    const betwinners = bets?.filter(bet => bet.choice === prediction.outcome);
    const betlosers = bets?.filter(bet => bet.choice !== prediction.outcome);
}
