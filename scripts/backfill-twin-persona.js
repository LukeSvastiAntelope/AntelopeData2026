const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Prefer ".env 2" if present per user instruction, else fallback to default .env
const env2Path = path.join(process.cwd(), '.env 2');
if (fs.existsSync(env2Path)) {
  require('dotenv').config({ path: env2Path });
  console.log('🔧 Loaded environment from .env 2');
} else {
  require('dotenv').config();
}

async function fetchAgents(connection, limit = 2000) {
  const lim = Number.isFinite(limit) ? Math.max(1, parseInt(limit, 10)) : 2000;
  const [rows] = await connection.execute(
    `SELECT ra.agent_token, ra.base_profile, ra.persona_profile, ra.capability_map
     FROM responder_agents ra
     ORDER BY ra.created_at DESC
     LIMIT ${lim}`
  );
  return rows;
}

async function fetchAnswers(connection, agentToken) {
  const [rows] = await connection.execute(`
    SELECT sq.prompt AS question_text, sa.answer_value
    FROM survey_responses sr
    JOIN survey_answers sa ON sa.response_id = sr.id
    JOIN survey_questions sq ON sq.id = sa.question_id
    WHERE sr.agent_token = ?
    ORDER BY sr.submitted_at ASC
  `, [agentToken]);
  return rows.map(r => ({ questionText: r.question_text, value: r.answer_value }));
}

async function updatePersona(connection, agentToken, persona, capabilities) {
  await connection.execute(`
    UPDATE responder_agents
    SET persona_profile = ?, capability_map = ?, last_enriched_at = NOW(), persona_version = IFNULL(persona_version, 0) + 1
    WHERE agent_token = ?
  `, [JSON.stringify(persona), JSON.stringify(capabilities), agentToken]);
}

function deriveFromPrinciples(principles, answersCount) {
  const persona = {
    summary: (principles?.worldview || '').toString().slice(0, 600),
    core_traits: principles?.personalityTraits || [],
    communication_style: principles?.communicationStyle || '',
    worldview: principles?.worldview || '',
    interests: principles?.interests || []
  };
  const topics = principles?.coreValues || [];
  const topic_confidence = Object.fromEntries(topics.map(v => [v, 0.7]));
  const capability = {
    topics,
    topic_confidence,
    question_type_proficiency: { text: 0.7, single_choice: 0.6, multiple_choice: 0.6, rating: 0.6, yes_no: 0.6, number: 0.5 },
    coverage_gaps: [],
    freshness_score: 1.0,
    data_sources_count: answersCount
  };
  return { persona, capability };
}

async function main() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || process.env.DB_HOST,
      user: process.env.MYSQL_USER || process.env.DB_USER,
      password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD,
      database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'marketmaker',
      port: process.env.MYSQL_PORT || process.env.DB_PORT || 3306,
      ssl: { rejectUnauthorized: false }
    });

    console.log('✅ Connected to DB');
    const agents = await fetchAgents(connection, 2000);
    console.log(`Found ${agents.length} agents`);

    let updated = 0, skipped = 0;
    for (const agent of agents) {
      if (agent.persona_profile && agent.capability_map) {
        skipped++; continue;
      }

      const base = agent.base_profile && (typeof agent.base_profile === 'string' ? JSON.parse(agent.base_profile) : agent.base_profile) || {};
      const principles = base?.principles || null; // Phase 1 might not store this consistently
      const answers = await fetchAnswers(connection, agent.agent_token);

      let persona, capability;
      if (principles) {
        ({ persona, capability } = deriveFromPrinciples(principles, answers.length));
      } else {
        // Minimal persona from demographics if no principles
        const demo = base?.demographics || {};
        persona = {
          summary: `Profile with${demo.age?` age ${demo.age},`:''}${demo.location?` location ${demo.location},`:''} ${answers.length} answers.`.trim(),
          core_traits: [], communication_style: '', worldview: '', interests: []
        };
        capability = {
          topics: [], topic_confidence: {}, question_type_proficiency: { text: 0.5 }, coverage_gaps: [], freshness_score: 0.5, data_sources_count: answers.length
        };
      }

      await updatePersona(connection, agent.agent_token, persona, capability);
      updated++;
      if (updated % 25 === 0) console.log(`Updated ${updated} agents...`);
    }

    console.log(`Done. Updated: ${updated}, Skipped: ${skipped}`);
  } catch (e) {
    console.error('❌ Backfill failed:', e.message || e);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

if (require.main === module) {
  console.log('🚀 Backfilling twin persona/capabilities...');
  main().then(() => { console.log('✅ Completed'); process.exit(0); });
}

module.exports = { main };


