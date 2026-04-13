#!/usr/bin/env node
/**
 * run-all-migrations.js
 *
 * Runs all 44 migrations in chronological order.
 *
 * Usage:
 *   node scripts/run-all-migrations.js              # continue on error (default)
 *   node scripts/run-all-migrations.js --stop-on-error
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const STOP_ON_ERROR = process.argv.includes('--stop-on-error');

// Ordered list — base schema first, then dated migrations chronologically, undated ones last.
const MIGRATIONS = [
  '00000000_create_base_schema.sql',
  '20240614_create_cohorts_table.sql',
  '20240614_add_demographic_columns.sql',
  '20240714_add_answer_code_to_survey_answers.sql',
  '20250122_add_analytics_system.sql',
  '20250122_add_demographics_customization.sql',
  '20250122_add_ethnicity_demographic.sql',
  '20250122_add_survey_source_tracking.sql',
  '20250122_add_survey_cloning_support.sql',
  '20250123_add_report_generation_tables.sql',
  '20250123_add_survey_id_to_cohorts.sql',
  '20250125_add_survey_anonymity_system.sql',
  '20250125_add_survey_anonymity_system_v2.sql',
  '20250125_add_survey_anonymity_system_safe.sql',
  '20250127_email_migration.sql',
  '20250127_fix_anonymous_profile_enum.sql',
  '20250128_normalize_demographic_fields.sql',
  '20250131_add_stopped_status.sql',
  '20250131_update_survey_status_model.sql',
  '20250201_add_channels_tables.sql',
  '20250201_create_conversations_table.sql',
  '20250201_add_conversation_type.sql',
  '20250208_add_organizations.sql',
  '20250208_add_tracking_polls.sql',
  '20250208_add_voter_file_enrichment.sql',
  '20250209_add_org_location.sql',
  '20250210_add_political_data.sql',
  '20250211_add_campaign_fields.sql',
  '20250701_add_schedule_fields.sql',
  '20250701_add_schedule_fields_safe.sql',
  '20250713_add_indexes.sql',
  '20250715_create_survey_question_stats.sql',
  '20250811_add_twin_persona_capabilities.sql',
  '20260212_add_campaign_news_digest.sql',
  '20260212_add_last_news_seen_at_to_users.sql',
  '20260212_add_political_data_district_demographics.sql',
  '20260213_add_news_conversation_type.sql',
  '20260221_add_campaign_memory_tables.sql',
  '20260222_add_agent_situation_documents.sql',
  '20260309_add_dashboard_automations.sql',
  '20260318_add_dashboard_map_overlays.sql',
  'add_agent_token_to_survey_responses.sql',
  'fix_sort_memory_issue.sql',
];

/**
 * Preprocess SQL before sending to MySQL:
 *  1. Strip DELIMITER directives (client-side only, MySQL server rejects them).
 *  2. Strip IF NOT EXISTS from ADD COLUMN — MySQL doesn't support that syntax
 *     (it's MariaDB-only). The resulting "Duplicate column" error is then caught
 *     and treated as already-applied by isIdempotentError().
 */
function preprocessSql(raw) {
  return raw
    .replace(/DELIMITER\s+\$\$\s*/gi, '')
    .replace(/DELIMITER\s+;\s*/gi, '')
    .replace(/\$\$/g, ';')
    .replace(/ADD COLUMN IF NOT EXISTS\s+/gi, 'ADD COLUMN ')
    .replace(/ADD INDEX IF NOT EXISTS\s+/gi, 'ADD INDEX ')
    .replace(/ADD UNIQUE IF NOT EXISTS\s+/gi, 'ADD UNIQUE ')
    // COMMENT ON COLUMN is PostgreSQL syntax — strip it entirely
    .replace(/COMMENT ON COLUMN\s+\S+\s+IS\s+'[^']*';\s*/gi, '');
}

/**
 * MySQL error codes that mean "already done" rather than a real problem:
 *   1050 — ER_TABLE_EXISTS_ERROR      Table already exists
 *   1060 — ER_DUP_FIELDNAME           Duplicate column name
 *   1061 — ER_DUP_KEYNAME             Duplicate key name
 *   1062 — ER_DUP_ENTRY               Duplicate entry (unique constraint)
 *   1820 — ER_MUST_CHANGE_PASSWORD    (not relevant here but safe to ignore)
 */
const IDEMPOTENT_CODES = new Set([1050, 1060, 1061, 1062]);

function isIdempotentError(err) {
  if (IDEMPOTENT_CODES.has(err.errno)) return true;
  // Fallback: check message text for cases where errno isn't populated
  const msg = err.message || '';
  return (
    msg.includes('Duplicate column name') ||
    msg.includes('already exists') ||
    msg.includes('Duplicate key name') ||
    msg.includes('Duplicate entry')
  );
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    multipleStatements: true,
  });

  console.log(`\nRunning ${MIGRATIONS.length} migrations against ${process.env.MYSQL_DATABASE}@${process.env.MYSQL_HOST}\n`);
  if (STOP_ON_ERROR) console.log('Mode: stop on first error\n');
  else console.log('Mode: continue on error (use --stop-on-error to change)\n');

  const results = { passed: 0, failed: 0, skipped: 0 };
  const migrationsDir = path.join(__dirname, '..', 'migrations');

  for (const [i, file] of MIGRATIONS.entries()) {
    const label = `[${String(i + 1).padStart(2, '0')}/${MIGRATIONS.length}] ${file}`;
    const filePath = path.join(migrationsDir, file);

    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  SKIP   ${label} (file not found)`);
      results.skipped++;
      continue;
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const sql = preprocessSql(raw);
      await connection.query(sql);
      console.log(`✅ OK     ${label}`);
      results.passed++;
    } catch (err) {
      if (isIdempotentError(err)) {
        console.log(`⚠️  SKIP   ${label} (already applied: ${err.message})`);
        results.skipped++;
      } else {
        console.error(`❌ FAIL   ${label}`);
        console.error(`         ${err.message}`);
        results.failed++;
        if (STOP_ON_ERROR) break;
      }
    }
  }

  await connection.end();

  console.log(`\n── Summary ──────────────────────────────`);
  console.log(`   Passed:  ${results.passed}`);
  console.log(`   Failed:  ${results.failed}`);
  console.log(`   Skipped: ${results.skipped}`);
  console.log(`─────────────────────────────────────────\n`);

  if (results.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
