#!/usr/bin/env node

// ----------------------------------------------
// close-expired-surveys.js
// Called by a nightly cron (or Vercel Cron, GitHub Action, etc.) to
// automatically mark surveys whose `end_at` is in the past as `closed`.
// ----------------------------------------------

const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/surveys/cron/close-expired',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
};

console.log('🔄 Running survey expiration check...');

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      if (response.status) {
        console.log(`✅ Auto-close complete – ${response.closedCount} survey(s) closed.`);
      } else {
        console.error('❌ Failed to auto-close expired surveys:', response.message);
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