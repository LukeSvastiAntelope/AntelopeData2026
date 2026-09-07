import { NextRequest, NextResponse } from "next/server";
import { openSql as getMySQLConnection } from '@/app/utils/database/db';
import { DigitalTwinService } from "@/app/utils/services/digital-twin-service";
import { RowDataPacket } from 'mysql2/promise';

// GET /api/debug/digital-twins-status - Debug endpoint to check digital twins status
export async function GET(req: NextRequest) {
    try {
        const userId = req.headers.get('x-user-id');
        
        if (!userId) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        
        console.log('🔍 Debug: Current user ID:', userId);
        
        const db = await getMySQLConnection();
        
        // Get current user info
        const [userResults] = await db.execute<RowDataPacket[]>(
            'SELECT id, email, display_name FROM users WHERE id = ?',
            [userId]
        );
        
        // Get all users for reference
        const [allUsers] = await db.execute<RowDataPacket[]>(
            'SELECT id, email, display_name FROM users ORDER BY id'
        );
        
        // Get all digital twins from Pinecone
        const pineconeDigitalTwins = await DigitalTwinService.getAllDigitalTwins(100);
        
        // Get all digital twins from database
        const [dbDigitalTwins] = await db.execute<RowDataPacket[]>(`
            SELECT 
                ra.agent_token, ra.email as twin_email, ra.created_from_response_id,
                s.created_by as survey_creator, s.title as survey_title,
                u.email as creator_email, u.display_name as creator_name
            FROM responder_agents ra
            LEFT JOIN survey_responses sr ON ra.created_from_response_id = sr.id  
            LEFT JOIN surveys s ON sr.survey_id = s.id
            LEFT JOIN users u ON s.created_by = u.id
            ORDER BY ra.created_at DESC
        `);
        
        // Analyze Pinecone digital twins
        const pineconeAnalysis = pineconeDigitalTwins.map(twin => ({
            agentToken: twin.metadata?.agentId,
            createdBy: twin.metadata?.createdBy,
            surveyTitle: twin.metadata?.surveyTitle,
            hasCreatedBy: !!twin.metadata?.createdBy
        }));
        
        const status = {
            currentUser: userResults[0] || null,
            allUsers: allUsers,
            totalPineconeDigitalTwins: pineconeDigitalTwins.length,
            totalDbDigitalTwins: dbDigitalTwins.length,
            pineconeDigitalTwins: pineconeAnalysis,
            dbDigitalTwins: dbDigitalTwins,
            twinsWithCreatedBy: pineconeAnalysis.filter(t => t.hasCreatedBy).length,
            twinsWithoutCreatedBy: pineconeAnalysis.filter(t => !t.hasCreatedBy).length
        };

        return NextResponse.json({ 
            status: true,
            data: status
        });

    } catch (error) {
        console.error('Error in debug digital twins status:', error);
        return NextResponse.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        }, { status: 500 });
    }
} 