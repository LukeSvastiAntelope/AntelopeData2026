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
            
            // Check if source tracking columns exist
            const [sourceColumns] = await connection.execute<RowDataPacket[]>(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'surveys' AND COLUMN_NAME = 'source'`
            );
            
            const hasSourceTracking = sourceColumns.length > 0;
            
            // Insert survey meta with optional source tracking
            let surveyResult: ResultSetHeader;
            
            if (hasSourceTracking) {
                const source = data.source || 'native';
                const sourceMetadata = data.sourceMetadata ? JSON.stringify(data.sourceMetadata) : null;
                
                [surveyResult] = await connection.execute<ResultSetHeader>(
                    `INSERT INTO surveys (title, description, slug, created_by, is_public, status, start_at, end_at, source, source_metadata) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [data.title, data.description, slug, createdBy, data.isPublic, status, startAt, endAt, source, sourceMetadata]
                );
            } else {
                [surveyResult] = await connection.execute<ResultSetHeader>(
                    `INSERT INTO surveys (title, description, slug, created_by, is_public, status, start_at, end_at) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [data.title, data.description, slug, createdBy, data.isPublic, status, startAt, endAt]
                );
            }
            
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

    // Fetch survey only if currently active or published
    getSurveyBySlug: async (slug: string) => {
        const db = await getMySQLConnection();
        
        const [rows] = await db.execute<RowDataPacket[]>(
            "SELECT * FROM surveys WHERE slug = ? AND status IN ('active', 'published')",
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

    submitSurveyResponse: async (data: any, ipAddress: string, userAgent: string) => {
        const db = await getMySQLConnection();
        const connection = await db.getConnection();
        
        try {
            await connection.beginTransaction();
            
            // Check if source tracking columns exist in survey_responses
            const [responseSourceColumns] = await connection.execute<RowDataPacket[]>(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'survey_responses' AND COLUMN_NAME = 'source'`
            );
            
            const hasResponseSourceTracking = responseSourceColumns.length > 0;
            
            // Insert survey response with optional source tracking
            let responseResult: ResultSetHeader;
            
            if (hasResponseSourceTracking) {
                const source = data.source || 'native';
                [responseResult] = await connection.execute<ResultSetHeader>(
                    `INSERT INTO survey_responses (survey_id, demographics, ip_address, user_agent, source) 
                     VALUES (?, ?, ?, ?, ?)`,
                    [data.surveyId, JSON.stringify(data.demographics), ipAddress, userAgent, source]
                );
            } else {
                [responseResult] = await connection.execute<ResultSetHeader>(
                    `INSERT INTO survey_responses (survey_id, demographics, ip_address, user_agent) 
                     VALUES (?, ?, ?, ?)`,
                    [data.surveyId, JSON.stringify(data.demographics), ipAddress, userAgent]
                );
            }
            
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
            
            // Check if agent_token column exists in survey_responses
            const [agentTokenColumns] = await connection.execute<RowDataPacket[]>(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'survey_responses' AND COLUMN_NAME = 'agent_token'`
            );
            const hasAgentTokenColumn = agentTokenColumns.length > 0;
            
            // Check if email column exists in responder_agents
            const [emailColumns] = await connection.execute<RowDataPacket[]>(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'responder_agents' AND COLUMN_NAME = 'email'`
            );
            const hasEmailColumn = emailColumns.length > 0;
            
            if (email && hasEmailColumn) {
                const [existingAgents] = await connection.execute<RowDataPacket[]>(
                    'SELECT agent_token FROM responder_agents WHERE email = ?',
                    [email]
                );
                
                if (existingAgents.length > 0) {
                    // Use existing agent token and link this response to the existing digital twin
                    agentToken = existingAgents[0].agent_token;
                    isExistingTwin = true;
                    
                    // Update the survey_response to include the agent_token (if column exists)
                    if (hasAgentTokenColumn) {
                        await connection.execute(
                            'UPDATE survey_responses SET agent_token = ? WHERE id = ?',
                            [agentToken, responseId]
                        );
                    }
                    
                    console.log(`🔄 Using existing digital twin for ${email}: ${agentToken}, linked to response ${responseId}`);
                } else {
                    // Create new responder agent
                    agentToken = `agent_${responseId}_${Date.now()}`;
                    
                    if (hasEmailColumn) {
                        await connection.execute(
                            `INSERT INTO responder_agents (created_from_response_id, agent_token, email, base_profile) 
                             VALUES (?, ?, ?, ?)`,
                            [responseId, agentToken, email, JSON.stringify({ demographics: data.demographics, status: 'initial' })]
                        );
                    } else {
                        await connection.execute(
                            `INSERT INTO responder_agents (created_from_response_id, agent_token, base_profile) 
                             VALUES (?, ?, ?)`,
                            [responseId, agentToken, JSON.stringify({ demographics: data.demographics, status: 'initial' })]
                        );
                    }
                    
                    // Update the survey_response to include the agent_token (if column exists)
                    if (hasAgentTokenColumn) {
                        await connection.execute(
                            'UPDATE survey_responses SET agent_token = ? WHERE id = ?',
                            [agentToken, responseId]
                        );
                    }
                    
                    console.log(`✅ Created new digital twin for ${email}: ${agentToken}`);
                }
            } else {
                // No email provided or email column doesn't exist, create anonymous agent
                agentToken = `agent_${responseId}_${Date.now()}`;
                
                await connection.execute(
                    `INSERT INTO responder_agents (created_from_response_id, agent_token, base_profile) 
                     VALUES (?, ?, ?)`,
                    [responseId, agentToken, JSON.stringify({ demographics: data.demographics, status: 'initial' })]
                );
                
                // Update the survey_response to include the agent_token (if column exists)
                if (hasAgentTokenColumn) {
                    await connection.execute(
                        'UPDATE survey_responses SET agent_token = ? WHERE id = ?',
                        [agentToken, responseId]
                    );
                }
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
        
        // Check if source columns exist
        const [sourceColumns] = await db.execute<RowDataPacket[]>(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'surveys' AND COLUMN_NAME = 'source'`
        );
        
        const hasSourceTracking = sourceColumns.length > 0;
        
        if (hasSourceTracking) {
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
        } else {
            const [rows] = await db.execute<RowDataPacket[]>(
                `SELECT s.*, COUNT(sr.id) as response_count, 'native' as source, NULL as source_metadata
                 FROM surveys s 
                 LEFT JOIN survey_responses sr ON s.id = sr.survey_id 
                 WHERE s.created_by = ? 
                 GROUP BY s.id 
                 ORDER BY s.created_at DESC`,
                [createdBy]
            );
            return rows;
        }
    },

    getAllSurveys: async () => {
        const db = await getMySQLConnection();
        
        // Check if source columns exist
        const [sourceColumns] = await db.execute<RowDataPacket[]>(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'surveys' AND COLUMN_NAME = 'source'`
        );
        
        const hasSourceTracking = sourceColumns.length > 0;
        
        if (hasSourceTracking) {
            const [rows] = await db.execute<RowDataPacket[]>(
                `SELECT s.*, COUNT(sr.id) as response_count 
                 FROM surveys s 
                 LEFT JOIN survey_responses sr ON s.id = sr.survey_id 
                 GROUP BY s.id 
                 ORDER BY s.created_at DESC`
            );
            return rows;
        } else {
            const [rows] = await db.execute<RowDataPacket[]>(
                `SELECT s.*, COUNT(sr.id) as response_count, 'native' as source, NULL as source_metadata
                 FROM surveys s 
                 LEFT JOIN survey_responses sr ON s.id = sr.survey_id 
                 GROUP BY s.id 
                 ORDER BY s.created_at DESC`
            );
            return rows;
        }
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
    },

    // Delete a survey and all related data
    deleteSurvey: async (surveyId: number, createdBy: number) => {
        const db = await getMySQLConnection();
        const connection = await db.getConnection();
        
        try {
            await connection.beginTransaction();
            
            // Verify survey exists and belongs to user
            const [surveyRows] = await connection.execute<RowDataPacket[]>(
                "SELECT id FROM surveys WHERE id = ? AND created_by = ?",
                [surveyId, createdBy]
            );
            
            if (!surveyRows[0]) {
                await connection.rollback();
                connection.release();
                return false;
            }
            
            // Delete in order of dependencies:
            // 1. Delete survey answers
            await connection.execute(
                `DELETE sa FROM survey_answers sa 
                 INNER JOIN survey_responses sr ON sa.response_id = sr.id 
                 WHERE sr.survey_id = ?`,
                [surveyId]
            );
            
            // 2. Delete survey responses
            await connection.execute(
                'DELETE FROM survey_responses WHERE survey_id = ?',
                [surveyId]
            );
            
            // 3. Delete survey questions
            await connection.execute(
                'DELETE FROM survey_questions WHERE survey_id = ?',
                [surveyId]
            );
            
            // 4. Finally delete the survey itself
            await connection.execute(
                'DELETE FROM surveys WHERE id = ?',
                [surveyId]
            );
            
            await connection.commit();
            connection.release();
            return true;
            
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
    },

    // Clone a survey with all its questions and settings
    cloneSurvey: async (surveyId: number, createdBy: number) => {
        const db = await getMySQLConnection();
        const connection = await db.getConnection();
        
        try {
            await connection.beginTransaction();
            
            // Get the original survey with all questions
            const originalSurvey = await SurveyRepo.getSurveyById(surveyId, createdBy) as any;
            if (!originalSurvey) {
                await connection.rollback();
                connection.release();
                return null;
            }

            // Generate new title with "Copy of" prefix
            const newTitle = `Copy of ${originalSurvey.title}`;
            
            // Generate unique slug
            const baseSlug = newTitle
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .substring(0, 50);
            
            const uniqueId = randomUUID().split('-')[0];
            const newSlug = `${baseSlug}-${uniqueId}`;

            // Check if cloning columns exist
            const [cloningColumns] = await connection.execute<RowDataPacket[]>(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'surveys' 
                 AND COLUMN_NAME IN ('parent_survey_id', 'clone_count', 'cloned_at')`
            );
            
            const hasCloningSupport = cloningColumns.length >= 3;

            // Create the cloned survey
            let clonedSurveyResult: ResultSetHeader;
            
            if (hasCloningSupport) {
                // Use new cloning columns
                [clonedSurveyResult] = await connection.execute<ResultSetHeader>(
                    `INSERT INTO surveys (
                        title, description, slug, created_by, is_public, status, 
                        start_at, end_at, source, source_metadata, parent_survey_id, cloned_at
                    ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, 'clone', ?, ?, NOW())`,
                    [
                        newTitle,
                        originalSurvey.description,
                        newSlug,
                        createdBy,
                        originalSurvey.is_public,
                        null, // start_at - reset to null so user can set new schedule
                        null, // end_at - reset to null so user can set new schedule
                        JSON.stringify({
                            originalSurveyId: surveyId,
                            originalTitle: originalSurvey.title,
                            clonedAt: new Date().toISOString(),
                            clonedBy: createdBy
                        }),
                        surveyId
                    ]
                );
            } else {
                // Fallback for systems without cloning columns
                [clonedSurveyResult] = await connection.execute<ResultSetHeader>(
                    `INSERT INTO surveys (
                        title, description, slug, created_by, is_public, status, 
                        start_at, end_at, source, source_metadata
                    ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, 'clone', ?)`,
                    [
                        newTitle,
                        originalSurvey.description,
                        newSlug,
                        createdBy,
                        originalSurvey.is_public,
                        null, // start_at - reset to null so user can set new schedule
                        null, // end_at - reset to null so user can set new schedule
                        JSON.stringify({
                            originalSurveyId: surveyId,
                            originalTitle: originalSurvey.title,
                            clonedAt: new Date().toISOString(),
                            clonedBy: createdBy
                        })
                    ]
                );
            }

            const clonedSurveyId = clonedSurveyResult.insertId;

            // Clone all questions
            if (originalSurvey.questions && originalSurvey.questions.length > 0) {
                for (const question of originalSurvey.questions) {
                    await connection.execute(
                        `INSERT INTO survey_questions (
                            survey_id, type, prompt, options, is_required, question_order
                        ) VALUES (?, ?, ?, ?, ?, ?)`,
                        [
                            clonedSurveyId,
                            question.type,
                            question.prompt,
                            question.options ? JSON.stringify(question.options) : null,
                            question.is_required,
                            question.question_order
                        ]
                    );
                }
            }

            // Update clone count on original survey (if supported)
            if (hasCloningSupport) {
                await connection.execute(
                    'UPDATE surveys SET clone_count = clone_count + 1 WHERE id = ?',
                    [surveyId]
                );
            }

            await connection.commit();
            connection.release();

            return {
                surveyId: clonedSurveyId,
                slug: newSlug,
                title: newTitle,
                originalSurveyId: surveyId
            };
            
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
    },

    // Campaign Management Methods

    // Start a campaign (set status to active)
    startCampaign: async (surveyId: number, userId: number) => {
        const db = await getMySQLConnection();
        
        const [result] = await db.execute<ResultSetHeader>(
            `UPDATE surveys 
             SET status = 'active', campaign_start_at = NOW()
             WHERE id = ? AND created_by = ? AND status IN ('draft', 'scheduled', 'stopped')`,
            [surveyId, userId]
        );
        
        return (result as ResultSetHeader).affectedRows > 0;
    },

    // Stop a campaign (set status to stopped)
    stopCampaign: async (surveyId: number, userId: number, reason?: string) => {
        const db = await getMySQLConnection();
        
        const [result] = await db.execute<ResultSetHeader>(
            `UPDATE surveys 
             SET status = 'stopped', 
                 stopped_at = NOW(), 
                 stopped_by = ?,
                 stop_reason = ?
             WHERE id = ? AND created_by = ? AND status = 'active'`,
            [userId, reason || null, surveyId, userId]
        );
        
        return (result as ResultSetHeader).affectedRows > 0;
    },

    // Schedule a campaign
    scheduleCampaign: async (surveyId: number, userId: number, startAt: string, endAt?: string) => {
        const db = await getMySQLConnection();
        
        // Determine status based on start time
        const startDate = new Date(startAt);
        const now = new Date();
        const status = startDate > now ? 'scheduled' : 'active';
        
        const [result] = await db.execute<ResultSetHeader>(
            `UPDATE surveys 
             SET status = ?, 
                 campaign_start_at = ?,
                 campaign_end_at = ?
             WHERE id = ? AND created_by = ?`,
            [status, startAt, endAt || null, surveyId, userId]
        );
        
        return (result as ResultSetHeader).affectedRows > 0;
    },

    // Get campaign status and details
    getCampaignStatus: async (surveyId: number, userId: number) => {
        const db = await getMySQLConnection();
        
        const [rows] = await db.execute<RowDataPacket[]>(
            `SELECT 
                id, title, status, is_public,
                campaign_start_at, campaign_end_at,
                stopped_at, stopped_by, stop_reason,
                created_at, updated_at
             FROM surveys 
             WHERE id = ? AND created_by = ?`,
            [surveyId, userId]
        );
        
        if (!rows[0]) return null;
        
        const survey = rows[0];
        
        // Get response count
        const [countRows] = await db.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as response_count FROM survey_responses WHERE survey_id = ?',
            [surveyId]
        );
        
        return {
            ...survey,
            response_count: countRows[0].response_count,
            can_start: ['draft', 'scheduled', 'stopped'].includes(survey.status),
            can_stop: survey.status === 'active',
            can_schedule: ['draft', 'stopped'].includes(survey.status)
        };
    },

    // Auto-activate scheduled campaigns that have reached their start time
    autoActivateScheduled: async () => {
        const db = await getMySQLConnection();
        
        const [result] = await db.execute<ResultSetHeader>(
            `UPDATE surveys 
             SET status = 'active' 
             WHERE status = 'scheduled' 
             AND campaign_start_at IS NOT NULL 
             AND campaign_start_at <= NOW()`
        );
        
        return (result as ResultSetHeader).affectedRows;
    },

    // Auto-stop campaigns that have reached their end time
    autoStopExpired: async () => {
        const db = await getMySQLConnection();
        
        const [result] = await db.execute<ResultSetHeader>(
            `UPDATE surveys 
             SET status = 'stopped', 
                 stopped_at = NOW(),
                 stop_reason = 'Campaign end time reached'
             WHERE status = 'active' 
             AND campaign_end_at IS NOT NULL 
             AND campaign_end_at <= NOW()`
        );
        
        return (result as ResultSetHeader).affectedRows;
    },

    // Get survey by slug (any status) - for status checking
    getSurveyBySlugAny: async (slug: string) => {
        const db = await getMySQLConnection();
        
        const [rows] = await db.execute<RowDataPacket[]>(
            `SELECT 
                s.id, s.title, s.description, s.slug, s.status, s.is_public,
                s.campaign_start_at, s.campaign_end_at, s.stopped_at, s.stop_reason,
                s.created_at, s.updated_at, s.created_by
             FROM surveys s 
             WHERE s.slug = ?`,
            [slug]
        );
        
        if (!rows[0]) return null;
        
        return rows[0] as any;
    }
}; 