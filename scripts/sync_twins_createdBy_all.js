const mysql = require('mysql2/promise');
const { Pinecone } = require('@pinecone-database/pinecone');
require('dotenv').config({ path: '.env 2' });

(async () => {
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  const index = pc.index('prediction-results');

  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  // Fetch all agent tokens + owner
  const [rows] = await db.query(`
    SELECT s.created_by AS user_id, ra.agent_token
    FROM responder_agents ra
    JOIN survey_responses sr ON ra.created_from_response_id = sr.id
    JOIN surveys s ON sr.survey_id = s.id
  `);
  await db.end();

  // Group tokens by user
  const map = new Map();
  rows.forEach(r => {
    if (!map.has(r.user_id)) map.set(r.user_id, []);
    map.get(r.user_id).push(r.agent_token);
  });

  let totalUpdated = 0, totalMissing = 0;

  for (const [userId, tokens] of map.entries()) {
    console.log(`\nUser ${userId} -> tokens ${tokens.length}`);
    let updated = 0, missing = 0;

    const BATCH = 200;
    for (let i = 0; i < tokens.length; i += BATCH) {
      const batchTokens = tokens.slice(i, i + BATCH);
      const batchIds = batchTokens.map(t => `digital-twin-${t}`);
      const fetched = await index.fetch(batchIds, { includeValues: true });

      for (const id of batchIds) {
        const rec = fetched.records[id];
        if (!rec) { missing++; continue; }
        const meta = rec.metadata || {};
        if (meta.createdBy === String(userId)) continue; // good
        const newMeta = { ...meta, createdBy: String(userId) };
        await index.upsert([{ id, values: rec.values, metadata: newMeta }]);
        updated++;
      }
    }

    console.log(`User ${userId} summary -> updated ${updated}, missing ${missing}`);
    totalUpdated += updated;
    totalMissing += missing;
  }

  console.log(`\nGLOBAL SUMMARY: updated ${totalUpdated}, missing vectors ${totalMissing}`);
})(); 