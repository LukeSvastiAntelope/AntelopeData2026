// Test the semantic question matcher with real data from the Questions API
import { SemanticQuestionMatcher } from './src/app/utils/analysis/question-matcher.js';

async function testSemanticMatcher() {
  try {
    console.log('🔍 Testing Semantic Question Matcher...\n');
    
    // Simulate questions data (would come from Questions API in real usage)
    const mockQuestions = [
      {
        id: "Q9",
        question_text: "In general, do you think of the United States as the best country in the world, better than most countries, about average, or worse than most countries when it comes to being a place to live?",
        question_type: "multiple_choice",
        category: "opinion",
        response_options: ["The U.S. is the best", "The U.S. is above average", "The U.S. is average", "The U.S. is below average", "The U.S. is the worst"],
        variable_name: "Q9",
        analysis_tags: ["opinion", "comparison_analysis"],
        is_demographic: false,
        semantic_keywords: ["united", "states", "best", "country", "world", "place", "live", "america"]
      },
      {
        id: "Q21",
        question_text: "Are you currently employed full time, employed part time, temporarily laid off, unemployed and looking for work, retired, or are you disabled and unable to work?",
        question_type: "multiple_choice", 
        category: "factual",
        response_options: ["Employed full time", "Employed part time", "Temporarily laid off", "Unemployed and looking", "Retired", "Disabled"],
        variable_name: "Q21",
        analysis_tags: ["factual", "demographic_analysis"],
        is_demographic: false,
        semantic_keywords: ["employed", "work", "job", "retired", "unemployed", "disabled", "employment"]
      },
      {
        id: "Q87",
        question_text: "What is your age?",
        question_type: "multiple_choice",
        category: "demographic", 
        response_options: ["18-29", "30-49", "50-64", "65+"],
        variable_name: "Q87",
        analysis_tags: ["demographic", "demographic_analysis"],
        is_demographic: true,
        semantic_keywords: ["age", "years", "demographic"]
      },
      {
        id: "Q88", 
        question_text: "What is your gender?",
        question_type: "multiple_choice",
        category: "demographic",
        response_options: ["A man", "A woman", "Other"],
        variable_name: "Q88", 
        analysis_tags: ["demographic", "demographic_analysis"],
        is_demographic: true,
        semantic_keywords: ["gender", "male", "female", "demographic"]
      }
    ];

    const mockDemographics = mockQuestions.filter(q => q.is_demographic);
    const mockNonDemographics = mockQuestions.filter(q => !q.is_demographic);
    
    // Initialize matcher
    const matcher = new SemanticQuestionMatcher(mockNonDemographics, mockDemographics);
    
    // Test queries
    const testQueries = [
      "How does employment status relate to opinions about America?",
      "Is there a correlation between age and gender?", 
      "What factors influence views on the United States?",
      "Demographics analysis of survey respondents"
    ];
    
    for (const query of testQueries) {
      console.log(`\n📋 Query: "${query}"`);
      console.log('─'.repeat(60));
      
      const result = matcher.findRelevantQuestions(query, 3, true);
      
      console.log(`🎯 Analysis Type: ${result.suggestedAnalysisType}`);
      console.log(`📊 Confidence: ${(result.confidenceScore * 100).toFixed(1)}%`);
      
      console.log('\n📝 Primary Questions:');
      result.primaryQuestions.forEach((q, i) => {
        console.log(`  ${i + 1}. ${q.question_text.substring(0, 80)}...`);
        console.log(`     Type: ${q.question_type}, Category: ${q.category}`);
      });
      
      console.log('\n👥 Demographics:');
      result.demographicQuestions.forEach((q, i) => {
        console.log(`  ${i + 1}. ${q.question_text}`);
      });
    }
    
    console.log('\n✅ Semantic Question Matcher test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testSemanticMatcher();