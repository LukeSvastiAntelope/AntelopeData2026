const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Database connection (matching the app's connection setup)
const connectionParams = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    acquireTimeout: 60000,
    timeout: 60000
};

let pool = null;

const getConnection = async () => {
    if (!pool) {
        pool = mysql.createPool(connectionParams);
    }
    return pool;
};

// Sample data based on Pew Research "Social Media Use in 2021" findings
const generateSyntheticData = () => {
  const platforms = [
    'YouTube', 'Facebook', 'Instagram', 'Pinterest', 'LinkedIn', 
    'Snapchat', 'Twitter', 'WhatsApp', 'TikTok', 'Reddit'
  ];

  const ageGroups = [
    { range: '18-29', min: 18, max: 29 },
    { range: '30-49', min: 30, max: 49 },
    { range: '50-64', min: 50, max: 64 },
    { range: '65+', min: 65, max: 85 }
  ];

  const genders = ['Male', 'Female'];
  const races = ['White', 'Black', 'Hispanic', 'Asian', 'Other'];
  const educationLevels = [
    'High school or less',
    'Some college',
    'College graduate',
    'Postgraduate'
  ];

  const usStates = [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
    'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
    'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
    'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
    'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
    'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
    'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
    'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
    'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
    'West Virginia', 'Wisconsin', 'Wyoming'
  ];

  // Usage patterns based on Pew Research findings
  const usagePatterns = {
    'YouTube': { '18-29': 95, '30-49': 91, '50-64': 83, '65+': 49 },
    'Facebook': { '18-29': 70, '30-49': 77, '50-64': 73, '65+': 50 },
    'Instagram': { '18-29': 71, '30-49': 48, '50-64': 29, '65+': 13 },
    'Pinterest': { '18-29': 43, '30-49': 43, '50-64': 33, '65+': 22 },
    'LinkedIn': { '18-29': 30, '30-49': 42, '50-64': 24, '65+': 11 },
    'Snapchat': { '18-29': 65, '30-49': 32, '50-64': 14, '65+': 4 },
    'Twitter': { '18-29': 42, '30-49': 27, '50-64': 17, '65+': 7 },
    'WhatsApp': { '18-29': 30, '30-49': 40, '50-64': 28, '65+': 18 },
    'TikTok': { '18-29': 48, '30-49': 22, '50-64': 14, '65+': 4 },
    'Reddit': { '18-29': 46, '30-49': 35, '50-64': 11, '65+': 4 }
  };

  const respondents = [];
  const targetSampleSize = 200; // Manageable sample for testing

  for (let i = 1; i <= targetSampleSize; i++) {
    const ageGroup = ageGroups[Math.floor(Math.random() * ageGroups.length)];
    const age = Math.floor(Math.random() * (ageGroup.max - ageGroup.min + 1)) + ageGroup.min;
    const gender = genders[Math.floor(Math.random() * genders.length)];
    const race = races[Math.floor(Math.random() * races.length)];
    const education = educationLevels[Math.floor(Math.random() * educationLevels.length)];
    const state = usStates[Math.floor(Math.random() * usStates.length)];

    // Generate platform usage based on age group probabilities
    const platformUsage = {};
    platforms.forEach(platform => {
      const probability = usagePatterns[platform][ageGroup.range] || 20;
      platformUsage[platform] = Math.random() * 100 < probability;
    });

    // Generate usage frequency for platforms they use
    const usageFrequency = {};
    platforms.forEach(platform => {
      if (platformUsage[platform]) {
        const frequencies = ['Daily', 'Weekly', 'Monthly', 'Rarely'];
        const weights = [0.6, 0.25, 0.1, 0.05]; // Most active users check daily
        const rand = Math.random();
        let cumulative = 0;
        for (let j = 0; j < frequencies.length; j++) {
          cumulative += weights[j];
          if (rand < cumulative) {
            usageFrequency[platform] = frequencies[j];
            break;
          }
        }
      }
    });

    respondents.push({
      id: `R${String(i).padStart(4, '0')}`,
      demographics: {
        name: `Anonymous Respondent ${i}`,
        email: '', // Empty email for anonymous twins
        age: age,
        gender: gender,
        race: race,
        education: education,
        location: state,
        source: 'Pew Research Social Media 2021 (Synthetic)'
      },
      responses: {
        platforms_used: Object.keys(platformUsage).filter(p => platformUsage[p]),
        platform_usage: platformUsage,
        usage_frequency: usageFrequency,
        total_platforms: Object.values(platformUsage).filter(Boolean).length,
        most_used_platform: Object.keys(usageFrequency)[0] || 'None',
        daily_usage_hours: Math.floor(Math.random() * 8) + 1, // 1-8 hours
        primary_activities: generateActivities(),
        privacy_concerns: Math.random() > 0.4 ? 'Yes' : 'No',
        misinformation_encountered: Math.random() > 0.3 ? 'Yes' : 'No'
      }
    });
  }

  return respondents;
};

const generateActivities = () => {
  const activities = [
    'Watching videos', 'Sharing photos', 'Reading news', 'Messaging friends',
    'Following brands', 'Shopping', 'Gaming', 'Live streaming', 'Creating content'
  ];
  const selected = [];
  const numActivities = Math.floor(Math.random() * 4) + 1; // 1-4 activities
  
  while (selected.length < numActivities) {
    const activity = activities[Math.floor(Math.random() * activities.length)];
    if (!selected.includes(activity)) {
      selected.push(activity);
    }
  }
  
  return selected;
};

