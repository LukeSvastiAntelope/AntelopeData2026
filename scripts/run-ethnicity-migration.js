const mysql = require('mysql2/promise');
require('dotenv').config();

async function runEthnicityMigration() {
    let connection;
    
    try {
        // Create connection
        connection = await mysql.createConnection({
            host: process.env.MYSQL_HOST,
            port: process.env.MYSQL_PORT,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.MYSQL_DATABASE
        });

        console.log('📊 Connected to database');

        // Check if ethnicity field already exists
        const [existingRows] = await connection.execute(
            "SELECT COUNT(*) as count FROM demographic_templates WHERE field_name = 'ethnicity'"
        );

        if (existingRows[0].count > 0) {
            console.log('⚠️  Ethnicity field already exists, skipping migration');
            return;
        }

        console.log('🚀 Starting ethnicity demographic migration...');

        // Begin transaction
        await connection.beginTransaction();

        try {
            // Add ethnicity field
            await connection.execute(`
                INSERT INTO demographic_templates (field_name, field_type, field_label, field_options, validation_rules, category, sort_order, help_text) VALUES
                ('ethnicity', 'select', 'Race/Ethnicity', 
                 '["White", "Black or African American", "Hispanic or Latino", "Asian", "Native American", "Pacific Islander", "Mixed Race", "Other", "Prefer not to say"]', 
                 '{"required": false}', 'basic', 3, 'Select your race or ethnicity')
            `);

            console.log('✅ Added ethnicity demographic field');

            // Update sort orders for existing fields
            const updateQueries = [
                "UPDATE demographic_templates SET sort_order = 4 WHERE field_name = 'location_country'",
                "UPDATE demographic_templates SET sort_order = 5 WHERE field_name = 'location_state'", 
                "UPDATE demographic_templates SET sort_order = 6 WHERE field_name = 'education'",
                "UPDATE demographic_templates SET sort_order = 7 WHERE field_name = 'income'",
                "UPDATE demographic_templates SET sort_order = 8 WHERE field_name = 'employment_status'",
                "UPDATE demographic_templates SET sort_order = 9 WHERE field_name = 'industry'",
                "UPDATE demographic_templates SET sort_order = 10 WHERE field_name = 'job_title'",
                "UPDATE demographic_templates SET sort_order = 11 WHERE field_name = 'political_affiliation'",
                "UPDATE demographic_templates SET sort_order = 12 WHERE field_name = 'marital_status'",
                "UPDATE demographic_templates SET sort_order = 13 WHERE field_name = 'household_size'"
            ];

            for (const query of updateQueries) {
                await connection.execute(query);
            }

            console.log('✅ Updated sort orders for existing fields');

            // Commit transaction
            await connection.commit();
            console.log('🎉 Ethnicity demographic migration completed successfully!');

            // Show current demographic fields
            const [fields] = await connection.execute(
                "SELECT field_name, field_label, category, sort_order FROM demographic_templates WHERE is_active = 1 ORDER BY category, sort_order"
            );

            console.log('\n📋 Current demographic fields:');
            let currentCategory = '';
            fields.forEach(field => {
                if (field.category !== currentCategory) {
                    currentCategory = field.category;
                    console.log(`\n${currentCategory.toUpperCase()}:`);
                }
                console.log(`  ${field.sort_order}. ${field.field_label} (${field.field_name})`);
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        }

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
            console.log('📊 Database connection closed');
        }
    }
}

// Run migration
if (require.main === module) {
    runEthnicityMigration()
        .then(() => {
            console.log('✅ Migration script completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Migration script failed:', error);
            process.exit(1);
        });
}

module.exports = { runEthnicityMigration }; 