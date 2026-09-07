const mysql = require('mysql2/promise');
const { Pinecone } = require('@pinecone-database/pinecone');
require('dotenv').config({ path: '.env 2' });

(async () => {
  const USER_ID = '1592'; // owner id
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  const index = pc.index('prediction-results');

  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  // Get all agent tokens for surveys created by this user
  const [rows] = await db.query(`
    SELECT ra.agent_token
    FROM responder_agents ra
    JOIN survey_responses sr ON ra.created_from_response_id = sr.id
    JOIN surveys s ON sr.survey_id = s.id
    WHERE s.created_by = ?
  `, [USER_ID]);

  await db.end();

  const tokens = rows.map(r => r.agent_token);
  console.log('Total tokens', tokens.length);

  let updated = 0, skipped = 0, missing = 0;

  const BATCH = 200;
  for (let i = 0; i < tokens.length; i += BATCH) {
    const batchTokens = tokens.slice(i, i + BATCH);
    const batchIds = batchTokens.map(t => `digital-twin-${t}`);
    const fetched = await index.fetch(batchIds, { includeValues: true });

    for (const id of batchIds) {
      const rec = fetched.records[id];
      if (!rec) { missing++; continue; }
      const metadata = rec.metadata || {};
      if (metadata.createdBy === USER_ID) { skipped++; continue; }
      // Update metadata
      const newMeta = { ...metadata, createdBy: USER_ID };
      await index.upsert([{ id, values: rec.values, metadata: newMeta }]);
      updated++;
      console.log(`Updated ${id}`);
    }
  }

  console.log(`Summary: updated ${updated}, skipped ${skipped}, missing ${missing}`);
})(); 