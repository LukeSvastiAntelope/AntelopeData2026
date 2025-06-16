import { NextRequest, NextResponse } from "next/server";
import { openSql as getMySQLConnection } from "@/app/utils/database/db";
import { SurveyRepo } from "@/app/utils/database/survey-repo";
import { DigitalTwinService } from "@/app/utils/services/digital-twin-service";

// PATCH /api/digital-twin/[token]/update – Update responder demographics
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ status: false, message: "Missing token" }, { status: 400 });
    }

    const body = await req.json();
    const updates = body.demographics;
    if (!updates || typeof updates !== "object") {
      return NextResponse.json({ status: false, message: "Missing demographics payload" }, { status: 400 });
    }

    const existing = await SurveyRepo.getResponderAgentByToken(token);
    if (!existing) {
      return NextResponse.json({ status: false, message: "Digital Twin not found" }, { status: 404 });
    }

    const currentProfile = existing.baseProfile || {};
    const mergedDemographics = {
      ...(currentProfile.demographics || {}),
      ...updates,
    };
    const newBaseProfile = {
      ...currentProfile,
      demographics: mergedDemographics,
    };

    // Update DB
    const db = await getMySQLConnection();
    await db.execute(
      'UPDATE responder_agents SET base_profile = ? WHERE agent_token = ?',
      [JSON.stringify(newBaseProfile), token]
    );

    // Optionally regenerate principles & Pinecone vector (non-blocking)
    (async () => {
      try {
        const allAnswers: any[] = []; // Could load existing answers if desired
        const principles = await DigitalTwinService.generatePersonaPrinciples(
          mergedDemographics,
          allAnswers,
          'Profile Update'
        );
        await DigitalTwinService.storeInPinecone(
          token,
          mergedDemographics,
          principles,
          allAnswers,
          'Profile Update'
        );
      } catch (err) {
        console.error('[DigitalTwinUpdate] Failed to regenerate principles:', err);
      }
    })();

    return NextResponse.json({ status: true, message: 'Profile updated' });
  } catch (error) {
    console.error('Error in PATCH /api/digital-twin/[token]/update', error);
    return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
  }
} 