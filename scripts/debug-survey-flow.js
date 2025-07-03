const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env 2' });

// Database connection
async function getMySQLConnection() {
    return mysql.createConnection({
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        port: process.env.MYSQL_PORT || 25060,
        ssl: {
            rejectUnauthorized: false
        }
    });
}

async function debugSurveyFlow() {
    const db = await getMySQLConnection();
    
    console.log('🔍 DEBUGGING SURVEY FLOW - FINDING THE "0" BUG');
    console.log('=' .repeat(60));
    
    try {
        // Step 1: Create a test survey (simulating AI generation)
        console.log('\n📝 STEP 1: Creating test survey...');
        
        const testSurveyData = {
            title: 'Debug Test Survey',
            description: 'Testing where the 0 bug comes from',
            questions: [
                {
                    type: 'single-choice',
                    prompt: 'What is your favorite color',
                    options: ['Red', 'Blue', 'Green'],
                    isRequired: true,
                    order: 1
                },
                {
                    type: 'text',
                    prompt: 'Tell us about yourself',
                    isRequired: false,
                    order: 2
                }
            ]
        };
        
        // Insert survey
        const [surveyResult] = await db.execute(
            `INSERT INTO surveys (title, description, slug, created_by, status) 
             VALUES (?, ?, ?, ?, 'draft')`,
            [testSurveyData.title, testSurveyData.description, 'debug-test-survey-' + Date.now(), 1592]
        );
        
        const surveyId = surveyResult.insertId;
        console.log(`✅ Created survey ID: ${surveyId}`);
        
        // Insert questions (simulating createSurvey)
        console.log('\n📋 STEP 2: Inserting questions (createSurvey simulation)...');
        for (let i = 0; i < testSurveyData.questions.length; i++) {
            const question = testSurveyData.questions[i];
            
            console.log(`   Inserting question ${i + 1}:`);
            console.log(`   - Type: ${question.type}`);
            console.log(`   - Prompt: "${question.prompt}"`);
            console.log(`   - Order: ${question.order || (i + 1)}`);
            
            await db.execute(
                `INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    surveyId,
                    question.type,
                    question.prompt,
                    question.options ? JSON.stringify(question.options) : null,
                    question.isRequired ? 1 : 0,
                    question.order || (i + 1)
                ]
            );
        }
        
        // Step 3: Check what's in database after creation
        console.log('\n🔍 STEP 3: Checking database after creation...');
        const [createdQuestions] = await db.execute(
            'SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY question_order ASC',
            [surveyId]
        );
        
        createdQuestions.forEach((q, index) => {
            console.log(`   Question ${index + 1} in DB:`);
            console.log(`   - ID: ${q.id}`);
            console.log(`   - Type: ${q.type}`);
            console.log(`   - Prompt: "${q.prompt}"`);
            console.log(`   - Order: ${q.question_order}`);
            console.log(`   - Prompt length: ${q.prompt.length} chars`);
            console.log(`   - Prompt bytes: [${Array.from(q.prompt).map(c => c.charCodeAt(0)).join(', ')}]`);
        });
        
        // Step 4: Simulate publishSurvey
        console.log('\n🚀 STEP 4: Simulating publishSurvey...');
        
        const publishData = {
            title: testSurveyData.title,
            description: testSurveyData.description,
            isPublic: true,
            questions: testSurveyData.questions.map((q, index) => ({
                ...q,
                order: index + 1  // This is what frontend sends
            }))
        };
        
        console.log('   Publish data questions:');
        publishData.questions.forEach((q, index) => {
            console.log(`   - Question ${index + 1}: "${q.prompt}" (order: ${q.order})`);
        });
        
        // Delete existing questions (as publishSurvey does)
        await db.execute('DELETE FROM survey_questions WHERE survey_id = ?', [surveyId]);
        console.log('   ✅ Deleted existing questions');
        
        // Insert new questions (as publishSurvey does)
        for (let i = 0; i < publishData.questions.length; i++) {
            const question = publishData.questions[i];
            
            console.log(`   Inserting publish question ${i + 1}:`);
            console.log(`   - Type: ${question.type}`);
            console.log(`   - Prompt: "${question.prompt}"`);
            console.log(`   - Order: ${question.order || (i + 1)}`);
            
            await db.execute(
                `INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    surveyId,
                    question.type || 'text',
                    question.prompt || '',
                    question.options ? JSON.stringify(question.options) : null,
                    question.isRequired ? 1 : 0,
                    question.order || (i + 1)
                ]
            );
        }
        
        // Update survey status
        await db.execute(
            'UPDATE surveys SET status = ? WHERE id = ?',
            ['published', surveyId]
        );
        
        console.log('   ✅ Published survey');
        
        // Step 5: Check database after publish
        console.log('\n🔍 STEP 5: Checking database after publish...');
        const [publishedQuestions] = await db.execute(
            'SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY question_order ASC',
            [surveyId]
        );
        
        publishedQuestions.forEach((q, index) => {
            console.log(`   Published Question ${index + 1} in DB:`);
            console.log(`   - ID: ${q.id}`);
            console.log(`   - Type: ${q.type}`);
            console.log(`   - Prompt: "${q.prompt}"`);
            console.log(`   - Order: ${q.question_order}`);
            console.log(`   - Prompt length: ${q.prompt.length} chars`);
            console.log(`   - Prompt bytes: [${Array.from(q.prompt).map(c => c.charCodeAt(0)).join(', ')}]`);
            
            // Check for suspicious characters
            if (q.prompt.includes('0')) {
                console.log(`   ⚠️  WARNING: Found "0" in prompt!`);
            }
            if (q.prompt.endsWith('0')) {
                console.log(`   🔴 CRITICAL: Prompt ends with "0"!`);
            }
        });
        
        // Step 6: Simulate getSurveyBySlug (what public API calls)
        console.log('\n🌐 STEP 6: Simulating getSurveyBySlug...');
        
        const [surveyRows] = await db.execute(
            "SELECT * FROM surveys WHERE id = ? AND status IN ('active', 'published')",
            [surveyId]
        );
        
        if (surveyRows[0]) {
            const survey = surveyRows[0];
            console.log(`   Found survey: "${survey.title}"`);
            
            const [questionRows] = await db.execute(
                'SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY question_order ASC',
                [survey.id]
            );
            
            const surveyWithQuestions = {
                ...survey,
                questions: questionRows.map((q) => ({
                    ...q,
                    options: q.options // MySQL JSON field already returns parsed data
                }))
            };
            
            console.log('   Retrieved questions:');
            surveyWithQuestions.questions.forEach((q, index) => {
                console.log(`   - Question ${index + 1}: "${q.prompt}"`);
                console.log(`     Type: ${q.type}, Order: ${q.question_order}`);
                console.log(`     Prompt length: ${q.prompt.length} chars`);
                
                // Check for the bug
                if (q.prompt.includes('0')) {
                    console.log(`     ⚠️  WARNING: Found "0" in retrieved prompt!`);
                }
                if (q.prompt.endsWith('0')) {
                    console.log(`     🔴 CRITICAL: Retrieved prompt ends with "0"!`);
                }
            });
        }
        
        // Step 7: Check if there are any database triggers or procedures
        console.log('\n🔧 STEP 7: Checking for database triggers...');
        const [triggers] = await db.execute(
            `SELECT TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE 
             FROM information_schema.TRIGGERS 
             WHERE EVENT_OBJECT_SCHEMA = DATABASE() 
             AND EVENT_OBJECT_TABLE = 'survey_questions'`
        );
        
        if (triggers.length > 0) {
            console.log('   Found triggers on survey_questions:');
            triggers.forEach(trigger => {
                console.log(`   - ${trigger.TRIGGER_NAME} (${trigger.EVENT_MANIPULATION})`);
            });
        } else {
            console.log('   ✅ No triggers found on survey_questions table');
        }
        
        // Cleanup
        console.log('\n🧹 CLEANUP: Deleting test survey...');
        await db.execute('DELETE FROM survey_questions WHERE survey_id = ?', [surveyId]);
        await db.execute('DELETE FROM surveys WHERE id = ?', [surveyId]);
        console.log('   ✅ Cleanup complete');
        
        console.log('\n' + '='.repeat(60));
        console.log('🏁 DEBUGGING COMPLETE');
        
    } catch (error) {
        console.error('❌ Error during debugging:', error);
    } finally {
        await db.end();
    }
}

// Run the debug
debugSurveyFlow().catch(console.error); 