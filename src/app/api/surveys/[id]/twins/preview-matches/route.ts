import { NextRequest, NextResponse } from "next/server";
import { SurveyRepo } from "@/app/utils/database/survey-repo";
import { DigitalTwinService } from "@/app/utils/services/digital-twin-service";

// POST /api/surveys/[id]/twins/preview-matches
// Returns ranked digital twins owned by the creator, with relevance and readiness scores
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Authentication required' }, { status: 401 });
    }

    const { id } = await params;
    const surveyId = parseInt(id, 10);
    if (!Number.isFinite(surveyId)) {
      return NextResponse.json({ status: false, message: 'Invalid survey id' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));
    const topK = Math.min(Math.max(parseInt(body?.topK || '50', 10), 1), 200);
    const filter = body?.filter || {};

    // Verify access and load survey
    const survey = await SurveyRepo.getSurveyById(surveyId, Number(userId));
    if (!survey) {
      return NextResponse.json({ status: false, message: 'Survey not found or access denied' }, { status: 404 });
    }

    // Build query text from survey
    const title = (survey as any).title || '';
    const questions = Array.isArray((survey as any).questions) ? (survey as any).questions : [];
    const questionText = questions.map((q: any) => q.prompt).filter(Boolean).join('\n');
    const queryText = `${title}\n${questionText}`.trim();

    // Use existing service to find similar twins for this user
    const matches = await DigitalTwinService.findSimilarTwinsForUser(queryText, userId, topK, filter);

    const ranked = (matches || []).map((m: any) => {
      const md = m.metadata || {};
      const completion = Number(md.completionPercentage || 0);
      const similarity = Number(m.score || 0); // Pinecone similarity score (closer is better)
      // Combine similarity and completion into readiness [0..1]
      const readiness = Math.max(0, Math.min(1, (0.6 * similarity) + (0.4 * (completion / 100))));

      // Simple reason extraction using available metadata
      const reasons: string[] = [];
      try {
        const principles = typeof md.principles === 'string' ? JSON.parse(md.principles) : (md.principles || {});
        const topics = Array.isArray(principles.coreValues) ? principles.coreValues.slice(0, 5) : [];
        if (topics.length) reasons.push(`Topic alignment: ${topics.join(', ')}`);
      } catch {}

      return {
        agentToken: md.agentId,
        similarity,
        completionPercentage: completion,
        readiness,
        demographics: md.demographics ? (() => { try { return JSON.parse(md.demographics); } catch { return null; } })() : null,
        principles: md.principles ? (() => { try { return JSON.parse(md.principles); } catch { return null; } })() : null,
        surveyTitle: md.surveyTitle,
        createdAt: md.created_at,
        reasons,
      };
    }).sort((a: any, b: any) => b.readiness - a.readiness);

    return NextResponse.json({ status: true, results: ranked });
  } catch (error) {
    console.error('Error in POST /api/surveys/[id]/twins/preview-matches:', error);
    return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
  }
}


