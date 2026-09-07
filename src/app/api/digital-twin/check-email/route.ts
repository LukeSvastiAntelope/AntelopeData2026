import { NextRequest, NextResponse } from "next/server";
import { SurveyRepo } from "@/app/utils/database/survey-repo";

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

    // Extract demographics from the agent's base profile
    const demographics = agent.baseProfile?.demographics || {};
    
    return NextResponse.json({ 
      status: true, 
      found: true,
      demographics: {
        name: demographics.name || '',
        email: demographics.email || email,
        age: demographics.age || '',
        location: demographics.location || '',
        occupation: demographics.occupation || '',
        politicalViews: demographics.politicalViews || '',
        socialMedia: demographics.socialMedia || { twitter: '', linkedin: '', instagram: '' },
        interests: demographics.interests || '',
        education: demographics.education || '',
        income: demographics.income || ''
      },
      agentToken: (agent as any).agent_token
    });
  } catch (error) {
    console.error("Error in POST /api/digital-twin/check-email", error);
    return NextResponse.json({ status: false, message: "Internal server error" }, { status: 500 });
  }
} 