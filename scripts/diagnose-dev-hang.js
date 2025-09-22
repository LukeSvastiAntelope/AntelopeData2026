#!/usr/bin/env node
/**
 * Diagnostic script to identify where Next.js dev server hangs during startup
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config();

console.log('🔍 Diagnosing Next.js dev server hang...\n');

// Test 1: Check environment and dependencies
console.log('1️⃣ Environment Check');
console.log('Node version:', process.version);
console.log('Platform:', process.platform);
console.log('Architecture:', process.arch);
console.log('Working directory:', process.cwd());
console.log('');

// Test 2: Check critical files exist
console.log('2️⃣ Critical Files Check');
const criticalFiles = [
  'package.json',
  'next.config.mjs',
  'tsconfig.json',
  '.env',
  'src/app/layout.tsx',
  'src/app/page.tsx'
];

criticalFiles.forEach(file => {
  const exists = fs.existsSync(file);
  console.log(`${exists ? '✅' : '❌'} ${file}`);
});
console.log('');

// Test 3: Check for problematic large files/directories
console.log('3️⃣ Large Files/Directories Check');
const checkDirs = ['.next', '.turbo', 'node_modules', 'public'];
checkDirs.forEach(dir => {
  try {
    if (fs.existsSync(dir)) {
      const stats = fs.statSync(dir);
      if (stats.isDirectory()) {
        const files = fs.readdirSync(dir);
        console.log(`📁 ${dir}: ${files.length} items`);
      }
    } else {
      console.log(`📁 ${dir}: not found`);
    }
  } catch (e) {
    console.log(`📁 ${dir}: error - ${e.message}`);
  }
});
console.log('');

// Test 4: Check database connection (common hang point)
console.log('4️⃣ Database Connection Test');
async function testDB() {
  try {
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({
      host: process.env.MYSQL_HOST || process.env.DB_HOST,
      user: process.env.MYSQL_USER || process.env.DB_USER,
      password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD,
      database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'marketmaker',
      port: process.env.MYSQL_PORT || process.env.DB_PORT || 3306,
      ssl: { rejectUnauthorized: false },
      connectTimeout: 5000
    });
    console.log('✅ Database connection successful');
    await conn.end();
  } catch (e) {
    console.log('❌ Database connection failed:', e.message);
  }
}

// Test 5: Test TypeScript compilation
console.log('5️⃣ TypeScript Check');
async function testTS() {
  return new Promise((resolve) => {
    const tsc = spawn('npx', ['tsc', '--noEmit', '--skipLibCheck'], { 
      stdio: 'pipe',
      timeout: 10000  // Shorten to 10s
    });
    
    let output = '';
    tsc.stdout.on('data', (data) => output += data.toString());
    tsc.stderr.on('data', (data) => output += data.toString());
    
    tsc.on('close', (code) => {
      if (code === 0) {
        console.log('✅ TypeScript compilation successful');
      } else {
        console.log('❌ TypeScript errors found:');
        console.log(output.slice(0, 500));
      }
      resolve();
    });
    
    tsc.on('error', (e) => {
      console.log('❌ TypeScript check failed:', e.message);
      resolve();
    });
    
    setTimeout(() => {
      tsc.kill();
      console.log('⏱️ TypeScript check timed out');
      resolve();
    }, 10000);  // Shorten to 10s
  });
}

// Test 6: Test Next.js build (dry run)
console.log('6️⃣ Next.js Build Test');
async function testBuild() {
  return new Promise((resolve) => {
    const build = spawn('npx', ['next', 'build', '--dry-run'], { 
      stdio: 'pipe',
      timeout: 10000,  // Shorten to 10s
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
    });
    
    let output = '';
    build.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log('📝', text.trim());
    });
    
    build.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log('🔴', text.trim());
    });
    
    build.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Next.js build test successful');
      } else {
        console.log('❌ Next.js build test failed with code:', code);
      }
      resolve();
    });
    
    build.on('error', (e) => {
      console.log('❌ Next.js build test error:', e.message);
      resolve();
    });
    
    setTimeout(() => {
      build.kill();
      console.log('⏱️ Next.js build test timed out');
      resolve();
    }, 10000);  // Shorten to 10s
  });
}

// Test 7: Test minimal dev server startup
console.log('7️⃣ Minimal Dev Server Test');
async function testDevStartup() {
  return new Promise((resolve) => {
    console.log('Starting Next.js dev server with verbose logging...');
    
    const dev = spawn('npx', ['next', 'dev', '--port', '3001'], { 
      stdio: 'pipe',
      env: { 
        ...process.env, 
        DEBUG: 'next:*',
        NEXT_TELEMETRY_DISABLED: '1',
        NEXT_DISABLE_TURBOPACK: '1'
      }
    });
    
    let startupComplete = false;
    let lastOutput = Date.now();
    
    dev.stdout.on('data', (data) => {
      const text = data.toString();
      console.log('📤', text.trim());
      lastOutput = Date.now();
      
      if (text.includes('Ready in') || text.includes('✓ Ready')) {
        startupComplete = true;
        console.log('✅ Dev server started successfully!');
        dev.kill();
        resolve();
      }
    });
    
    dev.stderr.on('data', (data) => {
      const text = data.toString();
      console.log('🔴', text.trim());
      lastOutput = Date.now();
    });
    
    dev.on('close', (code) => {
      if (!startupComplete) {
        console.log('❌ Dev server exited with code:', code);
      }
      resolve();
    });
    
    dev.on('error', (e) => {
      console.log('❌ Dev server error:', e.message);
      resolve();
    });
    
    // Monitor for hangs
    const hangChecker = setInterval(() => {
      const timeSinceOutput = Date.now() - lastOutput;
      if (timeSinceOutput > 10000) {  // Shorten to 10s
        console.log('⏱️ Dev server appears to be hanging (no output for 10s)');
        console.log('💀 Killing hung process...');
        dev.kill('SIGKILL');
        clearInterval(hangChecker);
        resolve();
      }
    }, 2000);  // Check every 2s
    
    setTimeout(() => {
      if (!startupComplete) {
        console.log('⏱️ Dev server startup timed out after 30 seconds');
        dev.kill('SIGKILL');
      }
      clearInterval(hangChecker);
      resolve();
    }, 30000);  // Overall timeout 30s
  });
}

// Run all tests
async function runDiagnostics() {
  await testDB();
  console.log('');
  
  await testTS();
  console.log('');
  
  await testBuild();
  console.log('');
  
  await testDevStartup();
  console.log('');
  
  console.log('🏁 Diagnostics complete!');
  console.log('');
  console.log('📋 Summary:');
  console.log('- If database connection failed: Check your .env file and database server');
  console.log('- If TypeScript errors: Fix compilation issues first');
  console.log('- If build failed: Check for import/export errors');
  console.log('- If dev server hung: Look at the last output before hanging');
  console.log('');
  console.log('💡 Common fixes:');
  console.log('- Delete node_modules and reinstall: rm -rf node_modules package-lock.json && npm install');
  console.log('- Clear Next.js cache: rm -rf .next .turbo');
  console.log('- Disable Turbopack: NEXT_DISABLE_TURBOPACK=1 npm run dev');
  console.log('- Use polling: WATCHPACK_POLLING=true npm run dev');
}

runDiagnostics().catch(console.error);
