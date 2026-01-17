import { NextRequest, NextResponse } from "next/server";
import { SurveyRepo } from "@/app/utils/database/survey-repo";
import { DigitalTwinService } from "@/app/utils/services/digital-twin-service";
import { EmailService } from "@/app/utils/services/email-service";

// Helper function to ensure digital twin is stored in Pinecone with retry logic
async function ensureDigitalTwinInPinecone(agentToken: string, body: any, survey: any, maxRetries: number = 3) {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🔄 Attempt ${attempt}/${maxRetries} to store digital twin ${agentToken} in Pinecone`);
            
            // Prepare answers with question text for AI analysis
            const answersWithText = body.answers.map((answer: any) => {
                const question = survey.questions.find((q: any) => q.id === answer.questionId);
                return {
                    questionId: answer.questionId,
                    questionText: question?.prompt || 'Unknown question',
                    value: answer.value
                };
            });

            // Check if this is an existing digital twin (based on email)
            const email = body.demographics.email;
            const existingAgent = email ? await SurveyRepo.getResponderAgentByEmail(email) : null;

            if (existingAgent) {
                // Try to update; if vector missing, fall back to creating
                try {
                    await DigitalTwinService.updateDigitalTwin(
                        (existingAgent as any).agent_token,
                        body.demographics,
                        answersWithText,
                        survey.title
                    );
                    console.log(`✅ Updated existing digital twin for ${email}: ${(existingAgent as any).agent_token}`);
                } catch (updateErr) {
                    console.warn(`⚠️ Update failed for existing twin, creating new vector record:`, updateErr);
                    const principles = await DigitalTwinService.generatePersonaPrinciples(
                        body.demographics,
                        answersWithText,
                        survey.title
                    );
                    await DigitalTwinService.storeInPinecone(
                        (existingAgent as any).agent_token,
                        body.demographics,
                        principles,
                        answersWithText,
                        survey.title,
                        String(survey.created_by)
                    );
                }
            } else {
                // Generate persona principles for new digital twin
                const principles = await DigitalTwinService.generatePersonaPrinciples(
                    body.demographics,
                    answersWithText,
                    survey.title
                );

                // Store in Pinecone for future querying
                await DigitalTwinService.storeInPinecone(
                    agentToken,
                    body.demographics,
                    principles,
                    answersWithText,
                    survey.title,
                    String(survey.created_by)
                );
                console.log(`✅ New digital twin created and stored for ${agentToken}`);
            }
            
            // If we get here, it succeeded
            return;
            
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            console.error(`❌ Attempt ${attempt}/${maxRetries} failed for digital twin ${agentToken}:`, lastError.message);
            
            if (attempt < maxRetries) {
                // Wait before retrying (exponential backoff)
                const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                console.log(`⏳ Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    // If we get here, all attempts failed
    console.error(`🚨 CRITICAL: Failed to store digital twin ${agentToken} in Pinecone after ${maxRetries} attempts. Last error:`, lastError?.message);
    
    // Log this failure for manual intervention
    console.error(`🔧 MANUAL INTERVENTION NEEDED: Digital twin ${agentToken} exists in database but not in Pinecone. Run regeneration script.`);
}

