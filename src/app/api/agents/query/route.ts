import { NextRequest, NextResponse } from "next/server";
import { SurveyRepo } from "@/app/utils/database/survey-repo";

// POST /api/agents/query - Query a responder agent
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        
        // Basic validation
        if (!body.agentToken || !body.query) {
            return NextResponse.json({ 
                error: 'Missing required fields: agentToken, query' 
            }, { status: 400 });
        }

        // Get the agent
        const agent = await SurveyRepo.getResponderAgentByToken(body.agentToken);
        
        if (!agent) {
            return NextResponse.json({ 
                error: 'Agent not found' 
            }, { status: 404 });
        }

        // For now, return a simple response based on the agent's profile
        // In the future, this would call OpenAI with the agent's context
        const response = `Based on my profile (${JSON.stringify(agent.baseProfile)}), here's my response to "${body.query}": This is a placeholder response. In the future, this will be powered by AI to give personalized answers based on my survey responses.`;
        
        return NextResponse.json({ 
            status: true, 
            response,
            agentProfile: agent.baseProfile,
            responseTimeMs: 100 // placeholder
        });

    } catch (error) {
        console.error("Error in POST /api/agents/query:", error);
        return NextResponse.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        }, { status: 500 });
    }
} 