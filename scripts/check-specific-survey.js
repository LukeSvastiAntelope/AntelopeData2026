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

async function checkSpecificSurvey() {
    const db = await getMySQLConnection();
    
    console.log('🔍 CHECKING SPECIFIC SURVEY WITH "0" ISSUE');
    console.log('=' .repeat(50));
    
    try {
        // Get the most recent surveys by the user
        console.log('\n📋 Finding recent surveys...');
        const [surveys] = await db.execute(
            `SELECT id, title, slug, status, created_at 
             FROM surveys 
             WHERE created_by = 1592 
             ORDER BY created_at DESC 
             LIMIT 10`
        );
        
        console.log('Recent surveys:');
        surveys.forEach((survey, index) => {
            console.log(`${index + 1}. ID: ${survey.id}, Title: "${survey.title}", Status: ${survey.status}`);
            console.log(`   Slug: ${survey.slug}`);
        });
        
        // Focus on the specific survey from the screenshot
        console.log('\n🎯 Checking survey with slug containing "understanding-key-factors"...');
        const [targetSurveys] = await db.execute(
            `SELECT s.*, sq.id as question_id, sq.type, sq.prompt, sq.question_order, sq.options
             FROM surveys s 
             JOIN survey_questions sq ON s.id = sq.survey_id 
             WHERE s.slug LIKE '%understanding-key-factors%' 
             OR s.slug LIKE '%car-purchase-decision%'
             ORDER BY s.id DESC, sq.question_order ASC`
        );
        
        if (targetSurveys.length > 0) {
            console.log('Found target survey(s):');
            
            let currentSurveyId = null;
            targetSurveys.forEach((row) => {
                if (row.id !== currentSurveyId) {
                    currentSurveyId = row.id;
                    console.log(`\n📊 Survey: "${row.title}" (ID: ${row.id})`);
                    console.log(`   Slug: ${row.slug}`);
                    console.log(`   Status: ${row.status}`);
                }
                
                console.log(`   Question ${row.question_order} (ID: ${row.question_id}):`);
                console.log(`   - Type: ${row.type}`);
                console.log(`   - Prompt: "${row.prompt}"`);
                console.log(`   - Prompt length: ${row.prompt.length} chars`);
                console.log(`   - Last 10 chars: "${row.prompt.slice(-10)}"`);
                console.log(`   - Raw bytes of last 5 chars: [${Array.from(row.prompt.slice(-5)).map(c => c.charCodeAt(0)).join(', ')}]`);
                
                // Check for suspicious characters
                if (row.prompt.includes('0')) {
                    console.log(`   🔴 FOUND "0" in prompt at position: ${row.prompt.indexOf('0')}`);
                    console.log(`   🔍 Context around "0": "${row.prompt.substring(row.prompt.indexOf('0') - 5, row.prompt.indexOf('0') + 5)}"`);
                }
                
                if (row.prompt.endsWith('0')) {
                    console.log(`   🔴 CRITICAL: Prompt ends with "0"!`);
                }
                
                // Check for invisible characters
                const hasInvisibleChars = /[\u0000-\u001F\u007F-\u009F]/.test(row.prompt);
                if (hasInvisibleChars) {
                    console.log(`   ⚠️  WARNING: Contains invisible/control characters!`);
                }
            });
        } else {
            console.log('No target surveys found');
        }
        
        // Check all recent surveys for any "0" issues
        console.log('\n🔍 Scanning all recent questions for "0" issues...');
        const [allRecentQuestions] = await db.execute(
            `SELECT s.id as survey_id, s.title, sq.id as question_id, sq.prompt, sq.question_order
             FROM surveys s 
             JOIN survey_questions sq ON s.id = sq.survey_id 
             WHERE s.created_by = 1592 
             AND s.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
             ORDER BY s.created_at DESC, sq.question_order ASC`
        );
        
        let foundIssues = false;
        allRecentQuestions.forEach((row) => {
            if (row.prompt.includes('0') || row.prompt.endsWith('0')) {
                if (!foundIssues) {
                    console.log('Found questions with "0" issues:');
                    foundIssues = true;
                }
                console.log(`\n🔴 Survey "${row.title}" (ID: ${row.survey_id})`);
                console.log(`   Question ${row.question_order}: "${row.prompt}"`);
                console.log(`   Question ID: ${row.question_id}`);
                
                if (row.prompt.endsWith('0')) {
                    console.log(`   ❌ Ends with "0"`);
                }
                if (row.prompt.includes('0') && !row.prompt.endsWith('0')) {
                    console.log(`   ⚠️  Contains "0" at position: ${row.prompt.indexOf('0')}`);
                }
            }
        });
        
        if (!foundIssues) {
            console.log('✅ No "0" issues found in recent questions');
        }
        
        // Test the specific API call that the frontend makes
        console.log('\n🌐 Testing API call simulation...');
        
        // Find a published survey to test
        const [publishedSurvey] = await db.execute(
            `SELECT slug FROM surveys 
             WHERE created_by = 1592 AND status = 'published' 
             ORDER BY created_at DESC LIMIT 1`
        );
        
        if (publishedSurvey[0]) {
            const slug = publishedSurvey[0].slug;
            console.log(`Testing with slug: ${slug}`);
            
            // Simulate getSurveyBySlug call
            const [surveyData] = await db.execute(
                "SELECT * FROM surveys WHERE slug = ? AND status IN ('active', 'published')",
                [slug]
            );
            
            if (surveyData[0]) {
                const survey = surveyData[0];
                console.log(`Found survey: "${survey.title}"`);
                
                const [questionData] = await db.execute(
                    'SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY question_order ASC',
                    [survey.id]
                );
                
                console.log('API would return questions:');
                questionData.forEach((q, index) => {
                    console.log(`   ${index + 1}. "${q.prompt}" (${q.type})`);
                    
                    if (q.prompt.includes('0') || q.prompt.endsWith('0')) {
                        console.log(`      🔴 This question has "0" issue!`);
                    }
                });
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await db.end();
    }
}

checkSpecificSurvey().catch(console.error); 