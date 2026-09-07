import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/surveys/[id]/message-test
 * 
 * A/B message testing: sends different message variants to voter profiles
 * (digital twins) from a survey and compares their reactions.
 * 
 * Request body:
 * {
 *   messages: string[];           // 2-4 message variants to test
 *   cohortFilters?: object;       // Optional cohort filters
 *   maxProfiles?: number;         // Max voter profiles to test (default 20)
 *   question?: string;            // Custom question to ask about each message
 * }
 * 
 * Response:
 * {
 *   status: boolean;
 *   results: Array<{
 *     messageIndex: number;
 *     message: string;
 *     reactions: Array<{
 *       agentToken: string;
 *       demographics: object;
 *       sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
 *       reaction: string;
 *       convincingScore: number; // 1-5
 *     }>;
 *     summary: {
 *       avgConvincingScore: number;
 *       sentimentBreakdown: Record<string, number>;
 *       totalResponses: number;
 *     };
 *   }>;
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: surveyId } = await params;
    const userId = request.headers.get('x-user-id');
    
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { messages, cohortFilters, maxProfiles = 20, question } = body;

    if (!messages || !Array.isArray(messages) || messages.length < 2) {
      return NextResponse.json(
        { status: false, message: 'At least 2 message variants are required' },
        { status: 400 }
      );
    }

    if (messages.length > 4) {
      return NextResponse.json(
        { status: false, message: 'Maximum 4 message variants allowed' },
        { status: 400 }
      );
    }

    // Get voter profiles (digital twins) for this survey
    const twinsResponse = await fetch(
      `${request.nextUrl.origin}/api/digital-twins/search`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': request.headers.get('Authorization') || '',
        },
        body: JSON.stringify({
          query: '',
          topK: maxProfiles,
          surveyId: parseInt(surveyId),
          filters: cohortFilters
        }),
      }
    );

    const twinsData = await twinsResponse.json();
    
    if (!twinsData.status || !twinsData.results || twinsData.results.length === 0) {
      return NextResponse.json(
        { status: false, message: 'No voter profiles found for this survey. Collect responses first.' },
        { status: 404 }
      );
    }

    const profiles = twinsData.results.slice(0, maxProfiles);
    
    // For each message variant, query each voter profile
    const { createCompletion } = await import('../../../../utils/services/ai-service');
    
    const results = [];

    for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
      const message = messages[msgIdx];
      const reactions = [];

      for (const profile of profiles) {
        const demographics = profile.demographics || {};
        const demographicContext = Object.entries(demographics)
          .filter(([_, v]) => v && v !== '')
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');

        const testQuestion = question || 'What is your honest reaction to this message? Would it make you more or less likely to support the candidate or cause? Why?';

        const prompt = `You are responding as a voter with the following profile:
${demographicContext}

You have been shown the following political message:

"${message}"

${testQuestion}

Respond naturally as this voter would. Be specific about what resonates or doesn't. Include:
1. Your gut reaction (1-2 sentences)
2. A convincing score from 1-5 (1 = not at all convincing, 5 = very convincing)
3. Your overall sentiment: positive, negative, neutral, or mixed

Format your response as JSON:
{
  "reaction": "your natural response as this voter",
  "convincingScore": <number 1-5>,
  "sentiment": "positive|negative|neutral|mixed"
}`;

        try {
          const completion = await createCompletion({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'You are simulating a voter\'s reaction to a political message based on their demographic profile. Always respond with valid JSON.'
              },
              { role: 'user', content: prompt }
            ],
            temperature: 0.7,
          });

          const responseText = completion.choices?.[0]?.message?.content || '';
          
          // Parse the JSON response
          let parsed;
          try {
            // Try to extract JSON from the response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {
              reaction: responseText,
              convincingScore: 3,
              sentiment: 'neutral'
            };
          } catch {
            parsed = {
              reaction: responseText,
              convincingScore: 3,
              sentiment: 'neutral'
            };
          }

          reactions.push({
            agentToken: profile.agentToken,
            demographics: {
              age: demographics.age,
              gender: demographics.gender,
              party_affiliation: demographics.party_affiliation,
              ideology_spectrum: demographics.ideology_spectrum,
              state: demographics.state,
            },
            sentiment: parsed.sentiment || 'neutral',
            reaction: parsed.reaction || 'No response generated',
            convincingScore: Math.min(5, Math.max(1, parseInt(parsed.convincingScore) || 3)),
          });
        } catch (error) {
          console.error(`Error querying profile ${profile.agentToken}:`, error);
          // Skip failed profiles
        }
      }

      // Calculate summary stats
      const sentimentBreakdown: Record<string, number> = { positive: 0, negative: 0, neutral: 0, mixed: 0 };
      let totalScore = 0;

      reactions.forEach(r => {
        sentimentBreakdown[r.sentiment] = (sentimentBreakdown[r.sentiment] || 0) + 1;
        totalScore += r.convincingScore;
      });

      results.push({
        messageIndex: msgIdx,
        message,
        reactions,
        summary: {
          avgConvincingScore: reactions.length > 0 ? Math.round((totalScore / reactions.length) * 10) / 10 : 0,
          sentimentBreakdown,
          totalResponses: reactions.length,
        }
      });
    }

    return NextResponse.json({
      status: true,
      surveyId: parseInt(surveyId),
      totalProfiles: profiles.length,
      results,
    });

  } catch (error) {
    console.error('Message test error:', error);
    return NextResponse.json(
      { status: false, message: 'Failed to run message test' },
      { status: 500 }
    );
  }
}
