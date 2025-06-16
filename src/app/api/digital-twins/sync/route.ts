import { NextRequest, NextResponse } from "next/server";
import { openSql as getMySQLConnection } from '@/app/utils/database/db';
import { DigitalTwinService } from "@/app/utils/services/digital-twin-service";
import { RowDataPacket } from 'mysql2/promise';

// POST /api/digital-twins/sync - Sync missing digital twins from database to Pinecone
export async function POST(req: NextRequest) {
    try {
        // Get user info from middleware
        const userId = req.headers.get('x-user-id');
        const userRole = req.headers.get('x-user-role');
        
        // Only allow admin users to run sync
        if (!userId || userRole !== 'admin') {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }
        
        console.log('🔄 Starting digital twins sync process...');
        
        const db = await getMySQLConnection();
        
        // Get all digital twins from database with their survey data
        const [agents] = await db.execute<RowDataPacket[]>(`
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
            GROUP BY ra.id, ra.agent_token, ra.email, ra.created_from_response_id, ra.created_at, sr.survey_id, sr.demographics, s.title
            ORDER BY ra.created_at DESC
        `);

        console.log(`📊 Found ${agents.length} digital twins in database`);

        // Check which ones exist in Pinecone
        const existingInPinecone = await DigitalTwinService.getAllDigitalTwins(100);
        const existingTokens = new Set(
            existingInPinecone.map(match => match.metadata?.agentId).filter(Boolean)
        );

        console.log(`📊 Found ${existingTokens.size} digital twins in Pinecone`);

        let syncedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        // Process missing ones
        for (const agent of agents) {
            if (!existingTokens.has(agent.agent_token)) {
                console.log(`🔧 Syncing missing digital twin: ${agent.agent_token}`);
                
                try {
                    const demographics = agent.demographics; // Already parsed by MySQL driver
                    
                    // Parse answers
                    const answers = [];
                    if (agent.answers_data) {
                        const answerPairs = agent.answers_data.split('###');
                        for (const pair of answerPairs) {
                            const [questionText, answerValue] = pair.split('|||');
                            if (questionText && answerValue) {
                                answers.push({
                                    questionId: Math.random(), // Not critical for regeneration
                                    questionText: questionText.trim(),
                                    value: answerValue.trim()
                                });
                            }
                        }
                    }

                    if (answers.length === 0) {
                        console.log(`⚠️  No answers found for ${agent.agent_token}, skipping`);
                        skippedCount++;
                        continue;
                    }

                    // Generate persona principles
                    const principles = await DigitalTwinService.generatePersonaPrinciples(
                        demographics,
                        answers,
                        agent.survey_title || 'Unknown Survey'
                    );

                    // Store in Pinecone
                    await DigitalTwinService.storeInPinecone(
                        agent.agent_token,
                        demographics,
                        principles,
                        answers,
                        agent.survey_title || 'Unknown Survey'
                    );

                    console.log(`✅ Successfully synced digital twin: ${agent.agent_token}`);
                    syncedCount++;
                    
                } catch (error) {
                    console.error(`❌ Failed to sync ${agent.agent_token}:`, error instanceof Error ? error.message : String(error));
                    errorCount++;
                }
            } else {
                skippedCount++;
            }
        }

        const summary = {
            total_in_database: agents.length,
            total_in_pinecone: existingTokens.size,
            synced: syncedCount,
            skipped: skippedCount,
            errors: errorCount
        };

        console.log('📈 Sync Summary:', summary);

        return NextResponse.json({ 
            status: true,
            message: 'Digital twins sync completed',
            summary
        });

    } catch (error) {
        console.error('Error in digital twins sync:', error);
        return NextResponse.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        }, { status: 500 });
    }
}

// GET /api/digital-twins/sync - Check sync status
export async function GET(req: NextRequest) {
    try {
        // Get user info from middleware
        const userId = req.headers.get('x-user-id');
        const userRole = req.headers.get('x-user-role');
        
        // Only allow admin users to check sync status
        if (!userId || userRole !== 'admin') {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }
        
        const db = await getMySQLConnection();
        
        // Count digital twins in database
        const [dbCount] = await db.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM responder_agents'
        );
        
        // Count digital twins in Pinecone
        const pineconeResults = await DigitalTwinService.getAllDigitalTwins(1000);
        
        const status = {
            database_count: dbCount[0].count,
            pinecone_count: pineconeResults.length,
            in_sync: dbCount[0].count === pineconeResults.length,
            missing_in_pinecone: Math.max(0, dbCount[0].count - pineconeResults.length)
        };

        return NextResponse.json({ 
            status: true,
            sync_status: status
        });

    } catch (error) {
        console.error('Error checking sync status:', error);
        return NextResponse.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        }, { status: 500 });
    }
} 