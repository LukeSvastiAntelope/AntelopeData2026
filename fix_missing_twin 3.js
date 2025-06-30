const mysql = require('mysql2/promise');
const { Pinecone } = require('@pinecone-database/pinecone');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: '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',
});

const pinecone = new Pinecone({
  apiKey: 'pcsk_3KDfm_SHcxsjyxiDueis9j66qYdns6X3QAtj5Km8a31QLxcmYgwXN9iq2XhYWaJpWebgE',
});

async function generatePersonaPrinciples(demographics, answers, surveyTitle) {
  const prompt = `You are an expert psychologist and data scientist. Based on the following survey response, create a comprehensive persona profile that captures this person's core principles, values, and response patterns.

Survey: "${surveyTitle}"

Demographics:
- Name: ${demographics.name}
- Age: ${demographics.age}
- Location: ${demographics.location}
- Occupation: ${demographics.occupation}
- Education: ${demographics.education}
- Income: ${demographics.income}
- Political Views: ${demographics.politicalViews}
- Interests: ${demographics.interests}

Survey Responses:
${answers.map(a => `Q: ${a.questionText}\nA: ${Array.isArray(a.value) ? a.value.join(', ') : a.value}`).join('\n\n')}

Based on this information, create a detailed persona profile. Return ONLY a valid JSON object with this structure:

{
  "coreValues": ["value1", "value2", "value3"],
  "personalityTraits": ["trait1", "trait2", "trait3"],
  "politicalLeanings": "detailed political stance",
  "interests": ["interest1", "interest2", "interest3"],
  "communicationStyle": "description of how they communicate",
  "decisionMakingStyle": "how they make decisions",
  "worldview": "their overall perspective on life and society",
  "demographicProfile": "summary of their demographic characteristics",
  "responsePatterns": ["pattern1", "pattern2", "pattern3"]
}

Guidelines:
- Infer deep psychological patterns from their responses
- Consider how demographics influence their worldview
- Identify consistent themes across their answers
- Create actionable insights for predicting future responses
- Be specific and nuanced, not generic
- Focus on what makes this person unique`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are an expert psychologist creating detailed persona profiles from survey data. Return only valid JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from OpenAI');
    }

    const cleanedResponse = response.replace(/```json\n?|\n?```/g, '').trim();
    const principles = JSON.parse(cleanedResponse);
    
    return principles;
  } catch (error) {
    console.error('Error generating persona principles:', error);
    throw new Error('Failed to generate persona principles');
  }
}

async function storeInPinecone(agentToken, demographics, principles, answers, surveyTitle) {
  try {
    const index = pinecone.index('prediction-results');

    const textForEmbedding = `
      Survey: ${surveyTitle}
      
      Demographics:
      Name: ${demographics.name}
      Age: ${demographics.age}
      Location: ${demographics.location}
      Occupation: ${demographics.occupation}
      Education: ${demographics.education}
      Political Views: ${demographics.politicalViews}
      Interests: ${demographics.interests}
      
      Core Values: ${principles.coreValues.join(', ')}
      Personality: ${principles.personalityTraits.join(', ')}
      Political Leanings: ${principles.politicalLeanings}
      Communication Style: ${principles.communicationStyle}
      Decision Making: ${principles.decisionMakingStyle}
      Worldview: ${principles.worldview}
      
      Survey Responses:
      ${answers.map(a => `${a.questionText}: ${Array.isArray(a.value) ? a.value.join(', ') : a.value}`).join('\n')}
    `.trim();

    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: textForEmbedding,
    });

    const embedding = embeddingResponse.data[0].embedding;

    await index.upsert([
      {
        id: `digital-twin-${agentToken}`,
        values: embedding,
        metadata: {
          description: `Digital twin from survey: ${surveyTitle}`,
          choice: 'digital-twin',
          amount: 0,
          status: 'active',
          created_at: new Date().toISOString(),
          agentId: agentToken,
          predictionId: 0,
          confidence: 1.0,
          reasoning: `Digital twin created from ${surveyTitle} survey responses`,
          riskAssessment: 'low',
          result: 'active',
          
          type: 'digital-twin',
          surveyTitle,
          demographics: JSON.stringify(demographics),
          principles: JSON.stringify(principles),
          answers: JSON.stringify(answers),
          email: demographics.email,
          age: parseInt(demographics.age) || 0,
          location: demographics.location,
          occupation: demographics.occupation,
          politicalViews: demographics.politicalViews,
          education: demographics.education,
          income: demographics.income,
        }
      }
    ]);

    console.log(`✅ Digital twin ${agentToken} stored in Pinecone`);
  } catch (error) {
    console.error('Error storing in Pinecone:', error);
    throw new Error('Failed to store digital twin in Pinecone');
  }
}

