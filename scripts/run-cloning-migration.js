const mysql = require('mysql2/promise');
require('dotenv').config();

async function runCloningMigration() {
  let connection;
  
  try {
    console.log('🚀 Starting survey cloning support migration...\n');
    
    // Create database connection using environment variables
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || process.env.DB_HOST,
      user: process.env.MYSQL_USER || process.env.DB_USER,
      password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD,
      database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'marketmaker',
      port: process.env.MYSQL_PORT || process.env.DB_PORT || 3306,
      ssl: {
        // DigitalOcean requires SSL but uses self-signed certificates
        rejectUnauthorized: false
      }
    });
    
    console.log('✅ Connected to DigitalOcean database...');
    
    // Check if columns already exist
    const [checkColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'surveys' 
      AND COLUMN_NAME IN ('parent_survey_id', 'is_template', 'clone_count', 'cloned_at')
    `, [process.env.MYSQL_DATABASE || process.env.DB_NAME || 'marketmaker']);
    
    if (checkColumns.length > 0) {
      console.log('✅ Cloning support columns already exist. Migration already completed.');
      return;
    }
    
    console.log('📝 Adding cloning support columns to surveys table...');
    
    // Start transaction for safety
    await connection.beginTransaction();
    
    try {
      // Add parent survey tracking columns
      await connection.execute(`
        ALTER TABLE surveys 
        ADD COLUMN parent_survey_id INT NULL,
        ADD COLUMN is_template BOOLEAN DEFAULT FALSE,
        ADD COLUMN clone_count INT DEFAULT 0,
        ADD COLUMN cloned_at TIMESTAMP NULL
      `);
      console.log('  ✅ Added parent_survey_id, is_template, clone_count, cloned_at columns');
      
      // Add foreign key constraint
      await connection.execute(`
        ALTER TABLE surveys 
        ADD CONSTRAINT fk_surveys_parent 
        FOREIGN KEY (parent_survey_id) REFERENCES surveys(id) ON DELETE SET NULL
      `);
      console.log('  ✅ Added foreign key constraint for parent_survey_id');
      
      // Add indexes for performance
      await connection.execute('ALTER TABLE surveys ADD INDEX idx_surveys_parent_id (parent_survey_id)');
      await connection.execute('ALTER TABLE surveys ADD INDEX idx_surveys_is_template (is_template)');
      await connection.execute('ALTER TABLE surveys ADD INDEX idx_surveys_clone_count (clone_count)');
      console.log('  ✅ Added indexes for cloning queries');
      
      // Update source enum to include 'clone'
      await connection.execute(`
        ALTER TABLE surveys 
        MODIFY COLUMN source ENUM('native', 'csv_import', 'excel_import', 'surveymonkey_import', 'typeform_import', 'google_forms_import', 'google_sheets_import', 'clone') DEFAULT 'native'
      `);
      console.log('  ✅ Updated source column to support clone type');
      
      // Commit transaction
      await connection.commit();
      console.log('✅ Transaction committed successfully');
      
    } catch (error) {
      // Rollback on error
      await connection.rollback();
      throw error;
    }
    
    // Verify the migration
    const [verification] = await connection.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'surveys' 
      AND COLUMN_NAME IN ('parent_survey_id', 'is_template', 'clone_count', 'cloned_at', 'source')
      ORDER BY COLUMN_NAME
    `, [process.env.MYSQL_DATABASE || process.env.DB_NAME || 'marketmaker']);
    
    console.log('\n📊 Migration verification:');
    verification.forEach(row => {
      console.log(`  • ${row.COLUMN_NAME}: ${row.DATA_TYPE} (nullable: ${row.IS_NULLABLE}, default: ${row.COLUMN_DEFAULT})`);
    });
    
    // Check indexes
    const [indexes] = await connection.execute(`
      SELECT INDEX_NAME, COLUMN_NAME 
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'surveys' 
      AND INDEX_NAME LIKE '%parent%' OR INDEX_NAME LIKE '%template%' OR INDEX_NAME LIKE '%clone%'
    `, [process.env.MYSQL_DATABASE || process.env.DB_NAME || 'marketmaker']);
    
    if (indexes.length > 0) {
      console.log('\n🔍 Created indexes:');
      indexes.forEach(row => {
        console.log(`  • ${row.INDEX_NAME} on ${row.COLUMN_NAME}`);
      });
    }
    
    console.log('\n🎉 Survey cloning migration completed successfully!');
    console.log('\nNew capabilities enabled:');
    console.log('  • surveys.parent_survey_id - tracks which survey this was cloned from');
    console.log('  • surveys.is_template - marks surveys as reusable templates');
    console.log('  • surveys.clone_count - counts how many times a survey has been cloned');
    console.log('  • surveys.cloned_at - timestamp when survey was cloned');
    console.log('  • surveys.source - now supports "clone" as a source type');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nFull error details:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Database connection closed.');
    }
  }
}

// Run the migration
console.log('🚀 Starting survey cloning support migration...\n');

runCloningMigration()
  .then(() => {
    console.log('\n✅ Migration script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration script failed.');
    process.exit(1);
  }); 