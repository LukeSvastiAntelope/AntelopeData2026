import { NextRequest, NextResponse } from "next/server";
import { openSql as getMySQLConnection } from '@/app/utils/database/db';
import { DigitalTwinService } from "@/app/utils/services/digital-twin-service";
import { RowDataPacket } from 'mysql2/promise';

// POST /api/digital-twins/migrate-ownership - Migrate existing digital twins to include createdBy field
export async function POST(req: NextRequest) {
    try {
        // Get user info from middleware
        const userId = req.headers.get('x-user-id');
        const userRole = req.headers.get('x-user-role');
        
        // Only allow admin users to run migration (or for now, any authenticated user for testing)
        if (!userId) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        
        console.log('🔄 Starting digital twins ownership migration...');
        
        const db = await getMySQLConnection();
        
        // Get all digital twins from Pinecone to see which ones need migration
        const existingInPinecone = await DigitalTwinService.getAllDigitalTwins(1000);
        console.log(`📊 Found ${existingInPinecone.length} digital twins in Pinecone`);

        let migratedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        // Process each digital twin
        for (const twin of existingInPinecone) {
            const agentToken = twin.metadata?.agentId;
            const hasCreatedBy = twin.metadata?.createdBy;
            
            if (!agentToken) {
                console.log('⚠️ Skipping twin with no agentId');
                skippedCount++;
                continue;
            }

            if (hasCreatedBy) {
                console.log(`✅ Twin ${agentToken} already has createdBy: ${hasCreatedBy}`);
                skippedCount++;
                continue;
            }

            console.log(`🔧 Migrating digital twin: ${agentToken}`);
            
            try {
                // Get the survey creator for this digital twin
                const [agentResults] = await db.execute<RowDataPacket[]>(`
                    SELECT 
                        ra.agent_token, ra.created_from_response_id,
                        s.created_by as survey_creator, s.title as survey_title,
                        sr.demographics
                    FROM responder_agents ra
                    LEFT JOIN survey_responses sr ON ra.created_from_response_id = sr.id  
                    LEFT JOIN surveys s ON sr.survey_id = s.id
                    WHERE ra.agent_token = ?
                `, [agentToken]);

                if (agentResults.length === 0) {
                    console.log(`⚠️ No database record found for ${agentToken}`);
                    errorCount++;
                    continue;
                }

                const agentData = agentResults[0];
                const surveyCreatorId = agentData.survey_creator;

                if (!surveyCreatorId) {
                    console.log(`⚠️ No survey creator found for ${agentToken}`);
                    errorCount++;
                    continue;
                }

                // Update the digital twin in Pinecone by re-storing it with the createdBy field
                const demographics = agentData.demographics;
                const principles = twin.metadata?.principles ? JSON.parse(twin.metadata.principles) : {};
                const answers = twin.metadata?.answers ? JSON.parse(twin.metadata.answers) : [];
                const surveyTitle = agentData.survey_title || twin.metadata?.surveyTitle || 'Unknown Survey';

                await DigitalTwinService.storeInPinecone(
                    agentToken,
                    demographics,
                    principles,
                    answers,
                    surveyTitle,
                    String(surveyCreatorId)
                );

                console.log(`✅ Successfully migrated digital twin: ${agentToken} -> createdBy: ${surveyCreatorId}`);
                migratedCount++;
                
            } catch (error) {
                console.error(`❌ Failed to migrate ${agentToken}:`, error instanceof Error ? error.message : String(error));
                errorCount++;
            }
        }

        const summary = {
            total_in_pinecone: existingInPinecone.length,
            migrated: migratedCount,
            skipped: skippedCount,
            errors: errorCount
        };

        console.log('📈 Migration Summary:', summary);

        return NextResponse.json({ 
            status: true,
            message: 'Digital twins ownership migration completed',
            summary
        });

    } catch (error) {
        console.error('Error in digital twins ownership migration:', error);
        return NextResponse.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        }, { status: 500 });
    }
} 