async function fixMissingTwin() {
  try {
    console.log('🔧 Fixing missing digital twin: agent_10_1749845979208');
    
    // Connect to database
    const connection = await mysql.createConnection({
      host: 'antelopedb-do-user-18192858-0.j.db.ondigitalocean.com',
      port: 25060,
      user: 'doadmin',
      password: 'AVNS_Zobsi59qAR_OQ9QGwDd',
      database: 'defaultdb',
      ssl: { rejectUnauthorized: false }
    });

    // Get the specific missing digital twin with survey data
    const [agents] = await connection.execute(`
      SELECT 
        ra.id, ra.agent_token, ra.email, ra.created_from_response_id, ra.created_at,
        sr.survey_id, sr.demographics, s.title as survey_title,
        GROUP_CONCAT(
          CONCAT(sq.prompt, '|||', sa.answer_value) 
          SEPARATOR '###'
        ) as answers_data
      FROM responder_agents ra
      LEFT JOIN survey_responses sr ON ra.created_from_response_id = sr.id  
      LEFT JOIN surveys s ON sr.survey_id = s.id
      LEFT JOIN survey_answers sa ON sr.id = sa.response_id
      LEFT JOIN survey_questions sq ON sa.question_id = sq.id
      WHERE ra.agent_token = ?
      GROUP BY ra.id, ra.agent_token, ra.email, ra.created_from_response_id, ra.created_at, sr.survey_id, sr.demographics, s.title
    `, ['agent_10_1749845979208']);

    if (agents.length === 0) {
      console.log('❌ Digital twin not found in database');
      return;
    }

    const agent = agents[0];
    console.log(`📋 Processing: ${agent.agent_token} (${agent.email})`);

    const demographics = agent.demographics; // Already parsed by MySQL driver
    
    // Parse answers
    const answers = [];
    if (agent.answers_data) {
      const answerPairs = agent.answers_data.split('###');
      for (const pair of answerPairs) {
        const [questionText, answerValue] = pair.split('|||');
        if (questionText && answerValue) {
          answers.push({
            questionId: Math.random(),
            questionText: questionText.trim(),
            value: answerValue.trim()
          });
        }
      }
    }

    console.log(`📝 Found ${answers.length} survey answers`);

    if (answers.length === 0) {
      console.log('⚠️  No answers found, skipping');
      return;
    }

    // Generate persona principles
    console.log('🧠 Generating persona principles...');
    const principles = await generatePersonaPrinciples(
      demographics,
      answers,
      agent.survey_title || 'Unknown Survey'
    );

    // Store in Pinecone
    console.log('💾 Storing in Pinecone...');
    await storeInPinecone(
      agent.agent_token,
      demographics,
      principles,
      answers,
      agent.survey_title || 'Unknown Survey'
    );

    console.log(`✅ Successfully fixed digital twin: ${agent.agent_token}`);
    
    await connection.end();

  } catch (error) {
    console.error('❌ Error fixing missing digital twin:', error);
  }
}

fixMissingTwin(); 