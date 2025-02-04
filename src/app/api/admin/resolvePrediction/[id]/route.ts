import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { PredictionDB } from "@/app/utils/interface";

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    const { outcome, type } = await req.json();
    try {
        if (type === "manual" && outcome) {
            const prediction = await UserRepo.getPredictionById(params.id);
            if (prediction) {
                await resolvePrediction(prediction, outcome);
            } else {
                return Response.json({
                    status: false,
                    message: "Prediction not found"
                });
            }
        } else {
            const prediction = await UserRepo.getPredictionById(params.id);
            if (prediction) {
                const result = await verifyPrediction(prediction);
                if (result) {
                    await resolvePrediction(prediction, result);
                } else {
                    return Response.json({
                        status: false,
                        message: "Prediction not found"
                    });
                }
            } else {
                return Response.json({
                    status: false,
                    message: "Prediction not found"
                });
            }
        }
        return Response.json({
            status: true,
            message: "Prediction resolved"
        });
    } catch (error) {
        console.log(error);
        return Response.json({
            status: false,
            message: "Internal server error"
        });
    }
}

async function verifyPrediction(prediction: PredictionDB) {
    console.log(prediction);
    return "Yes";
}

async function resolvePrediction(prediction: PredictionDB, outcome: string) {
    const bets = await UserRepo.getBetsByPredictionId(prediction.id.toString());
    const totalpot = bets?.reduce((acc, bet) => acc + bet.amount, 0) + prediction.bet_amount;
    const betwinners = bets?.filter(bet => bet.choice.toLowerCase() === outcome.toLowerCase());
    const betlosers = bets?.filter(bet => bet.choice.toLowerCase() !== outcome.toLowerCase());
    const creatorChoice = prediction.creator_choice;
    let totalWinningBets = betwinners?.reduce((acc, bet) => acc + bet.amount, 0);
    const houseFee = totalpot * Number(process.env.HOUSE_FEE_RATE) / 100;
    let creatorWin = 0;
    if (creatorChoice.toLowerCase() === outcome.toLowerCase()) {
        totalWinningBets = totalWinningBets + prediction.bet_amount;
        creatorWin = prediction.bet_amount * (totalpot - houseFee) / totalWinningBets;
    }

    if (prediction.user_id && prediction.bet_amount > 0) {
        await UserRepo.updateUserPredictionBalance(prediction.user_id, creatorWin, prediction.bet_amount);
    } else if (prediction.platform_id && prediction.bet_amount > 0) {
        await UserRepo.updatePlatformAccountBalance(prediction.platform_id, creatorWin, prediction.bet_amount);
    }

    betwinners?.forEach(async (bet) => {
        if (bet.user_id) {
            await UserRepo.updateUserPredictionBalance(bet.user_id, bet.amount * (totalpot - houseFee) / totalWinningBets, bet.amount);
        } else if (bet.platform_id) {
            await UserRepo.updatePlatformAccountBalance(bet.platform_id, bet.amount * (totalpot - houseFee) / totalWinningBets, bet.amount);
        }
    });

    betlosers?.forEach(async (bet) => {
        if (bet.user_id) {
            await UserRepo.updateUserPredictionBalance(bet.user_id, 0, bet.amount);
        } else if (bet.platform_id) {
            await UserRepo.updatePlatformAccountBalance(bet.platform_id, 0, bet.amount);
        }
    });

    await UserRepo.updatePlatformAccountBalance(9, houseFee, 0);
    await UserRepo.resolvePrediction(prediction.id.toString(), outcome);
}
