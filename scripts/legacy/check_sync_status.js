const mysql = require('mysql2/promise');
const { Pinecone } = require('@pinecone-database/pinecone');

async function checkSyncStatus() {
  try {
    // Connect to database
    const connection = await mysql.createConnection({
      host: 'antelopedb-do-user-18192858-0.j.db.ondigitalocean.com',
      port: 25060,
      user: 'doadmin',
      password: 'AVNS_Zobsi59qAR_OQ9QGwDd',
      database: 'defaultdb',
      ssl: { rejectUnauthorized: false }
    });

    // Get all digital twins from database
    const [agents] = await connection.execute(`
      SELECT ra.id, ra.agent_token, ra.email, ra.created_at,
             sr.survey_id, s.title as survey_title, s.created_by
      FROM responder_agents ra
      LEFT JOIN survey_responses sr ON ra.created_from_response_id = sr.id  
      LEFT JOIN surveys s ON sr.survey_id = s.id
      ORDER BY ra.created_at DESC
    `);

    console.log('=== DATABASE DIGITAL TWINS ===');
    console.log(`Total: ${agents.length}`);
    agents.forEach(agent => {
      console.log(`- ${agent.agent_token} | Email: ${agent.email || 'null'} | Survey: ${agent.survey_title} | Created by: ${agent.created_by}`);
    });

    await connection.end();

    // Check Pinecone
    console.log('\n=== PINECONE DIGITAL TWINS ===');
    const pinecone = new Pinecone({
      apiKey: 'pcsk_3KDfm_SHcxsjyxiDueis9j66qYdns6X3QAtj5Km8a31QLxcmYgwXN9iq2XhYWaJpWebgE',
    });

    const index = pinecone.index('prediction-results');
    const zeroVector = new Array(1536).fill(0);
    const searchResults = await index.query({
      vector: zeroVector,
      topK: 100,
      includeMetadata: true,
      filter: { type: { $eq: 'digital-twin' } }
    });

    console.log(`Total: ${searchResults.matches?.length || 0}`);
    searchResults.matches?.forEach(match => {
      console.log(`- ${match.metadata?.agentId} | Email: ${match.metadata?.email || 'null'} | Survey: ${match.metadata?.surveyTitle}`);
    });

    // Find missing ones
    const dbTokens = new Set(agents.map(a => a.agent_token));
    const pineconeTokens = new Set(searchResults.matches?.map(m => m.metadata?.agentId).filter(Boolean) || []);

    const missingInPinecone = [...dbTokens].filter(token => !pineconeTokens.has(token));
    const extraInPinecone = [...pineconeTokens].filter(token => !dbTokens.has(token));

    console.log('\n=== SYNC STATUS ===');
    console.log(`Database count: ${dbTokens.size}`);
    console.log(`Pinecone count: ${pineconeTokens.size}`);
    console.log(`Missing in Pinecone: ${missingInPinecone.length}`);
    if (missingInPinecone.length > 0) {
      console.log(`Missing tokens: ${missingInPinecone.join(', ')}`);
    }
    console.log(`Extra in Pinecone: ${extraInPinecone.length}`);
    if (extraInPinecone.length > 0) {
      console.log(`Extra tokens: ${extraInPinecone.join(', ')}`);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkSyncStatus(); 