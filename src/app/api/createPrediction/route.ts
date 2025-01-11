import { NextRequest } from "next/server";
import { format } from 'date-fns';
import { UserRepo } from "@/app/utils/database/user-repo";
import { verifyConfirmationToken } from "@/app/utils/api/token";
import { getJson } from "serpapi";
import { CreatePredictionInput } from "@/app/utils/interface";

export async function POST(req: NextRequest) {
    const prediction = await req.json();
    const token = req.headers.get('Authorization')?.split(' ')[1];
    const jwtPayload = await verifyConfirmationToken(token as string);
    if (!jwtPayload) {
        return Response.json({ status: false, message: 'Invalid token' });
    }

    try {
        const data = {
            creator_id: jwtPayload.email as number,
            description: prediction.description || '',
            source: prediction.source || '',
            source_url: "",
            created_at: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
            status: "open",
            bet_amount: prediction.bet_amount || 0,
            creator_choice: prediction.choice || '',
            event_id: 0,
            league_id: 0,
            strThumb: "",
            team_a: "",
            team_b: "",
            str_thumb: "",
            predicted_outcome: "",
            agent_id: 0,
            source_type: "dynamic",
            bet_type: "dynamic",
            resolution_date: prediction.resolutionDate 
                ? format(new Date(prediction.resolutionDate), 'yyyy-MM-dd HH:mm:ss')
                : format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
        }

        if (prediction.source === "sportDB") {
            data.event_id = prediction.matchId;
            data.league_id = prediction.leagueId;
            data.team_a = prediction.homeTeam;
            data.team_b = prediction.awayTeam;
            data.str_thumb = prediction.strThumb;
            data.predicted_outcome = prediction.choice;
        } else {
            data.source_url = prediction.sourceUrl;

            const result = await getJson({
                engine: "google_images",
                q: prediction.description,
                api_key: process.env.SERPAPI_API_KEY,
                safe: "active",
                num: 5
            });

            data.str_thumb = result.images_results[0].original || "";
        }
        
        if (data.source === "custom" && (!data.description || !data.source || !data.source_url || !data.resolution_date || !data.bet_amount || !data.creator_choice)) {
            return Response.json({ status: false, message: 'All fields are required' });

        } else if (data.source !== "custom" && (!data.event_id || !data.team_a || !data.team_b || !data.resolution_date || !data.bet_amount || !data.creator_choice || !data.league_id || !data.str_thumb || !data.description)) {
            return Response.json({ status: false, message: 'All fields are required' });
        }
        await UserRepo.createPrediction(data as CreatePredictionInput);
        return Response.json({ status: true, message: 'Prediction created successfully' });
    } catch (error) {
        console.error("Error in createPrediction: ", error);
        return Response.json({ status: false, message: 'Failed to create prediction' });
    }
}