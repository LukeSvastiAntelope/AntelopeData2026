import { NextRequest, NextResponse } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const betId = (await params).id;

  if (!betId) {
    return NextResponse.json({ status: false, message: "Bet ID is required" }, { status: 400 });
  }

  try {
    const bet = await UserRepo.getBetById(betId);

    if (!bet) {
      return NextResponse.json({ status: false, message: "Bet not found" }, { status: 404 });
    }

    // Ensure only publicly safe fields are returned
    // For now, we return the structure from getBetById, assuming it's already filtered or safe.
    // Future refinement: explicitly pick fields here if getBetById returns too much.
    const publicBetData = {
      id: bet.id,
      prediction_id: bet.prediction_id,
      amount: bet.amount,
      choice: bet.choice,
      reason: bet.reason, // Consider if 'reason' is always public
      created_at: bet.created_at,
      // Fields from joined prediction
      prediction_description: bet.description, // This comes from predictions.description
      prediction_source: bet.source,
      prediction_status: bet.status,
      prediction_creator_choice: bet.creator_choice,
      prediction_str_thumb: bet.str_thumb,
      prediction_outcome: bet.outcome,
      prediction_resolution_date: bet.resolution_date,
      // Add any other relevant and safe fields from IBet and joined Prediction
    };

    return NextResponse.json({ status: true, bet: publicBetData });
  } catch (error) {
    console.error(`Error fetching public bet details for ID ${betId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ status: false, message: errorMessage }, { status: 500 });
  }
} 