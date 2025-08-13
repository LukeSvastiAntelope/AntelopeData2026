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
    ResponderAgent,
    AnonymityLevel,
    DemographicCategory
} from "../interface";
import { generateConfirmationToken } from "../api/token";
import { randomUUID } from 'crypto';
import { 
    calculateCompletionPercentage, 
    filterDemographicsForAnonymity,
    canChangeAnonymityLevel,
    categorizeImportedTwin
} from "../anonymity-config";

export const SurveyRepo = {
    /**
     * Update responder agent persona/capability profile and increment version
     */
    updateResponderAgentPersona: async (
        agentToken: string,
        personaProfile: Record<string, any>,
        capabilityMap: Record<string, any>
    ) => {
        const db = await getMySQLConnection();
        await db.execute(
            `UPDATE responder_agents
             SET persona_profile = ?,
                 capability_map = ?,
                 last_enriched_at = NOW(),
                 persona_version = IFNULL(persona_version, 0) + 1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE agent_token = ?`,
            [JSON.stringify(personaProfile), JSON.stringify(capabilityMap), agentToken]
        );
        return true;
    },
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
            
            // Insert survey meta with optional source tracking and anonymity level
            let surveyResult: ResultSetHeader;
            const anonymityLevel = data.anonymityLevel || 'full';
            const demographicsRequired = data.demographicsRequired !== false; // Default to true
            
            if (hasSourceTracking) {
                const source = data.source || 'native';
                const sourceMetadata = data.sourceMetadata ? JSON.stringify(data.sourceMetadata) : null;
                
                [surveyResult] = await connection.execute<ResultSetHeader>(
                    `INSERT INTO surveys (title, description, slug, created_by, is_public, anonymity_level, demographics_required, status, start_at, end_at, source, source_metadata) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [data.title, data.description, slug, createdBy, data.isPublic, anonymityLevel, demographicsRequired, status, startAt, endAt, source, sourceMetadata]
                );
            } else {
                [surveyResult] = await connection.execute<ResultSetHeader>(
                    `INSERT INTO surveys (title, description, slug, created_by, is_public, anonymity_level, demographics_required, status, start_at, end_at) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [data.title, data.description, slug, createdBy, data.isPublic, anonymityLevel, demographicsRequired, status, startAt, endAt]
                );
            }
            
            const surveyId = surveyResult.insertId;
            
            // Insert questions
            for (let i = 0; i < data.questions.length; i++) {
                const question = data.questions[i];
                
                await connection.execute(
                    `INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        surveyId,
                        question.type || 'text',
                        question.prompt || '',
                        question.options ? JSON.stringify(question.options) : null,
                        question.isRequired ? 1 : 0,
                        question.order || (i + 1)  // Use index + 1 if order is not provided
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

    // Fetch survey by slug regardless of status (for preview)
    getSurveyBySlugAny: async (slug: string) => {
        const db = await getMySQLConnection();
        
        const [rows] = await db.execute<RowDataPacket[]>(
            "SELECT * FROM surveys WHERE slug = ?",
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
            
            // Get survey anonymity level
            const [surveyRows] = await connection.execute<RowDataPacket[]>(
                'SELECT anonymity_level FROM surveys WHERE id = ?',
                [data.surveyId]
            );
            const anonymityLevel = surveyRows[0]?.anonymity_level || 'full';
            
            // Filter demographics based on anonymity level
            const filteredDemographics = filterDemographicsForAnonymity(data.demographics, anonymityLevel);
            
            // Insert survey response with optional source tracking and anonymity level
            let responseResult: ResultSetHeader;
            
            if (hasResponseSourceTracking) {
                const source = data.source || 'native';
                [responseResult] = await connection.execute<ResultSetHeader>(
                    `INSERT INTO survey_responses (survey_id, demographics, anonymity_level, ip_address, user_agent, source) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [data.surveyId, JSON.stringify(filteredDemographics), anonymityLevel, ipAddress, userAgent, source]
                );
            } else {
                [responseResult] = await connection.execute<ResultSetHeader>(
                    `INSERT INTO survey_responses (survey_id, demographics, anonymity_level, ip_address, user_agent) 
                     VALUES (?, ?, ?, ?, ?)`,
                    [data.surveyId, JSON.stringify(filteredDemographics), anonymityLevel, ipAddress, userAgent]
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
            const email = filteredDemographics?.email;
            let agentToken;
            let isExistingTwin = false;
            
            // Calculate completion percentage and demographic category
            const completionResult = calculateCompletionPercentage(filteredDemographics, anonymityLevel);
            
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
                            `INSERT INTO responder_agents (created_from_response_id, completion_percentage, demographic_category, agent_token, email, base_profile) 
                             VALUES (?, ?, ?, ?, ?, ?)`,
                            [responseId, completionResult.percentage, completionResult.category, agentToken, email, JSON.stringify({ demographics: filteredDemographics, status: 'initial', anonymityLevel })]
                        );
                    } else {
                        await connection.execute(
                            `INSERT INTO responder_agents (created_from_response_id, completion_percentage, demographic_category, agent_token, base_profile) 
                             VALUES (?, ?, ?, ?, ?)`,
                            [responseId, completionResult.percentage, completionResult.category, agentToken, JSON.stringify({ demographics: filteredDemographics, status: 'initial', anonymityLevel })]
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
                    `INSERT INTO responder_agents (created_from_response_id, completion_percentage, demographic_category, agent_token, base_profile) 
                     VALUES (?, ?, ?, ?, ?)`,
                    [responseId, completionResult.percentage, completionResult.category, agentToken, JSON.stringify({ demographics: filteredDemographics, status: 'initial', anonymityLevel })]
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

    // Get surveys for user dashboard - includes their own surveys plus featured examples
    getSurveysForUser: async (createdBy: number) => {
        const db = await getMySQLConnection();
        
        // Check if source columns exist
        const [sourceColumns] = await db.execute<RowDataPacket[]>(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'surveys' AND COLUMN_NAME = 'source'`
        );
        
        const hasSourceTracking = sourceColumns.length > 0;
        
        let userSurveys, featuredSurveys;
        
        if (hasSourceTracking) {
            // Get user's own surveys
            const [userRows] = await db.execute<RowDataPacket[]>(
                `SELECT s.*, COUNT(sr.id) as response_count, 'own' as survey_type
                 FROM surveys s 
                 LEFT JOIN survey_responses sr ON s.id = sr.survey_id 
                 WHERE s.created_by = ? 
                 GROUP BY s.id 
                 ORDER BY s.created_at DESC`,
                [createdBy]
            );
            userSurveys = userRows;
            
            // Get featured example surveys (Pew Research and other examples)
            const [featuredRows] = await db.execute<RowDataPacket[]>(
                `SELECT s.*, COUNT(sr.id) as response_count, 'featured' as survey_type
                 FROM surveys s 
                 LEFT JOIN survey_responses sr ON s.id = sr.survey_id 
                 WHERE s.created_by != ? 
                   AND s.status = 'published' 
                   AND s.is_public = 1
                   AND (s.title LIKE '%Pew Research%' 
                        OR s.title LIKE '%Example%' 
                        OR s.source = 'pew_research')
                 GROUP BY s.id 
                 ORDER BY s.created_at DESC
                 LIMIT 3`,
                [createdBy]
            );
            featuredSurveys = featuredRows;
        } else {
            // Fallback for databases without source tracking
            const [userRows] = await db.execute<RowDataPacket[]>(
                `SELECT s.*, COUNT(sr.id) as response_count, 'native' as source, NULL as source_metadata, 'own' as survey_type
                 FROM surveys s 
                 LEFT JOIN survey_responses sr ON s.id = sr.survey_id 
                 WHERE s.created_by = ? 
                 GROUP BY s.id 
                 ORDER BY s.created_at DESC`,
                [createdBy]
            );
            userSurveys = userRows;
            
            const [featuredRows] = await db.execute<RowDataPacket[]>(
                `SELECT s.*, COUNT(sr.id) as response_count, 'native' as source, NULL as source_metadata, 'featured' as survey_type
                 FROM surveys s 
                 LEFT JOIN survey_responses sr ON s.id = sr.survey_id 
                 WHERE s.created_by != ? 
                   AND s.status = 'published' 
                   AND s.is_public = 1
                   AND (s.title LIKE '%Pew Research%' 
                        OR s.title LIKE '%Example%')
                 GROUP BY s.id 
                 ORDER BY s.created_at DESC
                 LIMIT 3`,
                [createdBy]
            );
            featuredSurveys = featuredRows;
        }
        
        return {
            userSurveys,
            featuredSurveys,
            allSurveys: [...userSurveys, ...featuredSurveys]
        };
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

    // Update survey anonymity level with audit trail
    updateSurveyAnonymityLevel: async (surveyId: number, newAnonymityLevel: AnonymityLevel, changedBy: number, reason?: string) => {
        const db = await getMySQLConnection();
        const connection = await db.getConnection();
        
        try {
            await connection.beginTransaction();
            
            // Get current survey details
            const [currentRows] = await connection.execute<RowDataPacket[]>(
                'SELECT anonymity_level, created_by FROM surveys WHERE id = ?',
                [surveyId]
            );
            
            if (!currentRows[0]) {
                throw new Error('Survey not found');
            }
            
            const currentLevel = currentRows[0].anonymity_level;
            const createdBy = currentRows[0].created_by;
            
            // Check permissions (only creator or admin can change)
            if (createdBy !== changedBy) {
                // TODO: Add admin role check here if needed
                throw new Error('Permission denied: Only survey creator can change anonymity level');
            }
            
            // Check if survey has responses
            const [responseCountRows] = await connection.execute<RowDataPacket[]>(
                'SELECT COUNT(*) as count FROM survey_responses WHERE survey_id = ?',
                [surveyId]
            );
            const hasResponses = responseCountRows[0].count > 0;
            
            // Validate the change
            const changeValidation = canChangeAnonymityLevel(currentLevel, newAnonymityLevel, hasResponses);
            if (!changeValidation.allowed) {
                throw new Error(changeValidation.reason);
            }
            
            // Update the survey
            await connection.execute(
                'UPDATE surveys SET anonymity_level = ? WHERE id = ?',
                [newAnonymityLevel, surveyId]
            );
            
            // Create audit record
            await connection.execute(
                `INSERT INTO survey_anonymity_audit (survey_id, old_anonymity_level, new_anonymity_level, changed_by, change_reason) 
                 VALUES (?, ?, ?, ?, ?)`,
                [surveyId, currentLevel, newAnonymityLevel, changedBy, reason || 'Anonymity level updated']
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

    // Get digital twin analytics
    getDigitalTwinAnalytics: async () => {
        const db = await getMySQLConnection();
        
        const [rows] = await db.execute<RowDataPacket[]>(
            'SELECT * FROM digital_twin_analytics ORDER BY twin_count DESC'
        );
        
        return rows;
    },

    // Get digital twins with filtering and sorting
    getDigitalTwinsWithFilters: async (filters: {
        demographicCategory?: DemographicCategory;
        minCompletion?: number;
        maxCompletion?: number;
        sortBy?: 'completion_percentage' | 'created_at' | 'demographic_category';
        sortOrder?: 'ASC' | 'DESC';
        limit?: number;
        offset?: number;
    } = {}) => {
        const db = await getMySQLConnection();
        
            const whereConditions: string[] = [];
    const queryParams: any[] = [];
        
        if (filters.demographicCategory) {
            whereConditions.push('ra.demographic_category = ?');
            queryParams.push(filters.demographicCategory);
        }
        
        if (filters.minCompletion !== undefined) {
            whereConditions.push('ra.completion_percentage >= ?');
            queryParams.push(filters.minCompletion);
        }
        
        if (filters.maxCompletion !== undefined) {
            whereConditions.push('ra.completion_percentage <= ?');
            queryParams.push(filters.maxCompletion);
        }
        
        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        const sortBy = filters.sortBy || 'completion_percentage';
        const sortOrder = filters.sortOrder || 'DESC';
        const limit = filters.limit || 50;
        const offset = filters.offset || 0;
        
        const [rows] = await db.execute<RowDataPacket[]>(
            `SELECT 
                ra.*,
                sr.demographics,
                sr.anonymity_level,
                s.title as survey_title
             FROM responder_agents ra
             LEFT JOIN survey_responses sr ON ra.created_from_response_id = sr.id
             LEFT JOIN surveys s ON sr.survey_id = s.id
             ${whereClause}
             ORDER BY ra.${sortBy} ${sortOrder}
             LIMIT ? OFFSET ?`,
            [...queryParams, limit, offset]
        );
        
        return rows.map((row: any) => ({
            ...row,
            baseProfile: row.base_profile,
            demographics: row.demographics
        }));
    },

    getSurveyById: async (surveyId: number, createdBy: number) => {
        const db = await getMySQLConnection();
        
        const [rows] = await db.execute<RowDataPacket[]>(
            `SELECT * FROM surveys 
             WHERE id = ? 
             AND (
               created_by = ? 
               OR (is_public = 1 AND status = 'published')
             )`,
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
            for (let i = 0; i < data.questions.length; i++) {
                const question = data.questions[i];
                
                await connection.execute(
                    `INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        surveyId,
                        question.type || 'text',
                        question.prompt || '',
                        question.options ? JSON.stringify(question.options) : null,
                        question.isRequired ? 1 : 0,
                        question.order || (i + 1)  // Use index + 1 if order is not provided
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

            // Handle anonymity level updates with validation
            const anonymityLevel = data.anonymityLevel || 'full';
            const demographicsRequired = data.demographicsRequired !== false;
            
            // Check if we can change anonymity level (if survey has responses)
            const [responseCountRows] = await connection.execute<RowDataPacket[]>(
                'SELECT COUNT(*) as count FROM survey_responses WHERE survey_id = ?',
                [surveyId]
            );
            const hasResponses = responseCountRows[0].count > 0;
            
            if (hasResponses) {
                // Get current anonymity level
                const [currentSurveyRows] = await connection.execute<RowDataPacket[]>(
                    'SELECT anonymity_level FROM surveys WHERE id = ?',
                    [surveyId]
                );
                const currentLevel = currentSurveyRows[0]?.anonymity_level || 'full';
                
                // Validate anonymity level change
                const changeValidation = canChangeAnonymityLevel(currentLevel, anonymityLevel, hasResponses);
                if (!changeValidation.allowed) {
                    throw new Error(changeValidation.reason);
                }
            }

            await connection.execute(
                `UPDATE surveys 
                 SET title = ?, description = ?, slug = ?, is_public = ?, anonymity_level = ?, demographics_required = ?, status = ?, start_at = ?, end_at = ? 
                 WHERE id = ?`,
                [data.title, data.description, slug, data.isPublic, anonymityLevel, demographicsRequired, newStatus, startAt, endAt, surveyId]
            );
            
            // Delete existing questions
            await connection.execute(
                'DELETE FROM survey_questions WHERE survey_id = ?',
                [surveyId]
            );
            
            // Create new questions
            for (let i = 0; i < data.questions.length; i++) {
                const question = data.questions[i];
                await connection.execute(
                    `INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        surveyId,
                        question.type || 'text',
                        question.prompt || '',
                        question.options ? JSON.stringify(question.options) : null,
                        question.isRequired ? 1 : 0,
                        question.order || (i + 1)  // Use index + 1 if order is not provided
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
            
            // For each response, get their answers with improved value label decoding
            const responses = [];
            for (const response of responseRows) {
                const [answerRows] = await db.execute<RowDataPacket[]>(
                    `SELECT 
                        sa.question_id,
                        sa.answer_value,
                        sq.prompt as question_text,
                        sq.options
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
                    answers: answerRows.map((answer: any) => {
                        let decodedValue = answer.answer_value;
                        
                        // Handle empty or null values
                        if (!answer.answer_value || answer.answer_value === '') {
                            decodedValue = '(No answer)';
                        }
                        // Decode numeric answers using value labels if available
                        else if (answer.options) {
                            try {
                                const options = Array.isArray(answer.options) ? answer.options : JSON.parse(answer.options);
                                const answerValue = String(answer.answer_value).trim();
                                
                                // Handle common survey research missing value codes
                                if (answerValue === '99') {
                                    decodedValue = "Don't know/Refused";
                                } else if (answerValue === '98') {
                                    decodedValue = "Not applicable";
                                } else if (['7', '8', '9'].includes(answerValue)) {
                                    decodedValue = "Not applicable";
                                } else {
                                    // Try to decode as option index (1-based)
                                    const answerNum = parseInt(answerValue);
                                    if (!isNaN(answerNum) && answerNum >= 1 && answerNum <= options.length) {
                                        // Convert 1-based index to 0-based and get the label
                                        decodedValue = options[answerNum - 1];
                                    } else {
                                        // If it's not a valid index, keep the original value but mark it
                                        if (!isNaN(answerNum)) {
                                            decodedValue = `${answerValue} (out of range)`;
                                        } else {
                                            // Non-numeric answer, keep as-is
                                            decodedValue = answerValue;
                                        }
                                    }
                                }
                            } catch (error) {
                                // If parsing fails, keep the original value
                                console.warn(`Failed to parse options for question ${answer.question_id}:`, error);
                                decodedValue = answer.answer_value;
                            }
                        }
                        
                        return {
                            questionId: answer.question_id,
                            questionText: answer.question_text,
                            value: decodedValue
                        };
                    })
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
                LEFT JOIN survey_questions sq ON sa.question_id = sq.id
                WHERE sa.response_id = ?
                ORDER BY IFNULL(sq.question_order, sa.question_id) ASC`,
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

    /**
     * Fetch a paginated list of survey responses with demographics only.
     * Used for lightweight table views to avoid loading all answers.
     *
     * @param surveyId   ID of the survey we want responses for
     * @param createdBy  User ID – ensures caller owns the survey
     * @param limit      How many items per page (default 20)
     * @param offset     Offset calculated as pageIndex * limit (default 0)
     * @returns          { total: number, responses: Array<ResponseRow> }
     */
    getSurveyResponsesPage: async (
        surveyId: number,
        createdBy: number,
        limit: number = 20,
        offset: number = 0
    ) => {
        const db = await getMySQLConnection();

        // Verify ownership first
        const [surveyRows] = await db.execute<RowDataPacket[]>(
            `SELECT id FROM surveys 
             WHERE id = ? 
               AND (
                 created_by = ? 
                 OR (is_public = 1 AND status = 'published')
               )`,
            [surveyId, createdBy]
        );
        if (!surveyRows[0]) return null;

        // Get total count for pagination metadata
        const [[countRow]] = await db.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as total FROM survey_responses WHERE survey_id = ?',
            [surveyId]
        );
        const total = countRow.total as number;

        // Get paged rows – only demographics & basic meta (no answers)
        // Note: MySQL prepared statements have issues with LIMIT ? OFFSET ? placeholders in some versions.
        // We embed the already-validated numeric values directly to avoid the ER_WRONG_ARGUMENTS error.
        const limitClause = Number.isFinite(limit) ? Math.max(1, limit) : 20;
        const offsetClause = Number.isFinite(offset) ? Math.max(0, offset) : 0;

        const [responseRows] = await db.execute<RowDataPacket[]>(
            `SELECT id, demographics, submitted_at, agent_token
             FROM survey_responses
             WHERE survey_id = ?
             ORDER BY submitted_at DESC
             LIMIT ${limitClause} OFFSET ${offsetClause}`,
            [surveyId]
        );

        return {
            total,
            responses: responseRows.map((r: any) => ({
                id: r.id,
                submitted_at: r.submitted_at,
                demographics: r.demographics, // JSON parsed by mysql2
                agentToken: r.agent_token,
            })),
        };
    },

    /**
     * Compute lightweight aggregated stats for a survey – used for charts on the results overview.
     */
    getSurveySummary: async (surveyId: number, createdBy: number) => {
        const db = await getMySQLConnection();

        // Verify ownership
        const [surveyRows] = await db.execute<RowDataPacket[]>(
            `SELECT id, title, description, created_at, status, is_public 
             FROM surveys 
             WHERE id = ? 
               AND (
                 created_by = ? 
                 OR (is_public = 1 AND status = 'published')
               )`,
            [surveyId, createdBy]
        );
        if (!surveyRows[0]) return null;
        const survey = surveyRows[0];

        // Pull demographics & submitted_at only (much smaller than full answers)
        const [rows] = await db.execute<RowDataPacket[]>(
            'SELECT demographics, submitted_at FROM survey_responses WHERE survey_id = ?',
            [surveyId]
        );

        // Aggregations
        const ageBuckets: Record<string, number> = { '18-24':0, '25-34':0, '35-44':0, '45-54':0, '55+':0 };
        const locationCounts: Record<string, number> = {};
        const educationCounts: Record<string, number> = {};
        const timeline: Record<string, number> = {};

        rows.forEach((r:any) => {
            let demographics:any = {};
            try { demographics = typeof r.demographics === 'string' ? JSON.parse(r.demographics) : r.demographics; }
            catch {}

            // Age
            const age = parseInt(demographics?.age || '0', 10);
            if (!isNaN(age)) {
                if (age < 25) ageBuckets['18-24']++; else
                if (age < 35) ageBuckets['25-34']++; else
                if (age < 45) ageBuckets['35-44']++; else
                if (age < 55) ageBuckets['45-54']++; else ageBuckets['55+']++;
            }

            // Location
            const loc = demographics?.location || 'Not specified';
            locationCounts[loc] = (locationCounts[loc]||0)+1;

            // Education
            const edu = demographics?.education || 'Not specified';
            educationCounts[edu] = (educationCounts[edu]||0)+1;

            // Timeline by day (MMM dd)
            const dateKey = new Date(r.submitted_at).toLocaleDateString('en-US',{month:'short',day:'numeric'});
            timeline[dateKey] = (timeline[dateKey]||0)+1;
        });

        // Transform to arrays expected by front-end
        const ageData = Object.entries(ageBuckets).map(([range,count])=>({range,count}));
        const locationData = Object.entries(locationCounts)
            .sort(([,a],[,b])=>b-a)
            .slice(0,5)
            .map(([location,count])=>({location,count}));
        const educationData = Object.entries(educationCounts).map(([education,count])=>({education,count}));
        const timelineData = Object.entries(timeline)
            .sort((a,b)=> new Date(a[0]+', 2024').getTime() - new Date(b[0]+', 2024').getTime())
            .map(([date,count])=>({date,count}));

        return {
            survey:{...survey, response_count: rows.length},
            ageData,
            locationData,
            educationData,
            timeline: timelineData
        };
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
        
        try {
            // Verify survey exists and belongs to user
            const [surveyRows] = await db.execute<RowDataPacket[]>(
                "SELECT id, title FROM surveys WHERE id = ? AND created_by = ?",
                [surveyId, createdBy]
            );
            
            if (!surveyRows[0]) {
                return false;
            }

            console.log(`Starting deletion of survey ${surveyId}: ${surveyRows[0].title}`);

            // Get counts to estimate progress
            const [responseCounts] = await db.execute<RowDataPacket[]>(
                'SELECT COUNT(*) as count FROM survey_responses WHERE survey_id = ?',
                [surveyId]
            );
            const responseCount = responseCounts[0].count;
            console.log(`Survey has ${responseCount} responses to delete`);

            // If it's a large survey (>1000 responses), use batched deletion
            if (responseCount > 1000) {
                return await SurveyRepo.deleteLargeSurvey(surveyId, createdBy, responseCount);
            }

            // For smaller surveys, use the original approach but with better timeout handling
            const connection = await db.getConnection();
            
            try {
                // Set a longer timeout for this connection
                await connection.execute('SET SESSION innodb_lock_wait_timeout = 300'); // 5 minutes
                await connection.beginTransaction();
                
                // Collect digital twin tokens before deleting responses
                const [agentTokenRows] = await connection.execute<RowDataPacket[]>(
                    `SELECT ra.agent_token 
                     FROM responder_agents ra
                     INNER JOIN survey_responses sr ON ra.created_from_response_id = sr.id
                     WHERE sr.survey_id = ?`,
                    [surveyId]
                );
                const agentTokens = agentTokenRows.map((row: any) => row.agent_token).filter(Boolean);
                console.log(`Found ${agentTokens.length} digital twins to clean up from Pinecone`);

                // First remove derived statistical tables that reference survey and questions
                await connection.execute(
                    'DELETE FROM survey_question_stats WHERE survey_id = ?',
                    [surveyId]
                );

                await connection.execute(
                    'DELETE FROM survey_analytics_cache WHERE survey_id = ?',
                    [surveyId]
                );

                // Delete in order of dependencies:
                // 1. Delete survey answers
                console.log('Deleting survey answers...');
            await connection.execute(
                `DELETE sa FROM survey_answers sa 
                 INNER JOIN survey_responses sr ON sa.response_id = sr.id 
                 WHERE sr.survey_id = ?`,
                [surveyId]
            );
            
            // 2. Delete survey responses
                console.log('Deleting survey responses...');
            await connection.execute(
                'DELETE FROM survey_responses WHERE survey_id = ?',
                [surveyId]
            );
            
                // 3. Clean up digital twins from Pinecone
                if (agentTokens.length > 0) {
                    console.log('Cleaning up digital twins from Pinecone...');
                    try {
                        await SurveyRepo.cleanupPineconeDigitalTwins(agentTokens);
                        console.log(`Successfully cleaned up ${agentTokens.length} digital twins from Pinecone`);
                    } catch (pineconeError) {
                        console.error('Error cleaning up Pinecone digital twins:', pineconeError);
                        // Don't fail the entire deletion if Pinecone cleanup fails
                        console.warn('Continuing with survey deletion despite Pinecone cleanup failure');
                    }
                }
                
                // 4. Delete survey questions
                console.log('Deleting survey questions...');
            await connection.execute(
                'DELETE FROM survey_questions WHERE survey_id = ?',
                [surveyId]
            );
            
                // 5. Finally delete the survey itself
                console.log('Deleting survey...');
            await connection.execute(
                'DELETE FROM surveys WHERE id = ?',
                [surveyId]
            );
            
            await connection.commit();
                console.log(`Successfully deleted survey ${surveyId}`);
            return true;
            
        } catch (error) {
            await connection.rollback();
                throw error;
            } finally {
            connection.release();
            }
            
        } catch (error) {
            console.error('Error deleting survey:', error);
            throw error;
        }
    },

    // Batched deletion for large surveys
    deleteLargeSurvey: async (surveyId: number, createdBy: number, responseCount: number) => {
        const db = await getMySQLConnection();
        const batchSize = 100; // Process 100 responses at a time
        
        try {
            console.log(`Starting batched deletion for large survey ${surveyId} with ${responseCount} responses`);

            // Remove derived stats and analytics cache first to avoid FK constraints
            await db.execute('DELETE FROM survey_question_stats WHERE survey_id = ?', [surveyId]);
            await db.execute('DELETE FROM survey_analytics_cache WHERE survey_id = ?', [surveyId]);
            
            // Step 0: Get all agent tokens for Pinecone cleanup before deleting responses
            console.log('Collecting digital twin tokens for Pinecone cleanup...');
            const [agentTokenRows] = await db.execute<RowDataPacket[]>(
                `SELECT ra.agent_token 
                 FROM responder_agents ra
                 INNER JOIN survey_responses sr ON ra.created_from_response_id = sr.id
                 WHERE sr.survey_id = ?`,
                [surveyId]
            );
            
            const agentTokens = agentTokenRows.map((row: any) => row.agent_token).filter(Boolean);
            console.log(`Found ${agentTokens.length} digital twins to clean up from Pinecone`);
            
            // Step 1: Delete survey answers in batches
            // First, get all response IDs for this survey
            console.log('Getting response IDs for batched deletion...');
            const [responseIdRows] = await db.execute<RowDataPacket[]>(
                'SELECT id FROM survey_responses WHERE survey_id = ? ORDER BY id',
                [surveyId]
            );
            const responseIds = responseIdRows.map((row: any) => row.id);
            console.log(`Found ${responseIds.length} response IDs to process`);
            
            // Delete answers in batches by response ID
            console.log('Deleting survey answers in batches...');
            let deletedAnswers = 0;
            for (let i = 0; i < responseIds.length; i += batchSize) {
                const batchIds = responseIds.slice(i, i + batchSize);
                const placeholders = batchIds.map(() => '?').join(',');
                
                const connection = await db.getConnection();
                try {
                    await connection.execute('SET SESSION innodb_lock_wait_timeout = 120');
                    
                    const [result] = await connection.execute<ResultSetHeader>(
                        `DELETE FROM survey_answers WHERE response_id IN (${placeholders})`,
                        batchIds
                    );
                    
                    const deletedInBatch = (result as ResultSetHeader).affectedRows;
                    deletedAnswers += deletedInBatch;
                    
                    if (deletedInBatch > 0) {
                        console.log(`Deleted ${deletedAnswers} survey answers so far... (batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(responseIds.length/batchSize)})`);
                    }
                } finally {
                    connection.release();
                }
                
                // Small delay to prevent overwhelming the database
                if (i + batchSize < responseIds.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            // Step 2: Delete survey responses in batches
            console.log('Deleting survey responses in batches...');
            let deletedResponses = 0;
            for (let i = 0; i < responseIds.length; i += batchSize) {
                const batchIds = responseIds.slice(i, i + batchSize);
                const placeholders = batchIds.map(() => '?').join(',');
                
                const connection = await db.getConnection();
                try {
                    await connection.execute('SET SESSION innodb_lock_wait_timeout = 120');
                    
                    const [result] = await connection.execute<ResultSetHeader>(
                        `DELETE FROM survey_responses WHERE id IN (${placeholders})`,
                        batchIds
                    );
                    
                    const deletedInBatch = (result as ResultSetHeader).affectedRows;
                    deletedResponses += deletedInBatch;
                    
                    if (deletedInBatch > 0) {
                        console.log(`Deleted ${deletedResponses}/${responseCount} survey responses... (batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(responseIds.length/batchSize)})`);
                    }
                } finally {
                    connection.release();
                }
                
                // Small delay to prevent overwhelming the database
                if (i + batchSize < responseIds.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            // Step 3: Clean up digital twins from Pinecone
            if (agentTokens.length > 0) {
                console.log('Cleaning up digital twins from Pinecone...');
                try {
                    await SurveyRepo.cleanupPineconeDigitalTwins(agentTokens);
                    console.log(`Successfully cleaned up ${agentTokens.length} digital twins from Pinecone`);
                } catch (pineconeError) {
                    console.error('Error cleaning up Pinecone digital twins:', pineconeError);
                    // Don't fail the entire deletion if Pinecone cleanup fails
                    console.warn('Continuing with survey deletion despite Pinecone cleanup failure');
                }
            }
            
            // Step 4: Delete survey questions (should be small)
            console.log('Deleting survey questions...');
            await db.execute(
                'DELETE FROM survey_questions WHERE survey_id = ?',
                [surveyId]
            );
            
            // Step 5: Finally delete the survey itself
            console.log('Deleting survey...');
            const [result] = await db.execute<ResultSetHeader>(
                'DELETE FROM surveys WHERE id = ? AND created_by = ?',
                [surveyId, createdBy]
            );
            
            if ((result as ResultSetHeader).affectedRows === 0) {
                throw new Error('Survey not found or access denied');
            }
            
            console.log(`Successfully deleted large survey ${surveyId} with ${deletedResponses} responses, ${deletedAnswers} answers, and ${agentTokens.length} digital twins`);
            return true;
            
        } catch (error) {
            console.error('Error in batched deletion:', error);
            throw error;
        }
    },

    // Clean up digital twins from Pinecone
    cleanupPineconeDigitalTwins: async (agentTokens: string[]) => {
        try {
            // Import Pinecone dynamically to avoid issues if not available
            const { Pinecone } = await import('@pinecone-database/pinecone');
            
            const pinecone = new Pinecone({
                apiKey: process.env.PINECONE_API_KEY!,
            });
            
            const index = pinecone.index('prediction-results');
            
            // Delete in batches to avoid overwhelming Pinecone
            const batchSize = 50;
            for (let i = 0; i < agentTokens.length; i += batchSize) {
                const batch = agentTokens.slice(i, i + batchSize);
                const idsToDelete = batch.map(token => `digital-twin-${token}`);
                
                try {
                    await index.deleteMany(idsToDelete);
                    console.log(`Deleted batch of ${idsToDelete.length} digital twins from Pinecone (${i + idsToDelete.length}/${agentTokens.length})`);
                } catch (batchError) {
                    console.error(`Error deleting batch ${i}-${i + batch.length}:`, batchError);
                    // Continue with next batch even if this one fails
                }
                
                // Small delay between batches
                if (i + batchSize < agentTokens.length) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
            
        } catch (error) {
            console.error('Error setting up Pinecone cleanup:', error);
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
                        response_count, 
                        start_at, end_at, source, source_metadata, parent_survey_id, cloned_at
                    ) VALUES (?, ?, ?, ?, ?, 'draft', 0, ?, ?, 'clone', ?, ?, NOW())`,
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
                        response_count,
                        start_at, end_at, source, source_metadata
                    ) VALUES (?, ?, ?, ?, ?, 'draft', 0, ?, ?, 'clone', ?)`,
                    [
                        newTitle,
                        originalSurvey.description,
                        newSlug,
                        createdBy,
                        originalSurvey.is_public,
                        null, // start_at
                        null, // end_at
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

}; 