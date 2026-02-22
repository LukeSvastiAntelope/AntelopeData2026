// Simple test script to test the Questions API with proper authentication
const fetch = require('node-fetch');

async function testQuestionsAPI() {
  try {
    console.log('Testing Questions API...');
    
    // This should work from within the app context
    const response = await fetch('http://localhost:3000/api/surveys/81/questions', {
      headers: {
        'x-user-id': '1592',
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (response.ok) {
      const data = await response.json();
      console.log('Survey Title:', data.surveyTitle);
      console.log('Total Questions:', data.totalQuestions);
      console.log('Question Categories:', Object.keys(data.analysisCategories || {}));
      console.log('First 3 questions:');
      (data.questions || []).slice(0, 3).forEach((q, i) => {
        console.log(`  ${i + 1}. ${q.question_text?.substring(0, 80)}...`);
        console.log(`     Type: ${q.question_type}, Category: ${q.category}`);
      });
    } else {
      const errorText = await response.text();
      console.log('Error response:', errorText);
    }
  } catch (error) {
    console.error('Error testing Questions API:', error);
  }
}

testQuestionsAPI();