// POST /api/surveys/[slug]/submit - Submit survey response
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;
        
        // Get survey first to validate it exists and is published
        const survey = await SurveyRepo.getSurveyBySlug(slug);
        
        if (!survey) {
            return NextResponse.json({ 
                error: 'Survey not found or not published' 
            }, { status: 404 });
        }

        const body = await req.json();
        
        // Basic validation
        if (!body.demographics || !body.answers || !Array.isArray(body.answers)) {
            return NextResponse.json({ 
                error: 'Missing required fields: demographics, answers' 
            }, { status: 400 });
        }

        // Extra guard: ensure at least one non-empty answer value
        const nonEmptyAnswerCount = body.answers.filter((a: any) => {
            if (!a) return false;
            const v = a.value;
            if (Array.isArray(v)) return v.length > 0;
            if (v === null || v === undefined) return false;
            return String(v).trim().length > 0;
        }).length;
        if (nonEmptyAnswerCount === 0) {
            return NextResponse.json({ 
                error: 'No answers provided' 
            }, { status: 400 });
        }

        // Get IP address and user agent for rate limiting
        const ipAddress = req.headers.get('x-forwarded-for') || 
                         req.headers.get('x-real-ip') || 
                         'unknown';
        const userAgent = req.headers.get('user-agent') || 'unknown';

        // Submit the response
        const submissionData = {
            surveyId: (survey as any).id,
            demographics: body.demographics,
            answers: body.answers
        };

        const result = await SurveyRepo.submitSurveyResponse(
            submissionData, 
            ipAddress, 
            userAgent
        );

        // Generate digital twin persona and store in Pinecone with retry logic
        await ensureDigitalTwinInPinecone(result.agentToken, body, survey as any);

        // Fire-and-forget enrichment: aggregate all answers across this twin and regenerate persona/capabilities
        (async () => {
            try {
                const { openSql } = await import('@/app/utils/database/db');
                const db = await openSql();
                // Get latest demographics and survey title
                const [latestRows] = await db.execute<any[]>(
                    `SELECT sr.demographics, s.title
                     FROM survey_responses sr
                     JOIN surveys s ON s.id = sr.survey_id
                     WHERE sr.agent_token = ?
                     ORDER BY sr.submitted_at DESC
                     LIMIT 1`,
                    [result.agentToken]
                );
                if (!latestRows?.[0]) return;
                const latest = {
                    demographics: latestRows[0].demographics,
                    surveyTitle: latestRows[0].title || (survey as any).title || 'Multiple Surveys'
                };

                // Aggregate all answers for this twin
                const [answerRows] = await db.execute<any[]>(
                    `SELECT sq.prompt AS question_text, sa.answer_value
                     FROM survey_responses sr
                     JOIN survey_answers sa ON sa.response_id = sr.id
                     JOIN survey_questions sq ON sq.id = sa.question_id
                     WHERE sr.agent_token = ?
                     ORDER BY sr.submitted_at ASC, sa.id ASC`,
                    [result.agentToken]
                );
                if (!answerRows || answerRows.length === 0) return;
                const answers = answerRows.map((r: any, idx: number) => ({ questionId: idx + 1, questionText: r.question_text, value: r.answer_value }));

                // Regenerate persona from aggregated data and persist
                const principles = await DigitalTwinService.generatePersonaPrinciples(latest.demographics, answers, latest.surveyTitle);
                await DigitalTwinService.storeInPinecone(
                    result.agentToken,
                    latest.demographics,
                    principles,
                    answers,
                    latest.surveyTitle,
                    String((survey as any).created_by)
                );
            } catch (e) {
                console.warn('[Enrichment] Non-blocking enrichment failed:', e);
            }
        })();
        
        // Send confirmation email (non-blocking) - different email for new vs returning users
        if (body.demographics?.email) {
            if (result.isExistingTwin) {
                EmailService.sendSurveyConfirmationReturning(
                    body.demographics.email,
                    body.demographics.name || '',
                    result.agentToken
                );
            } else {
                EmailService.sendSurveyConfirmation(
                    body.demographics.email,
                    body.demographics.name || '',
                    result.agentToken
                );
            }
        }
        
        return NextResponse.json({ 
            status: true, 
            responseId: result.responseId,
            agentToken: result.agentToken,
            isExistingTwin: result.isExistingTwin,
            message: result.isExistingTwin 
                ? 'Survey response submitted successfully. Tokens earned!' 
                : 'Survey response submitted successfully. Create an account to claim your tokens!' 
        });

    } catch (error) {
        console.error("Error in POST /api/surveys/[slug]/submit:", error);
        return NextResponse.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        }, { status: 500 });
    }
} 