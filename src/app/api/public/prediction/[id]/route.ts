import { NextRequest, NextResponse } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const predictionId = (await params).id;

  if (!predictionId) {
    return NextResponse.json({ status: false, message: "Prediction ID is required" }, { status: 400 });
  }

  try {
    const prediction = await UserRepo.getPredictionById(predictionId);

    if (!prediction) {
      return NextResponse.json({ status: false, message: "Prediction not found" }, { status: 404 });
    }

    // Ensure only publicly safe fields are returned.
    // The `getPredictionById` in UserRepo already filters for non-secret bets.
    // We might want to further refine which prediction fields are public.
    const publicPredictionData = {
      id: prediction.id,
      user_id: prediction.user_id, // Consider if user_id should be public, or if username is better/safer.
      description: prediction.description,
      source: prediction.source,
      source_url: prediction.source_url,
      created_at: prediction.created_at,
      status: prediction.status,
      bet_amount: prediction.bet_amount, // Initial amount, not sum of bets
      creator_choice: prediction.creator_choice,
      event_id: prediction.event_id,
      league_id: prediction.league_id,
      team_a: prediction.team_a,
      team_b: prediction.team_b,
      str_thumb: prediction.str_thumb,
      predicted_outcome: prediction.predicted_outcome, // Agent's predicted outcome
      resolution_date: prediction.resolution_date,
      choices: prediction.choices, // Parsed JSON array of choices
      context: prediction.context, // Consider if context is always public
      outcome: prediction.outcome, // Actual resolved outcome
      // Associated public bets (already filtered by getPredictionById for is_secret=0)
      bets: Array.isArray(prediction.bets) ? prediction.bets.map(bet => ({
        id: bet.id,
        amount: bet.amount,
        choice: bet.choice,
        // Do NOT include bet.reason or bet.pinecone_id here unless explicitly decided to be public
        created_at: bet.created_at,
        // We might need to fetch agent_name if we want to display who made these public bets
      })) : [],
      // Add any other relevant and safe fields from PredictionDB
    };

    return NextResponse.json({ status: true, prediction: publicPredictionData });
  } catch (error) {
    console.error(`Error fetching public prediction details for ID ${predictionId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ status: false, message: errorMessage }, { status: 500 });
  }
} 