import { NextRequest, NextResponse } from "next/server";
import { SurveyRepo } from "@/app/utils/database/survey-repo";
import { EmailService } from "@/app/utils/services/email-service";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ status: false, message: "Email is required" }, { status: 400 });
    }

    const agent = await SurveyRepo.getResponderAgentByEmail(email);
    if (!agent) {
      return NextResponse.json({ status: false, message: "No Digital Twin found for this email" }, { status: 404 });
    }

    // Attempt to extract name from demographics if available
    const demo = agent.baseProfile?.demographics || {};
    const toName: string | undefined = demo.name || demo.fullName || undefined;

    await EmailService.sendTwinLoginLink(email, toName, (agent as any).agent_token);

    return NextResponse.json({ status: true, message: "Magic link sent" });
  } catch (error) {
    console.error("Error in POST /api/digital-twin/magic-link", error);
    return NextResponse.json({ status: false, message: "Internal server error" }, { status: 500 });
  }
} 