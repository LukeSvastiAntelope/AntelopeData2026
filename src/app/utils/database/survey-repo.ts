import { openSql as getMySQLConnection } from "./db";
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { 
    SurveyDB, 
    SurveyQuestionDB, 
    SurveyResponseDB, 
    SurveyAnswerDB, 
    ResponderAgentDB,
    CreateSurveyInput,
    SubmitSurveyInput,
    Survey,
    SurveyQuestion,
    SurveyResponse,
    ResponderAgent
} from "../interface";
import { generateConfirmationToken } from "../api/token";
import { randomUUID } from 'crypto';

export const SurveyRepo = {
    createSurvey: async (data: any, createdBy: number) => {
        const db = await getMySQLConnection();
        const connection = await db.getConnection();
        
        try {
            await connection.beginTransaction();
            
            // Generate unique slug using UUID for guaranteed uniqueness
            const baseSlug = data.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .substring(0, 50); // Limit length
            
            // Create a unique slug with UUID suffix
            const uniqueId = randomUUID().split('-')[0]; // first segment (8 chars)
            const slug = `${baseSlug}-${uniqueId}`;
            
            const startAt = data.startAt ?? null; // Expect ISO string or null
            const endAt   = data.endAt ?? null;
            
            let status: string = 'draft';
            if (data.autoPublish) {
                if (startAt && new Date(startAt) > new Date()) {
                    status = 'scheduled';
                } else {
                    status = 'published';
                }
            }
            
            // Insert survey meta
            const [surveyResult] = await connection.execute<ResultSetHeader>(
                `INSERT INTO surveys (title, description, slug, created_by, is_public, status, start_at, end_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [data.title, data.description, slug, createdBy, data.isPublic, status, startAt, endAt]
            );
            
            const surveyId = surveyResult.insertId;
            
            // Insert questions
            for (const question of data.questions) {
                await connection.execute(
                    `INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        surveyId,
                        question.type || 'text',
                        question.prompt || '',
                        question.options ? JSON.stringify(question.options) : null,
                        question.isRequired ? 1 : 0,
                        question.order || 1
                    ]
                );
            }
            
            await connection.commit();
            connection.release();
            return surveyId;
            
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
    },

    // Fetch survey only if currently active
    getSurveyBySlug: async (slug: string) => {
        const db = await getMySQLConnection();
        
        const [rows] = await db.execute<RowDataPacket[]>(
            "SELECT * FROM surveys WHERE slug = ? AND status = 'active'",
            [slug]
        );
        
        if (!rows[0]) return null;
        
        const survey = rows[0];
        
        // Get questions
        const [questionRows] = await db.execute<RowDataPacket[]>(
            'SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY question_order ASC',
            [survey.id]
        );
        
        return {
            ...survey,
            questions: questionRows.map((q: any) => ({
                ...q,
                options: q.options // MySQL JSON field already returns parsed data
            }))
        };
    },

    // Fetch survey regardless of status (used to distinguish 404 vs 410)
    getSurveyBySlugAny: async (slug: string) => {
        const db = await getMySQLConnection();
        
        const [rows] = await db.execute<RowDataPacket[]>(
            'SELECT * FROM surveys WHERE slug = ? LIMIT 1',
            [slug]
        );
        return rows[0] || null;
    },

    submitSurveyResponse: async (data: any, ipAddress: string, userAgent: string) => {
        const db = await getMySQLConnection();
        const connection = await db.getConnection();
        
        try {
            await connection.beginTransaction();
            
            // Insert survey response
            const [responseResult] = await connection.execute<ResultSetHeader>(
                `INSERT INTO survey_responses (survey_id, demographics, ip_address, user_agent) 
                 VALUES (?, ?, ?, ?)`,
                [data.surveyId, JSON.stringify(data.demographics), ipAddress, userAgent]
            );
            
            const responseId = responseResult.insertId;
            
            // Insert answers
            for (const answer of data.answers) {
                await connection.execute(
                    'INSERT INTO survey_answers (response_id, question_id, answer_value) VALUES (?, ?, ?)',
                    [responseId, answer.questionId, Array.isArray(answer.value) ? JSON.stringify(answer.value) : answer.value]
                );
            }
            
            // Handle digital twin creation/linking
            const email = data.demographics?.email;
            let agentToken;
            let isExistingTwin = false;
            
            if (email) {
                const [existingAgents] = await connection.execute<RowDataPacket[]>(
                    'SELECT agent_token FROM responder_agents WHERE email = ?',
                    [email]
                );
                
                if (existingAgents.length > 0) {
                    // Use existing agent token and link this response to the existing digital twin
                    agentToken = existingAgents[0].agent_token;
                    isExistingTwin = true;
                    
                    // Update the survey_response to include the agent_token
                    await connection.execute(
                        'UPDATE survey_responses SET agent_token = ? WHERE id = ?',
                        [agentToken, responseId]
                    );
                    
                    console.log(`🔄 Using existing digital twin for ${email}: ${agentToken}, linked to response ${responseId}`);
                } else {
                    // Create new responder agent
                    agentToken = `agent_${responseId}_${Date.now()}`;
                    
                    await connection.execute(
                        `INSERT INTO responder_agents (created_from_response_id, agent_token, email, base_profile) 
                         VALUES (?, ?, ?, ?)`,
                        [responseId, agentToken, email, JSON.stringify({ demographics: data.demographics, status: 'initial' })]
                    );
                    
                    // Update the survey_response to include the agent_token
                    await connection.execute(
                        'UPDATE survey_responses SET agent_token = ? WHERE id = ?',
                        [agentToken, responseId]
                    );
                    
                    console.log(`✅ Created new digital twin for ${email}: ${agentToken}`);
                }
            } else {
                // No email provided, create anonymous agent
                agentToken = `agent_${responseId}_${Date.now()}`;
                
                await connection.execute(
                    `INSERT INTO responder_agents (created_from_response_id, agent_token, base_profile) 
                     VALUES (?, ?, ?)`,
                    [responseId, agentToken, JSON.stringify({ demographics: data.demographics, status: 'initial' })]
                );
                
                // Update the survey_response to include the agent_token
                await connection.execute(
                    'UPDATE survey_responses SET agent_token = ? WHERE id = ?',
                    [agentToken, responseId]
                );
            }
            
            await connection.commit();
            connection.release();
            
            return { responseId, agentToken, isExistingTwin };
            
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
    },

    getSurveysByCreator: async (createdBy: number) => {
        const db = await getMySQLConnection();
        
        const [rows] = await db.execute<RowDataPacket[]>(
            `SELECT s.*, COUNT(sr.id) as response_count 
             FROM surveys s 
             LEFT JOIN survey_responses sr ON s.id = sr.survey_id 
             WHERE s.created_by = ? 
             GROUP BY s.id 
             ORDER BY s.created_at DESC`,
            [createdBy]
        );
        
        return rows;
    },

    getAllSurveys: async () => {
        const db = await getMySQLConnection();
        
        const [rows] = await db.execute<RowDataPacket[]>(
            `SELECT s.*, COUNT(sr.id) as response_count 
             FROM surveys s 
             LEFT JOIN survey_responses sr ON s.id = sr.survey_id 
             GROUP BY s.id 
             ORDER BY s.created_at DESC`
        );
        
        return rows;
    },

    getResponderAgentByToken: async (token: string) => {
        const db = await getMySQLConnection();
        
        const [rows] = await db.execute<RowDataPacket[]>(
            'SELECT * FROM responder_agents WHERE agent_token = ?',
            [token]
        );
        
        if (!rows[0]) return null;
        
        const row = rows[0];
        
        return {
            ...row,
            baseProfile: row.base_profile // MySQL JSON field already returns parsed data
        };
    },

    getResponderAgentByEmail: async (email: string) => {
        const db = await getMySQLConnection();
        
        const [rows] = await db.execute<RowDataPacket[]>(
            'SELECT * FROM responder_agents WHERE email = ?',
            [email]
        );
        
        if (!rows[0]) return null;
        
        const row = rows[0];
        
        return {
            ...row,
            baseProfile: row.base_profile // MySQL JSON field already returns parsed data
        };
    },

    updateResponderAgentProfile: async (agentToken: string, newProfile: any) => {
        const db = await getMySQLConnection();
        
        await db.execute(
            'UPDATE responder_agents SET base_profile = ?, updated_at = CURRENT_TIMESTAMP WHERE agent_token = ?',
            [JSON.stringify(newProfile), agentToken]
        );
        
        return true;
    },

    getSurveyById: async (surveyId: number, createdBy: number) => {
        const db = await getMySQLConnection();
        
        const [rows] = await db.execute<RowDataPacket[]>(
            "SELECT * FROM surveys WHERE id = ? AND created_by = ?",
            [surveyId, createdBy]
        );
        
        if (!rows[0]) return null;
        
        const survey = rows[0];
        
        // Get questions
        const [questionRows] = await db.execute<RowDataPacket[]>(
            'SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY question_order ASC',
            [survey.id]
        );
        
        return {
            ...survey,
            questions: questionRows.map((q: any) => ({
                ...q,
                options: q.options // MySQL JSON field already returns parsed data
            }))
        };
    },

    updateSurvey: async (surveyId: number, data: any, createdBy: number) => {
        const db = await getMySQLConnection();
        const connection = await db.getConnection();
        
        try {
            await connection.beginTransaction();
            
            // Check if survey exists and belongs to user
            const [existingRows] = await connection.execute<RowDataPacket[]>(
                "SELECT id FROM surveys WHERE id = ? AND created_by = ?",
                [surveyId, createdBy]
            );
            
            if (!existingRows[0]) {
                await connection.rollback();
                connection.release();
                return false;
            }
            
            // Only regenerate slug if title changed significantly
            // Get current survey to check if slug needs updating
            const [currentRows] = await connection.execute<RowDataPacket[]>(
                "SELECT slug, title FROM surveys WHERE id = ?",
                [surveyId]
            );
            
            let slug = currentRows[0].slug; // Keep existing slug by default
            
            // Only generate new slug if title changed significantly
            if (data.title !== currentRows[0].title) {
                const baseSlug = data.title
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '')
                    .substring(0, 50);
                
                const uniqueId = randomUUID().split('-')[0];
                slug = `${baseSlug}-${uniqueId}`;
            }
            
            // Update survey
            await connection.execute(
                `UPDATE surveys SET title = ?, description = ?, slug = ?, is_public = ? WHERE id = ?`,
                [data.title, data.description, slug, data.isPublic, surveyId]
            );
            
            // Delete existing questions
            await connection.execute(
                'DELETE FROM survey_questions WHERE survey_id = ?',
                [surveyId]
            );
            
            // Create new questions
            for (const question of data.questions) {
                await connection.execute(
                    `INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        surveyId,
                        question.type || 'text',
                        question.prompt || '',
                        question.options ? JSON.stringify(question.options) : null,
                        question.isRequired ? 1 : 0,
                        question.order || 1
                    ]
                );
            }
            
            await connection.commit();
            connection.release();
            return true;
            
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
    },

    publishSurvey: async (surveyId: number, data: any, createdBy: number) => {
        const db = await getMySQLConnection();
        const connection = await db.getConnection();
        
        try {
            await connection.beginTransaction();
            
            // Check if survey exists and belongs to user
            const [existingRows] = await connection.execute<RowDataPacket[]>(
                "SELECT id FROM surveys WHERE id = ? AND created_by = ?",
                [surveyId, createdBy]
            );
            
            if (!existingRows[0]) {
                await connection.rollback();
                connection.release();
                return false;
            }
            
            // Only regenerate slug if title changed significantly
            // Get current survey to check if slug needs updating
            const [currentRows] = await connection.execute<RowDataPacket[]>(
                "SELECT slug, title FROM surveys WHERE id = ?",
                [surveyId]
            );
            
            let slug = currentRows[0].slug; // Keep existing slug by default
            
            // Only generate new slug if title changed significantly
            if (data.title !== currentRows[0].title) {
                const baseSlug = data.title
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '')
                    .substring(0, 50);
                
                const uniqueId = randomUUID().split('-')[0];
                slug = `${baseSlug}-${uniqueId}`;
            }
            
            const startAt = data.startAt ?? null;
            const endAt   = data.endAt ?? null;

            // Determine status based on scheduling
            let newStatus = 'published';
            if (startAt && new Date(startAt) > new Date()) {
                newStatus = 'scheduled';
            }

            await connection.execute(
                `UPDATE surveys 
                 SET title = ?, description = ?, slug = ?, is_public = ?, status = ?, start_at = ?, end_at = ? 
                 WHERE id = ?`,
                [data.title, data.description, slug, data.isPublic, newStatus, startAt, endAt, surveyId]
            );
            
            // Delete existing questions
            await connection.execute(
                'DELETE FROM survey_questions WHERE survey_id = ?',
                [surveyId]
            );
            
            // Create new questions
            for (const question of data.questions) {
                await connection.execute(
                    `INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        surveyId,
                        question.type || 'text',
                        question.prompt || '',
                        question.options ? JSON.stringify(question.options) : null,
                        question.isRequired ? 1 : 0,
                        question.order || 1
                    ]
                );
            }
            
            await connection.commit();
            connection.release();
            return true;
            
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
    },

    getSurveyAnalytics: async (surveyId: number, createdBy: number) => {
        const db = await getMySQLConnection();
        
        try {
            // Get survey details
            const [surveyRows] = await db.execute<RowDataPacket[]>(
                "SELECT * FROM surveys WHERE id = ? AND created_by = ?",
                [surveyId, createdBy]
            );
            
            if (!surveyRows[0]) return null;
            
            const survey = surveyRows[0];
            
            // Get all responses with demographics and agent tokens
            const [responseRows] = await db.execute<RowDataPacket[]>(
                `SELECT 
                    sr.id,
                    sr.demographics,
                    sr.submitted_at,
                    sr.agent_token
                FROM survey_responses sr
                WHERE sr.survey_id = ?
                ORDER BY sr.submitted_at DESC`,
                [surveyId]
            );
            
            // Get questions for this survey
            const [questionRows] = await db.execute<RowDataPacket[]>(
                'SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY question_order ASC',
                [surveyId]
            );
            
            // For each response, get their answers
            const responses = [];
            for (const response of responseRows) {
                const [answerRows] = await db.execute<RowDataPacket[]>(
                    `SELECT 
                        sa.question_id,
                        sa.answer_value,
                        sq.prompt as question_text
                    FROM survey_answers sa
                    JOIN survey_questions sq ON sa.question_id = sq.id
                    WHERE sa.response_id = ?`,
                    [response.id]
                );
                
                responses.push({
                    id: response.id,
                    submitted_at: response.submitted_at,
                    demographics: response.demographics, // Already parsed JSON
                    agentToken: response.agent_token,
                    answers: answerRows.map((answer: any) => ({
                        questionId: answer.question_id,
                        questionText: answer.question_text,
                        value: answer.answer_value
                    }))
                });
            }
            
            return {
                survey,
                responses
            };
            
        } catch (error) {
            throw error;
        }
    },

    getSurveyResponse: async (surveyId: number, responseId: number) => {
        const db = await getMySQLConnection();
        
        try {
            // Get the specific response with demographics
            const [responseRows] = await db.execute<RowDataPacket[]>(
                `SELECT 
                    sr.id,
                    sr.demographics,
                    sr.submitted_at,
                    ra.agent_token
                FROM survey_responses sr
                LEFT JOIN responder_agents ra ON sr.id = ra.created_from_response_id
                WHERE sr.survey_id = ? AND sr.id = ?`,
                [surveyId, responseId]
            );
            
            if (!responseRows[0]) return null;
            
            const response = responseRows[0];
            
            // Get all answers for this response with question details
            const [answerRows] = await db.execute<RowDataPacket[]>(
                `SELECT 
                    sa.id,
                    sa.question_id,
                    sa.answer_value,
                    sq.prompt,
                    sq.type,
                    sq.options
                FROM survey_answers sa
                JOIN survey_questions sq ON sa.question_id = sq.id
                WHERE sa.response_id = ?
                ORDER BY sq.question_order ASC`,
                [responseId]
            );
            
            return {
                id: response.id,
                submitted_at: response.submitted_at,
                demographics: response.demographics, // Already parsed JSON
                agent_token: response.agent_token,
                answers: answerRows.map((answer: any) => ({
                    id: answer.id,
                    question_id: answer.question_id,
                    answer_value: answer.answer_value,
                    question: {
                        id: answer.question_id,
                        prompt: answer.prompt,
                        type: answer.type,
                        options: answer.options ? (() => {
                            // If it's already an array, return as is
                            if (Array.isArray(answer.options)) {
                                return answer.options;
                            }
                            
                            // If it's not a string, convert to string first
                            const optionsStr = typeof answer.options === 'string' ? answer.options : String(answer.options);
                            
                            try {
                                // Try to parse as JSON first
                                return JSON.parse(optionsStr);
                            } catch {
                                // If not JSON, treat as comma-separated string
                                return optionsStr.split(',').map((opt: string) => opt.trim());
                            }
                        })() : null
                    }
                }))
            };
            
        } catch (error) {
            throw error;
        }
    },

    // Close a survey manually
    closeSurvey: async (surveyId: number, createdBy: number) => {
        const db = await getMySQLConnection();
        const [result] = await db.execute<ResultSetHeader>(
            `UPDATE surveys SET status = 'closed' WHERE id = ? AND created_by = ?`,
            [surveyId, createdBy]
        );
        return (result as ResultSetHeader).affectedRows > 0;
    },

    // Re-open a previously closed survey (if still within schedule or no schedule)
    reopenSurvey: async (surveyId: number, createdBy: number) => {
        const db = await getMySQLConnection();

        // Fetch timing info first
        const [rows] = await db.execute<RowDataPacket[]>(
            `SELECT start_at, end_at FROM surveys WHERE id = ? AND created_by = ? LIMIT 1`,
            [surveyId, createdBy]
        );
        if (!rows[0]) return false;

        const { start_at, end_at } = rows[0];

        let newStatus = 'published';
        if (start_at && new Date(start_at) > new Date()) {
            newStatus = 'scheduled';
        }

        const [result] = await db.execute<ResultSetHeader>(
            `UPDATE surveys SET status = ? WHERE id = ? AND created_by = ?`,
            [newStatus, surveyId, createdBy]
        );
        return (result as ResultSetHeader).affectedRows > 0;
    },

    // Automatically close surveys whose end date has passed
    autoCloseExpired: async () => {
        const db = await getMySQLConnection();
        const [result] = await db.execute<ResultSetHeader>(
            `UPDATE surveys SET status = 'closed' 
             WHERE end_at IS NOT NULL AND end_at < NOW() AND status IN ('scheduled','published','active')`
        );
        return (result as ResultSetHeader).affectedRows;
    }
}; 