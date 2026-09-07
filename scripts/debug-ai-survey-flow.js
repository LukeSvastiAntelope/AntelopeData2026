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

async function debugAISurveyFlow() {
    const db = await getMySQLConnection();
    
    console.log('🔍 DEBUGGING AI SURVEY FLOW - TESTING ACTUAL PROBLEMATIC DATA');
    console.log('=' .repeat(70));
    
    try {
        // Test with the exact data from your screenshots that shows the "0" bug
        console.log('\n📝 STEP 1: Testing with problematic AI-generated data...');
        
        const problematicSurveyData = {
            title: 'Understanding Key Factors in Car Purchase Decisions',
            description: 'This survey aims to explore the various factors that influence consumers when buying a new car.',
            questions: [
                {
                    type: 'single-choice',
                    prompt: 'What is the most important factor for you when purchasing a new car',
                    options: ['Price', 'Brand', 'Fuel Efficiency', 'Safety Features', 'Technology'],
                    isRequired: true
                },
                {
                    type: 'multiple-choice',
                    prompt: 'Which features do you consider essential in a new car',
                    options: ['Advanced Safety Systems', 'Infotainment System', 'All-Wheel Drive', 'Leather Interior', 'Hybrid/Electric Options'],
                    isRequired: true
                },
                {
                    type: 'rating',
                    prompt: 'How important is brand reputation when choosing a car',
                    isRequired: true
                }
            ]
        };
        
        // Step 1: Simulate AI survey creation (POST /api/ai/generate-survey)
        console.log('\n🤖 STEP 2: Simulating AI survey creation...');
        
        const [surveyResult] = await db.execute(
            `INSERT INTO surveys (title, description, slug, created_by, status) 
             VALUES (?, ?, ?, ?, 'draft')`,
            [
                problematicSurveyData.title, 
                problematicSurveyData.description, 
                'debug-ai-survey-' + Date.now(), 
                1592
            ]
        );
        
        const surveyId = surveyResult.insertId;
        console.log(`✅ Created AI survey ID: ${surveyId}`);
        
        // Simulate the exact createSurvey flow from survey-repo.ts
        console.log('\n📋 STEP 3: Simulating createSurvey with AI data...');
        for (let i = 0; i < problematicSurveyData.questions.length; i++) {
            const question = problematicSurveyData.questions[i];
            
            console.log(`   Creating question ${i + 1}:`);
            console.log(`   - Type: ${question.type}`);
            console.log(`   - Prompt: "${question.prompt}"`);
            console.log(`   - Prompt length: ${question.prompt.length} chars`);
            console.log(`   - Order: ${i + 1}`);
            
            await db.execute(
                `INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    surveyId,
                    question.type || 'text',
                    question.prompt || '',
                    question.options ? JSON.stringify(question.options) : null,
                    question.isRequired ? 1 : 0,
                    i + 1  // Direct index + 1
                ]
            );
        }
        
        // Check what's stored after creation
        console.log('\n🔍 STEP 4: Checking database after AI survey creation...');
        const [createdQuestions] = await db.execute(
            'SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY question_order ASC',
            [surveyId]
        );
        
        createdQuestions.forEach((q, index) => {
            console.log(`   AI Question ${index + 1} in DB:`);
            console.log(`   - ID: ${q.id}`);
            console.log(`   - Type: ${q.type}`);
            console.log(`   - Prompt: "${q.prompt}"`);
            console.log(`   - Order: ${q.question_order}`);
            console.log(`   - Prompt length: ${q.prompt.length} chars`);
            
            // Check for the bug
            if (q.prompt.includes('0')) {
                console.log(`   ⚠️  WARNING: Found "0" in AI-created prompt!`);
            }
            if (q.prompt.endsWith('0')) {
                console.log(`   🔴 CRITICAL: AI-created prompt ends with "0"!`);
            }
        });
        
        // Step 5: Simulate the frontend edit/publish flow
        console.log('\n✏️  STEP 5: Simulating frontend edit and publish...');
        
        // This simulates what the frontend sends when publishing
        const frontendPublishData = {
            title: problematicSurveyData.title,
            description: problematicSurveyData.description,
            isPublic: true,
            questions: problematicSurveyData.questions.map((q, index) => ({
                type: q.type,
                prompt: q.prompt,
                options: q.options,
                isRequired: q.isRequired,
                order: index + 1  // Frontend maps with index + 1
            }))
        };
        
        console.log('   Frontend publish data:');
        frontendPublishData.questions.forEach((q, index) => {
            console.log(`   - Question ${index + 1}: "${q.prompt}" (order: ${q.order})`);
        });
        
        // Simulate publishSurvey method
        console.log('\n🚀 STEP 6: Simulating publishSurvey method...');
        
        // Delete existing questions (as publishSurvey does)
        await db.execute('DELETE FROM survey_questions WHERE survey_id = ?', [surveyId]);
        console.log('   ✅ Deleted existing questions');
        
        // Insert new questions (as publishSurvey does)
        for (let i = 0; i < frontendPublishData.questions.length; i++) {
            const question = frontendPublishData.questions[i];
            
            console.log(`   Publishing question ${i + 1}:`);
            console.log(`   - Type: ${question.type}`);
            console.log(`   - Prompt: "${question.prompt}"`);
            console.log(`   - Order logic: question.order || (i + 1) = ${question.order || (i + 1)}`);
            
            await db.execute(
                `INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    surveyId,
                    question.type || 'text',
                    question.prompt || '',
                    question.options ? JSON.stringify(question.options) : null,
                    question.isRequired ? 1 : 0,
                    question.order || (i + 1)  // This is the exact logic from publishSurvey
                ]
            );
        }
        
        // Update survey status
        await db.execute(
            'UPDATE surveys SET status = ? WHERE id = ?',
            ['published', surveyId]
        );
        
        console.log('   ✅ Published AI survey');
        
        // Check what's stored after publish
        console.log('\n🔍 STEP 7: Checking database after AI survey publish...');
        const [publishedQuestions] = await db.execute(
            'SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY question_order ASC',
            [surveyId]
        );
        
        publishedQuestions.forEach((q, index) => {
            console.log(`   Published AI Question ${index + 1} in DB:`);
            console.log(`   - ID: ${q.id}`);
            console.log(`   - Type: ${q.type}`);
            console.log(`   - Prompt: "${q.prompt}"`);
            console.log(`   - Order: ${q.question_order}`);
            console.log(`   - Prompt length: ${q.prompt.length} chars`);
            console.log(`   - Prompt ends with: "${q.prompt.slice(-3)}"`);
            
            // Check for the bug
            if (q.prompt.includes('0')) {
                console.log(`   ⚠️  WARNING: Found "0" in published AI prompt!`);
            }
            if (q.prompt.endsWith('0')) {
                console.log(`   🔴 CRITICAL: Published AI prompt ends with "0"!`);
            }
        });
        
        // Step 8: Test actual database content from your existing survey
        console.log('\n🔍 STEP 8: Checking your actual problematic survey...');
        
        // Find the survey that has the "0" issue
        const [existingSurveys] = await db.execute(
            `SELECT s.*, sq.id as question_id, sq.prompt, sq.question_order 
             FROM surveys s 
             JOIN survey_questions sq ON s.id = sq.survey_id 
             WHERE s.title LIKE '%Car Purchase%' OR s.title LIKE '%Key Factors%'
             ORDER BY s.id DESC, sq.question_order ASC
             LIMIT 10`
        );
        
        if (existingSurveys.length > 0) {
            console.log('   Found existing car purchase surveys:');
            existingSurveys.forEach((row, index) => {
                console.log(`   Survey: "${row.title}" (ID: ${row.id})`);
                console.log(`   - Question ${row.question_order}: "${row.prompt}"`);
                console.log(`   - Prompt length: ${row.prompt.length} chars`);
                console.log(`   - Last 5 chars: "${row.prompt.slice(-5)}"`);
                
                if (row.prompt.includes('0')) {
                    console.log(`   ⚠️  WARNING: Found "0" in existing prompt!`);
                }
                if (row.prompt.endsWith('0')) {
                    console.log(`   🔴 CRITICAL: Existing prompt ends with "0"!`);
                    console.log(`   - Full prompt bytes: [${Array.from(row.prompt).map(c => c.charCodeAt(0)).join(', ')}]`);
                }
            });
        } else {
            console.log('   No existing car purchase surveys found');
        }
        
        // Cleanup
        console.log('\n🧹 CLEANUP: Deleting test survey...');
        await db.execute('DELETE FROM survey_questions WHERE survey_id = ?', [surveyId]);
        await db.execute('DELETE FROM surveys WHERE id = ?', [surveyId]);
        console.log('   ✅ Cleanup complete');
        
        console.log('\n' + '='.repeat(70));
        console.log('🏁 AI SURVEY DEBUGGING COMPLETE');
        
    } catch (error) {
        console.error('❌ Error during AI survey debugging:', error);
    } finally {
        await db.end();
    }
}

// Run the debug
debugAISurveyFlow().catch(console.error); 