#!/usr/bin/env node

const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000, // Adjust if your app runs on a different port
  path: '/api/scheduler/init',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
};

console.log('🚀 Initializing daily bet analysis scheduler...');

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      if (response.success) {
        console.log('✅ Scheduler initialized successfully!');
        console.log('📅 Daily analysis will run at 2:00 AM (America/New_York) every day');
      } else {
        console.error('❌ Failed to initialize scheduler:', response.message);
      }
    } catch (error) {
      console.error('❌ Error parsing response:', error);
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Error making request:', error.message);
  console.log('💡 Make sure your Next.js app is running on http://localhost:3000');
});

req.end(); 