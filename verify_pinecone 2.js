const { Pinecone } = require('@pinecone-database/pinecone');

async function verifyPinecone() {
  try {
    const pinecone = new Pinecone({
      apiKey: 'pcsk_3KDfm_SHcxsjyxiDueis9j66qYdns6X3QAtj5Km8a31QLxcmYgwXN9iq2XhYWaJpWebgE',
    });

    const index = pinecone.index('prediction-results');
    
    // Try to fetch the specific digital twin directly
    console.log('🔍 Fetching specific digital twin: agent_10_1749845979208');
    const fetchResult = await index.fetch(['digital-twin-agent_10_1749845979208']);
    
    if (fetchResult.records['digital-twin-agent_10_1749845979208']) {
      console.log('✅ Found digital twin in Pinecone via direct fetch');
      const record = fetchResult.records['digital-twin-agent_10_1749845979208'];
      console.log('Metadata:', record.metadata);
    } else {
      console.log('❌ Digital twin not found via direct fetch');
    }

    // Also try the query method with a higher topK
    console.log('\n🔍 Querying all digital twins with higher limit...');
    const zeroVector = new Array(1536).fill(0);
    const searchResults = await index.query({
      vector: zeroVector,
      topK: 200, // Increased limit
      includeMetadata: true,
      filter: { type: { $eq: 'digital-twin' } }
    });

    console.log(`Found ${searchResults.matches?.length || 0} digital twins via query`);
    
    const targetTwin = searchResults.matches?.find(match => 
      match.metadata?.agentId === 'agent_10_1749845979208'
    );
    
    if (targetTwin) {
      console.log('✅ Found target digital twin via query');
      console.log('Agent ID:', targetTwin.metadata?.agentId);
      console.log('Email:', targetTwin.metadata?.email);
    } else {
      console.log('❌ Target digital twin not found via query');
    }

    // List all agent IDs for debugging
    console.log('\n📋 All digital twin agent IDs in Pinecone:');
    searchResults.matches?.forEach((match, index) => {
      console.log(`${index + 1}. ${match.metadata?.agentId} (${match.metadata?.email})`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

verifyPinecone(); 