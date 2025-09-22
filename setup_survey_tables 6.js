// Database setup script for Survey tables
// Run with: node setup_survey_tables.js

const mysql = require('mysql2/promise');
require('dotenv').config();

const connectionParams = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
};

const surveyTables = [
    // Main survey table
    `CREATE TABLE IF NOT EXISTS surveys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        slug VARCHAR(255) UNIQUE NOT NULL,
        created_by BIGINT NOT NULL,
        is_public BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        status ENUM('draft', 'published', 'closed') DEFAULT 'draft',
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_slug (slug),
        INDEX idx_created_by (created_by),
        INDEX idx_status (status)
    )`,

    // Survey questions table
    `CREATE TABLE IF NOT EXISTS survey_questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        survey_id INT NOT NULL,
        type ENUM('text', 'single-choice', 'multi-choice', 'scale', 'email', 'number') NOT NULL,
        prompt TEXT NOT NULL,
        options JSON,
        is_required BOOLEAN DEFAULT FALSE,
        question_order INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
        INDEX idx_survey_id (survey_id),
        INDEX idx_order (survey_id, question_order)
    )`,

    // Survey responses table
    `CREATE TABLE IF NOT EXISTS survey_responses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        survey_id INT NOT NULL,
        responder_id BIGINT NULL,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        demographics JSON,
        ip_address VARCHAR(45),
        user_agent TEXT,
        FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
        FOREIGN KEY (responder_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_survey_id (survey_id),
        INDEX idx_submitted_at (submitted_at),
        INDEX idx_ip_address (ip_address)
    )`,

    // Individual answers to questions
    `CREATE TABLE IF NOT EXISTS survey_answers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        response_id INT NOT NULL,
        question_id INT NOT NULL,
        answer_value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (response_id) REFERENCES survey_responses(id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES survey_questions(id) ON DELETE CASCADE,
        UNIQUE KEY unique_response_question (response_id, question_id),
        INDEX idx_response_id (response_id),
        INDEX idx_question_id (question_id)
    )`,

    // Responder agents (digital twins)
    `CREATE TABLE IF NOT EXISTS responder_agents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        base_profile JSON NOT NULL,
        enrichment_status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
        created_from_response_id INT NOT NULL,
        agent_token VARCHAR(255) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_queried_at TIMESTAMP NULL,
        query_count INT DEFAULT 0,
        FOREIGN KEY (created_from_response_id) REFERENCES survey_responses(id) ON DELETE CASCADE,
        INDEX idx_response_id (created_from_response_id),
        INDEX idx_token (agent_token),
        INDEX idx_enrichment_status (enrichment_status)
    )`,

    // Agent query log for analytics
    `CREATE TABLE IF NOT EXISTS agent_queries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        responder_agent_id INT NOT NULL,
        query_text TEXT NOT NULL,
        response_text TEXT,
        queried_by BIGINT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        response_time_ms INT,
        FOREIGN KEY (responder_agent_id) REFERENCES responder_agents(id) ON DELETE CASCADE,
        FOREIGN KEY (queried_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_agent_id (responder_agent_id),
        INDEX idx_queried_by (queried_by),
        INDEX idx_created_at (created_at)
    )`
];

async function setupSurveyTables() {
    let connection;
    
    try {
        console.log('🔌 Connecting to database...');
        connection = await mysql.createConnection(connectionParams);
        
        console.log('✅ Connected to database successfully!');
        console.log('📋 Creating survey tables...\n');

        for (let i = 0; i < surveyTables.length; i++) {
            const tableName = surveyTables[i].match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1];
            console.log(`${i + 1}. Creating table: ${tableName}`);
            
            try {
                await connection.execute(surveyTables[i]);
                console.log(`   ✅ Table ${tableName} created successfully`);
            } catch (error) {
                console.log(`   ❌ Error creating table ${tableName}:`, error.message);
            }
        }

        console.log('\n🎉 Survey database setup completed!');
        console.log('\n📋 Tables created:');
        console.log('   • surveys');
        console.log('   • survey_questions');
        console.log('   • survey_responses');
        console.log('   • survey_answers');
        console.log('   • responder_agents');
        console.log('   • agent_queries');

    } catch (error) {
        console.error('❌ Database setup failed:', error.message);
        console.log('\n💡 Make sure your database credentials are correct in .env file');
    } finally {
        if (connection) {
            await connection.end();
            console.log('\n🔌 Database connection closed');
        }
    }
}

// Run the setup
setupSurveyTables(); 