// Create survey questions based on the data structure
const createSurveyQuestions = () => {
  return [
    {
      id: 'platforms_used',
      type: 'text',
      question: 'Which social media platforms do you use?',
      options: ['YouTube', 'Facebook', 'Instagram', 'Pinterest', 'LinkedIn', 'Snapchat', 'Twitter', 'WhatsApp', 'TikTok', 'Reddit']
    },
    {
      id: 'daily_usage_hours',
      type: 'text',
      question: 'How many hours per day do you spend on social media?',
      min: 0,
      max: 24
    },
    {
      id: 'primary_activities',
      type: 'text',
      question: 'What are your primary activities on social media?',
      options: ['Watching videos', 'Sharing photos', 'Reading news', 'Messaging friends', 'Following brands', 'Shopping', 'Gaming', 'Live streaming', 'Creating content']
    },
    {
      id: 'privacy_concerns',
      type: 'text',
      question: 'Do you have concerns about privacy on social media platforms?',
      options: ['Yes', 'No']
    },
    {
      id: 'misinformation_encountered',
      type: 'text',
      question: 'Have you encountered misinformation on social media in the past year?',
      options: ['Yes', 'No']
    }
  ];
};

// Import function that uses existing survey submission system
const importSyntheticData = async () => {
  try {
    console.log('🚀 Starting Pew Research Social Media Data Import...');
    
    // Generate synthetic data
    const respondents = generateSyntheticData();
    console.log(`📊 Generated ${respondents.length} synthetic respondents`);

    // Create a survey to hold this data
    const surveyData = {
      title: 'Social Media Use in 2021 (Pew Research - Synthetic)',
      description: 'Synthetic dataset based on Pew Research Center findings about American social media usage patterns in 2021. This data represents typical usage patterns across different demographics.',
      questions: createSurveyQuestions(),
      is_public: true,
      status: 'published', // Use 'published' so it can be accessed publicly
      source: 'imported_dataset'
    };

    const db = await getConnection();
    
    // Generate a unique slug for the survey
    const baseSlug = surveyData.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
    const uniqueId = Date.now().toString(36);
    const slug = `${baseSlug}-${uniqueId}`;

    // Insert survey (simplified - in real implementation would use existing survey creation)
    const [surveyResult] = await db.execute(`
      INSERT INTO surveys (title, description, slug, created_by, is_public, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
    `, [
      surveyData.title,
      surveyData.description,
      slug,
      1592, // created_by - thomas.petersen+thompete@gmail.com
      surveyData.is_public,
      surveyData.status
    ]);

    const surveyId = surveyResult.insertId;
    console.log(`📝 Created survey with ID: ${surveyId}`);
    
    // Insert survey questions and store their IDs
    const questionIds = {};
    let questionOrder = 1;
    for (const question of surveyData.questions) {
      const [questionResult] = await db.execute(`
        INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order) 
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        surveyId,
        question.type || 'text',
        question.question || '',
        question.options ? JSON.stringify(question.options) : null,
        1, // is_required
        questionOrder++
      ]);
      questionIds[question.id] = questionResult.insertId;
    }

    // Import each respondent using existing system patterns
    let successCount = 0;
    let errorCount = 0;

    for (const respondent of respondents) {
      try {
        // Generate agent token
        const agentToken = `pew_${respondent.id}_${Date.now()}`;

        // Insert survey response
        const [responseResult] = await db.execute(`
          INSERT INTO survey_responses (
            survey_id, 
            demographics, 
            agent_token,
            submitted_at
          ) VALUES (?, ?, ?, NOW())
        `, [
          surveyId,
          JSON.stringify(respondent.demographics),
          agentToken
        ]);

        const responseId = responseResult.insertId;

        // Insert survey answers based on the responses
        for (const [key, value] of Object.entries(respondent.responses)) {
          // Map response keys to question IDs
          const questionId = questionIds[key];
          if (questionId) {
            await db.execute(`
              INSERT INTO survey_answers (response_id, question_id, answer_value)
              VALUES (?, ?, ?)
            `, [
              responseId,
              questionId,
              Array.isArray(value) ? JSON.stringify(value) : String(value)
            ]);
          }
        }

        // Create responder agent entry (anonymous since no email)
        await db.execute(`
          INSERT INTO responder_agents (created_from_response_id, agent_token, base_profile)
          VALUES (?, ?, ?)
        `, [
          responseId,
          agentToken,
          JSON.stringify({
            name: respondent.demographics.name,
            demographics: respondent.demographics,
            source: 'pew_research_synthetic'
          })
        ]);

        successCount++;
        if (successCount % 50 === 0) {
          console.log(`✅ Imported ${successCount} respondents...`);
        }

      } catch (error) {
        console.error(`❌ Error importing respondent ${respondent.id}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n🎉 Import completed!`);
    console.log(`✅ Successfully imported: ${successCount} respondents`);
    console.log(`❌ Errors: ${errorCount} respondents`);
    console.log(`📊 Survey ID: ${surveyId}`);
    console.log(`\n📋 Next steps:`);
    console.log(`1. Digital twins will be created automatically when users query this data`);
    console.log(`2. Visit /surveys/${surveyId} to view the imported survey`);
    console.log(`3. Use cohort-chat to query these synthetic respondents`);

  } catch (error) {
    console.error('💥 Import failed:', error);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
};

// Run the import
if (require.main === module) {
  importSyntheticData();
}

module.exports = {
  generateSyntheticData,
  importSyntheticData,
  createSurveyQuestions
}; 