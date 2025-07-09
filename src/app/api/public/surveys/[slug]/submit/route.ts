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
            message: 'Survey response submitted successfully. Your digital twin has been created!' 
        });

    } catch (error) {
        console.error("Error in POST /api/surveys/[slug]/submit:", error);
        return NextResponse.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        }, { status: 500 });
    }
} 