#!/usr/bin/env node
/**
 * Safe dev server starter with timeout protection and auto-restart
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Next.js dev server with hang protection...\n');

// Clean up any stuck processes first
function killExistingProcesses() {
  return new Promise((resolve) => {
    const killCmd = spawn('pkill', ['-f', 'next dev'], { stdio: 'pipe' });
    killCmd.on('close', () => {
      setTimeout(resolve, 1000); // Wait 1s for cleanup
    });
    killCmd.on('error', resolve); // Continue even if pkill fails
  });
}

// Clean Next.js cache
function cleanCache() {
  const dirs = ['.next', '.turbo'];
  dirs.forEach(dir => {
    const fullPath = path.join(process.cwd(), dir);
    if (fs.existsSync(fullPath)) {
      console.log(`🧹 Cleaning ${dir}...`);
      try {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } catch (e) {
        console.log(`⚠️  Could not clean ${dir}: ${e.message}`);
      }
    }
  });
}

// Start dev server with timeout protection
function startDevServer() {
  return new Promise((resolve, reject) => {
    console.log('⏳ Starting dev server...');
    
    const devServer = spawn('npm', ['run', 'dev'], {
      stdio: 'pipe',
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
        NEXT_DISABLE_TURBOPACK: '1',
        WATCHPACK_POLLING: 'true',
        NODE_OPTIONS: '--max-old-space-size=4096'
      }
    });

    let hasStarted = false;
    let output = '';

    // Capture all output
    devServer.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
      
      // Check if server has successfully started
      if (text.includes('Ready in') || text.includes('compiled successfully')) {
        hasStarted = true;
        console.log('\n✅ Dev server started successfully!');
        resolve(devServer);
      }
    });

    devServer.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stderr.write(text);
    });

    // Timeout protection - kill if it hangs
    const timeout = setTimeout(() => {
      if (!hasStarted) {
        console.log('\n❌ Dev server startup timed out after 30 seconds');
        console.log('📊 Last output:');
        console.log(output.slice(-500));
        devServer.kill('SIGKILL');
        reject(new Error('Server startup timeout'));
      }
    }, 30000);

    devServer.on('close', (code) => {
      clearTimeout(timeout);
      if (!hasStarted) {
        console.log(`\n❌ Dev server exited with code ${code} before starting`);
        reject(new Error(`Server exited with code ${code}`));
      }
    });

    devServer.on('error', (error) => {
      clearTimeout(timeout);
      console.log(`\n❌ Dev server error: ${error.message}`);
      reject(error);
    });
  });
}

// Main execution
async function main() {
  try {
    // Step 1: Clean up
    await killExistingProcesses();
    cleanCache();
    
    // Step 2: Start server
    const devServer = await startDevServer();
    
    // Step 3: Keep alive and handle signals
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down dev server...');
      devServer.kill('SIGTERM');
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      devServer.kill('SIGTERM');
      process.exit(0);
    });
    
  } catch (error) {
    console.log('\n💥 Failed to start dev server:');
    console.log(error.message);
    
    console.log('\n🔄 Attempting automatic restart in 3 seconds...');
    setTimeout(() => {
      main(); // Recursive restart
    }, 3000);
  }
}

main();











