#!/usr/bin/env node
const { spawn } = require('child_process');

console.log('🧪 Testing Next.js with minimal config...');

// Create a minimal next.config.mjs
const fs = require('fs');
const backupConfig = fs.readFileSync('next.config.mjs', 'utf8');
const minimalConfig = `/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;`;

fs.writeFileSync('next.config.mjs', minimalConfig);

const proc = spawn('npx', ['next', 'dev', '--port', '3004'], {
  stdio: 'pipe',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
});

let output = '';
let success = false;

proc.stdout.on('data', (data) => {
  const line = data.toString();
  output += line;
  console.log('📤', line.trim());
  
  if (line.includes('Ready in') || line.includes('compiled successfully')) {
    success = true;
    console.log('✅ SUCCESS! Next.js started with minimal config');
    cleanup();
  }
});

proc.stderr.on('data', (data) => {
  const line = data.toString();
  output += line;
  console.log('🚨', line.trim());
});

function cleanup() {
  proc.kill();
  fs.writeFileSync('next.config.mjs', backupConfig);
  process.exit(success ? 0 : 1);
}

setTimeout(() => {
  if (!success) {
    console.log('❌ TIMEOUT: Even minimal config hangs');
    console.log('Last 300 chars:', output.slice(-300));
  }
  cleanup();
}, 15000);

process.on('SIGINT', cleanup);











