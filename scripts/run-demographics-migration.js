const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

// Database connection setup (copied from db.ts)
const connectionParams = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    maxIdle: 10,
    idleTimeout: 60000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
}

const openSql = async () => {
    return mysql.createPool(connectionParams);
}

async function runMigration() {
    console.log('🚀 Starting demographics customization migration...');
    
    try {
        // Read the migration file
        const migrationPath = path.join(__dirname, '../migrations/20250122_add_demographics_customization.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        // Remove comments and split SQL statements
        const cleanSQL = migrationSQL
            .split('\n')
            .filter(line => !line.trim().startsWith('--'))
            .join('\n');
            
        const statements = cleanSQL
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => {
                // Filter out empty statements and rollback section
                return stmt && 
                       stmt.length > 10 && 
                       !stmt.includes('Rollback') &&
                       (stmt.toUpperCase().includes('CREATE') || 
                        stmt.toUpperCase().includes('ALTER') || 
                        stmt.toUpperCase().includes('INSERT'));
            });
        
        // Get database connection
        const db = await openSql();
        
        console.log(`📝 Found ${statements.length} SQL statements...`);
        
        if (statements.length === 0) {
            console.log('🔍 Debugging: First 500 characters of migration file:');
            console.log(migrationSQL.substring(0, 500));
            console.log('...');
        }
        
        // Execute each statement
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            if (statement) {
                try {
                    console.log(`   ${i + 1}. Executing: ${statement.substring(0, 50)}...`);
                    await db.execute(statement);
                    console.log(`   ✅ Success`);
                } catch (error) {
                    // Check if it's a "table already exists" error - that's okay
                    if (error.code === 'ER_TABLE_EXISTS_ERROR') {
                        console.log(`   ⚠️  Table already exists, skipping...`);
                    } else if (error.code === 'ER_DUP_FIELDNAME') {
                        console.log(`   ⚠️  Column already exists, skipping...`);
                    } else if (error.code === 'ER_DUP_ENTRY') {
                        console.log(`   ⚠️  Data already exists, skipping...`);
                    } else {
                        console.error(`   ❌ Error executing statement: ${error.message}`);
                        throw error;
                    }
                }
            }
        }
        
        console.log('✅ Demographics customization migration completed successfully!');
        console.log('');
        console.log('📊 Created tables:');
        console.log('   - demographic_templates (pre-defined field templates)');
        console.log('   - survey_demographics_config (survey-specific configuration)');
        console.log('   - custom_demographic_fields (custom fields for advanced mode)');
        console.log('   - survey_demographic_responses (demographic response storage)');
        console.log('');
        console.log('🔧 Modified tables:');
        console.log('   - surveys (added has_demographics, demographics_required columns)');
        console.log('');
        console.log('📝 Inserted default demographic templates for simple mode');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

// Run the migration
runMigration().catch(console.error); 