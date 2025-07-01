const https = require('https');
const http = require('http');

// Test configuration
const BASE_URL = 'http://localhost:3000';
const SURVEY_ID = 49; // Pew Research survey
const TEST_QUESTIONS = [
  'What are the most popular platforms?',
  'How many respondents are there?',
  'What is the average usage time?',
  'Show me the age distribution',
  'What questions are in this survey?',
  'How reliable is this data?'
];

// Note: These tests require proper authentication through the browser
// The API endpoints use middleware authentication, not direct header auth

// Simple HTTP request helper
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const requestModule = isHttps ? https : http;
    
    const req = requestModule.request(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            status: res.statusCode,
            data: jsonData,
            headers: res.headers
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            data: data,
            headers: res.headers
          });
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

// Test the schema analysis endpoint
async function testSchemaAnalysis() {
  console.log('🔍 Testing Schema Analysis API...');
  
  try {
    const response = await makeRequest(`${BASE_URL}/api/surveys/${SURVEY_ID}/schema`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Note: In a real test, you'd need to include authentication headers
      }
    });
    
    console.log(`📊 Schema Analysis Response (${response.status}):`);
    
    if (response.status === 200) {
      const schema = response.data;
      console.log(`✅ Survey: ${schema.survey_meta.title}`);
      console.log(`📈 Respondents: ${schema.survey_meta.total_respondents}`);
      console.log(`❓ Questions: ${schema.questions.length}`);
      console.log(`👥 Demographics: ${Object.keys(schema.demographics).length}`);
      console.log(`🎯 Recommendations: ${schema.usage_recommendations.length}`);
      
      // Show some key insights
      if (schema.fact_sheet && schema.fact_sheet.question_stats) {
        console.log('\n📋 Key Insights:');
        const questionStats = Object.keys(schema.fact_sheet.question_stats);
        questionStats.forEach(key => {
          const stats = schema.fact_sheet.question_stats[key];
          if (stats.adoption_rates) {
            const topPlatform = Object.entries(stats.adoption_rates)[0];
            if (topPlatform) {
              console.log(`   🏆 Top platform: ${topPlatform[0]} (${topPlatform[1].percentage}%)`);
            }
          } else if (stats.statistics) {
            console.log(`   📊 Average: ${stats.statistics.mean} (range: ${stats.statistics.min}-${stats.statistics.max})`);
          }
        });
      }
      
      return true;
    } else {
      console.error('❌ Schema analysis failed:', response.data);
      return false;
    }
    
  } catch (error) {
    console.error('💥 Schema analysis error:', error.message);
    return false;
  }
}

// Test the query endpoint
async function testQueryEndpoint() {
  console.log('\n🤔 Testing Query API...');
  
  for (const question of TEST_QUESTIONS) {
    try {
      console.log(`\n❓ Question: "${question}"`);
      
      const response = await makeRequest(`${BASE_URL}/api/surveys/${SURVEY_ID}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Note: In a real test, you'd need to include authentication headers
        },
        body: { question }
      });
      
      if (response.status === 200) {
        const result = response.data;
        console.log(`✅ Answer (${result.source}, confidence: ${result.confidence}): ${result.answer.substring(0, 200)}${result.answer.length > 200 ? '...' : ''}`);
        console.log(`⚡ Execution time: ${result.execution_time_ms}ms`);
      } else {
        console.error(`❌ Query failed (${response.status}):`, response.data);
      }
      
    } catch (error) {
      console.error(`💥 Query error for "${question}":`, error.message);
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

// Performance test
async function testPerformance() {
  console.log('\n⚡ Testing Performance...');
  
  const testQuestion = 'What are the most popular platforms?';
  const iterations = 5;
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const startTime = Date.now();
    
    try {
      const response = await makeRequest(`${BASE_URL}/api/surveys/${SURVEY_ID}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: { question: testQuestion }
      });
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      times.push(executionTime);
      
      if (response.status === 200) {
        console.log(`   Iteration ${i + 1}: ${executionTime}ms (API reported: ${response.data.execution_time_ms}ms)`);
      } else {
        console.log(`   Iteration ${i + 1}: Failed (${response.status})`);
      }
      
    } catch (error) {
      console.log(`   Iteration ${i + 1}: Error - ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  if (times.length > 0) {
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    
    console.log(`\n📊 Performance Summary:`);
    console.log(`   Average: ${avgTime.toFixed(1)}ms`);
    console.log(`   Min: ${minTime}ms`);
    console.log(`   Max: ${maxTime}ms`);
    console.log(`   Target: <100ms for fact sheet queries, <500ms for dynamic queries`);
  }
}

// Main test runner
async function runTests() {
  console.log('🧪 Survey Schema Analysis API Tests\n');
  console.log(`Testing against: ${BASE_URL}`);
  console.log(`Survey ID: ${SURVEY_ID}\n`);
  
  // Note: These tests will fail without proper authentication
  console.log('⚠️  Note: These tests require authentication and a running server');
  console.log('⚠️  Run with: npm run dev (in another terminal)\n');
  
  const schemaSuccess = await testSchemaAnalysis();
  
  if (schemaSuccess) {
    await testQueryEndpoint();
    await testPerformance();
  }
  
  console.log('\n🎉 Tests completed!');
  console.log('\n💡 Next steps:');
  console.log('   1. Integrate with cohort-chat system');
  console.log('   2. Add caching for schema analysis');
  console.log('   3. Expand query pattern recognition');
  console.log('   4. Add cross-tabulation analysis');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  testSchemaAnalysis,
  testQueryEndpoint,
  testPerformance,
  runTests
}; 