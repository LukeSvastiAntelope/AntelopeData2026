import { NextRequest, NextResponse } from "next/server";
import { SurveyRepo } from "@/app/utils/database/survey-repo";

// GET /api/digital-twin/[token] – Public endpoint to retrieve a responder's Digital Twin profile
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ status: false, message: "Missing token" }, { status: 400 });
    }

    const twin = await SurveyRepo.getResponderAgentByToken(token);
    if (!twin) {
      return NextResponse.json({ status: false, message: "Digital Twin not found" }, { status: 404 });
    }

    return NextResponse.json({ status: true, twin });
  } catch (error) {
    console.error("Error in GET /api/digital-twin/[token]", error);
    return NextResponse.json({ status: false, message: "Internal server error" }, { status: 500 });
  }
} 