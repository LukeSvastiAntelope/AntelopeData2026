require('dotenv').config();
const mysql = require('mysql2/promise');

async function traceCohortFlow() {
  console.log('=== TRACING COHORT-CHAT FLOW: "Create some interesting statistics" ===\n');

  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  try {
    const question = "Create some interesting statistics";
    const surveyId = 81;

    // STEP 1: Check if system uses cached fact sheet
    console.log('STEP 1: Checking for cached fact sheet (like the real API does)...');
    
    // Try different possible cache table names
    const possibleTables = ['survey_analytics_cache', 'survey_ai_analytics', 'analytics_cache'];
    let factSheet = null;
    
    for (const tableName of possibleTables) {
      try {
        const [tables] = await db.execute(`SHOW TABLES LIKE '${tableName}'`);
        if (tables.length > 0) {
          console.log(`  ✅ Found table: ${tableName}`);
          
          const [cacheResults] = await db.execute(`
            SELECT analytics_data FROM ${tableName} 
            WHERE survey_id = ? 
            ORDER BY created_at DESC 
            LIMIT 1
          `, [surveyId]);
          
          if (cacheResults.length > 0) {
            factSheet = JSON.parse(cacheResults[0].analytics_data);
            console.log(`  ✅ Found cached fact sheet with ${Object.keys(factSheet.fact_sheet?.question_stats || {}).length} questions`);
            break;
          }
        }
      } catch (e) {
        console.log(`  ❌ Table ${tableName} not found or no access`);
      }
    }

    if (!factSheet) {
      console.log('  ❌ No cached fact sheet found - would generate fresh');
      
      // STEP 2: Generate fact sheet (simulate what the API would do)
      console.log('\nSTEP 2: Generating fresh fact sheet...');
      const { analyzeSurveySchema } = require('./scripts/analyze-survey-schema.js');
      factSheet = await analyzeSurveySchema(surveyId, db);
      console.log(`  ✅ Generated fact sheet with ${Object.keys(factSheet.fact_sheet?.question_stats || {}).length} questions`);
    }

    // STEP 3: Test the generateDataCards function (exact copy from cohort/query/route.ts)
    console.log('\nSTEP 3: Testing generateDataCards function...');
    
    function generateDataCards(factSheet, question) {
      console.log('    🔄 generateDataCards called with question:', question);
      
      if (!factSheet || !factSheet.fact_sheet?.question_stats) {
        console.log('    ❌ No fact sheet or question stats available');
        return [];
      }
      
      const cards = [];
      const questionLower = question.toLowerCase();
      console.log(`    📝 Looking for keywords in: "${questionLower}"`);
      
      // Platform adoption card logic
      const platformStats = Object.values(factSheet.fact_sheet.question_stats).find((stats) => 
        stats.adoption_rates && Object.keys(stats.adoption_rates).length > 0
      );
      
      console.log(`    🔍 Found platform stats: ${!!platformStats}`);
      
      // Look for distributions for "interesting statistics"
      if (questionLower.includes('interesting') || questionLower.includes('statistics')) {
        console.log('    ✅ Question matches "interesting" or "statistics" keywords');
        
        const questionStats = factSheet.fact_sheet.question_stats;
        const keys = Object.keys(questionStats).slice(0, 5); // First 5 questions
        console.log(`    📊 Processing first 5 question keys: ${keys.join(', ')}`);
        
        keys.forEach((key, index) => {
          console.log(`\n    === Processing question key: "${key}" ===`);
          
          const stats = questionStats[key];
          console.log(`    📋 Stats available:`, Object.keys(stats));
          
          if (stats.distribution && Object.keys(stats.distribution).length > 1) {
            console.log(`    ✅ Found distribution with ${Object.keys(stats.distribution).length} values`);
            
            // Show the raw distribution data
            console.log('    📊 Raw distribution data:');
            Object.entries(stats.distribution).slice(0, 3).forEach(([value, data]) => {
              console.log(`      "${value}": ${data.percentage}% (${data.count} responses)`);
            });
            
            const data = Object.entries(stats.distribution)
              .sort(([,a], [,b]) => b.percentage - a.percentage)
              .slice(0, 8)
              .map(([value, data]) => ({
                label: value,  // ⚠️ THIS IS WHERE LABELS COME FROM
                value: data.percentage,
                count: data.count
              }));
            
            console.log('    🏷️  Final chart data labels:');
            data.slice(0, 3).forEach(item => {
              console.log(`      "${item.label}": ${item.value}% (${item.count} responses)`);
            });
            
            cards.push({
              type: 'distribution',
              title: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
              data: data,
              chart_type: 'horizontal_bar',
              debug_key: key
            });
            
            console.log(`    ✅ Added card: "${key}"`);
          } else {
            console.log(`    ❌ No distribution or insufficient data for "${key}"`);
          }
        });
      }
      
      console.log(`    🎯 Generated ${cards.length} total cards`);
      return cards;
    }

    const dataCards = generateDataCards(factSheet, question);

    // STEP 4: Show what gets sent to the frontend
    console.log('\nSTEP 4: Final chart data that gets sent to frontend...');
    
    dataCards.forEach((card, index) => {
      console.log(`\n📊 Chart ${index + 1}: "${card.title}"`);
      console.log(`   Type: ${card.chart_type}`);
      console.log(`   Debug key: ${card.debug_key}`);
      console.log('   Data labels:');
      
      card.data.slice(0, 5).forEach(item => {
        console.log(`     "${item.label}": ${item.value}% (${item.count} responses)`);
      });
      
      // ANALYSIS: Check what type of labels we have
      const labels = card.data.map(item => item.label);
      const hasNumericLabels = labels.some(label => /^\d+$/.test(label));
      const hasDateLabels = labels.some(label => /^\d{4}-\d{2}-\d{2}/.test(label));
      const hasRangeLabels = labels.some(label => /^\d+-\d+/.test(label));
      const hasTextLabels = labels.some(label => label && label.length > 5 && !/^\d+$/.test(label));
      
      console.log('   🔍 Label Analysis:');
      console.log(`     - Numeric labels (1,2,3): ${hasNumericLabels}`);
      console.log(`     - Date labels: ${hasDateLabels}`);
      console.log(`     - Range labels (123-456): ${hasRangeLabels}`);
      console.log(`     - Text labels: ${hasTextLabels}`);
      
      if (hasNumericLabels) {
        console.log('   ⚠️  ISSUE FOUND: This chart has numeric labels instead of text!');
      }
    });

    // STEP 5: Check what the source data looks like in the fact sheet
    console.log('\nSTEP 5: Investigating source data in fact sheet...');
    
    if (dataCards.length > 0) {
      const firstCard = dataCards[0];
      const questionKey = firstCard.debug_key;
      
      console.log(`\n🔍 Deep dive into question key: "${questionKey}"`);
      
      // Find the original question in the database
      const questionKeyForSearch = questionKey.replace(/_/g, ' ');
      const [originalQuestions] = await db.execute(`
        SELECT id, prompt, options 
        FROM survey_questions 
        WHERE survey_id = ? 
        AND (prompt LIKE ? OR prompt LIKE ?)
        LIMIT 1
      `, [surveyId, `%${questionKeyForSearch}%`, `%${questionKey}%`]);
      
      if (originalQuestions.length > 0) {
        const originalQuestion = originalQuestions[0];
        console.log(`✅ Found original question: ${originalQuestion.prompt.substring(0, 60)}...`);
        console.log(`📝 Available options:`, originalQuestion.options);
        
        // Check raw answers in database
        const [rawAnswers] = await db.execute(`
          SELECT answer_value, COUNT(*) as count
          FROM survey_answers sa
          JOIN survey_responses sr ON sa.response_id = sr.id
          WHERE sr.survey_id = ? AND sa.question_id = ?
          GROUP BY answer_value
          ORDER BY count DESC
          LIMIT 5
        `, [surveyId, originalQuestion.id]);
        
        console.log('\n📊 Raw answers in database:');
        rawAnswers.forEach(answer => {
          console.log(`  "${answer.answer_value}": ${answer.count} responses`);
        });
        
        // Compare with fact sheet data
        const factSheetData = factSheet.fact_sheet.question_stats[questionKey];
        if (factSheetData && factSheetData.distribution) {
          console.log('\n📋 Fact sheet distribution:');
          Object.entries(factSheetData.distribution).slice(0, 5).forEach(([value, data]) => {
            console.log(`  "${value}": ${data.percentage}% (${data.count} responses)`);
          });
          
          console.log('\n🔍 COMPARISON:');
          console.log('Raw DB answers vs Fact sheet values:');
          rawAnswers.slice(0, 3).forEach((dbAnswer, i) => {
            const factSheetEntries = Object.entries(factSheetData.distribution);
            if (factSheetEntries[i]) {
              const [fsValue] = factSheetEntries[i];
              console.log(`  DB: "${dbAnswer.answer_value}" vs FactSheet: "${fsValue}"`);
              if (dbAnswer.answer_value !== fsValue) {
                console.log('    ⚠️  MISMATCH FOUND! This is likely where labels get lost.');
              }
            }
          });
        }
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Stack:', error.stack);
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  traceCohortFlow();
}

module.exports = { traceCohortFlow }; 