#!/usr/bin/env node
/**
 * Check if production server matches GitHub main branch
 * This script checks GitHub Actions to see what commit was last deployed
 */

const https = require('https');
const { execSync } = require('child_process');

// Get repo info from git
const repoUrl = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
// Handle both https://github.com/owner/repo and git@github.com:owner/repo.git formats
const match = repoUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
if (!match) {
  console.error('❌ Could not determine GitHub repo from git remote');
  console.error(`   Remote URL: ${repoUrl}`);
  process.exit(1);
}

const [owner, repo] = match[1].split('/');
console.log(`📦 Repository: ${owner}/${repo}`);

// Get expected commit from GitHub main
const expectedCommit = execSync('git rev-parse origin/main', { encoding: 'utf-8' }).trim();
const expectedCommitShort = execSync('git rev-parse --short origin/main', { encoding: 'utf-8' }).trim();
const expectedMessage = execSync('git log -1 --pretty=format:"%s" origin/main', { encoding: 'utf-8' }).trim();

console.log(`\n✅ Expected on server (GitHub main):`);
console.log(`   SHA: ${expectedCommit}`);
console.log(`   Short: ${expectedCommitShort}`);
console.log(`   Message: ${expectedMessage}`);

// Try to get GitHub Actions workflow runs
const githubToken = process.env.GITHUB_TOKEN;
if (!githubToken) {
  console.log(`\n⚠️  GITHUB_TOKEN not set. Cannot check GitHub Actions deployment history.`);
  console.log(`\nTo check manually:`);
  console.log(`1. Visit: https://github.com/${owner}/${repo}/actions`);
  console.log(`2. Look for the latest "Deploy to Digital Ocean" workflow run`);
  console.log(`3. Check the commit SHA in the workflow logs`);
  console.log(`\nOr SSH into your server and run:`);
  console.log(`   ssh root@YOUR_DROPLET_IP "cd /root/marketmaker && git rev-parse HEAD"`);
  process.exit(0);
}

// Fetch latest workflow run
const options = {
  hostname: 'api.github.com',
  path: `/repos/${owner}/${repo}/actions/workflows/deploy.yml/runs?per_page=1`,
  headers: {
    'User-Agent': 'deployment-checker',
    'Authorization': `token ${githubToken}`,
    'Accept': 'application/vnd.github.v3+json'
  }
};

console.log(`\n🔍 Checking GitHub Actions deployment history...`);

https.get(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.error(`❌ GitHub API error: ${res.statusCode}`);
      console.error(data);
      process.exit(1);
    }
    
    const response = JSON.parse(data);
    if (!response.workflow_runs || response.workflow_runs.length === 0) {
      console.log(`⚠️  No workflow runs found`);
      process.exit(0);
    }
    
    const latestRun = response.workflow_runs[0];
    const deployedCommit = latestRun.head_sha;
    const deployedCommitShort = deployedCommit.substring(0, 7);
    const status = latestRun.status;
    const conclusion = latestRun.conclusion;
    const createdAt = new Date(latestRun.created_at).toLocaleString();
    
    console.log(`\n📋 Latest deployment:`);
    console.log(`   SHA: ${deployedCommit}`);
    console.log(`   Short: ${deployedCommitShort}`);
    console.log(`   Status: ${status}`);
    console.log(`   Conclusion: ${conclusion || 'pending'}`);
    console.log(`   Created: ${createdAt}`);
    
    console.log(`\n🔍 Comparison:`);
    if (deployedCommit === expectedCommit) {
      console.log(`✅ Latest deployment matches GitHub main`);
      console.log(`   The server SHOULD be running commit ${deployedCommitShort}`);
    } else {
      console.log(`⚠️  Latest deployment does NOT match GitHub main`);
      console.log(`   Deployed: ${deployedCommitShort}`);
      console.log(`   Expected: ${expectedCommitShort}`);
      
      // Check if deployed is ahead or behind
      try {
        const ahead = execSync(`git rev-list --count ${deployedCommit}..${expectedCommit}`, { encoding: 'utf-8' }).trim();
        const behind = execSync(`git rev-list --count ${expectedCommit}..${deployedCommit}`, { encoding: 'utf-8' }).trim();
        
        if (parseInt(ahead) > 0) {
          console.log(`   ⬆️  GitHub main is ${ahead} commits ahead of last deployment`);
        }
        if (parseInt(behind) > 0) {
          console.log(`   ⬇️  Last deployment is ${behind} commits ahead of GitHub main`);
        }
      } catch (e) {
        // Commits might not be in same branch
      }
    }
    
    console.log(`\n💡 To verify what's actually running on the server:`);
    console.log(`   ssh root@YOUR_DROPLET_IP "cd /root/marketmaker && git rev-parse HEAD"`);
  });
}).on('error', (err) => {
  console.error(`❌ Error: ${err.message}`);
  process.exit(1);
});

