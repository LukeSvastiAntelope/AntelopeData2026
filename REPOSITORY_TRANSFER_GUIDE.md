# Repository Transfer Guide: Moving to antelopehq Organization

This guide provides step-by-step instructions for moving the `marketmaker` repository from the `firstprinciplecode` organization to the `antelopehq` organization.

## Two Approaches

### ⚠️ Approach 1: Copy/Duplicate (Recommended - Safer)
**Pros**: Keeps original repository intact, allows working on both simultaneously  
**Cons**: Creates two independent repositories, need to manually sync if needed  
**Use when**: You want to keep the original repository active while setting up the new one

### ⚡ Approach 2: Transfer (Moves Repository)
**Pros**: Clean migration, automatic redirects, preserves all settings  
**Cons**: Original repository is moved (not copied), original location becomes unavailable  
**Use when**: You want a complete migration and won't need the original repository

---

## Approach 1: Copy/Duplicate Repository (Safer Method)

This method creates a complete copy in the new organization while keeping the original intact.

### Prerequisites

1. You must have admin access to the `antelopehq` organization
2. You need a local copy or access to clone the repository

### Step 1: Create New Repository on GitHub

1. Navigate to: https://github.com/organizations/antelopehq/repositories/new
2. Set repository name: `marketmaker`
3. Choose visibility: **Private** (or match original settings)
4. **Do NOT** initialize with README, .gitignore, or license (we'll push existing code)
5. Click **Create repository**
6. Note the new repository URL: `https://github.com/antelopehq/marketmaker.git`

### Step 2: Clone and Push (Mirror Method)

**Note**: For private repositories, you'll need to authenticate. GitHub will prompt for credentials when using HTTPS, or you can use SSH URLs if you have SSH keys configured (e.g., `git@github.com:firstprinciplecode/marketmaker.git`).

```bash
# Clone the original repository as a bare repository (includes all branches and tags)
git clone --bare https://github.com/firstprinciplecode/marketmaker.git
cd marketmaker.git

# Push everything to the new repository (mirror push)
# You'll be prompted for authentication if needed
git push --mirror https://github.com/antelopehq/marketmaker.git

# Clean up the temporary bare repository
cd ..
rm -rf marketmaker.git
```

**Alternative using SSH** (if you have SSH keys set up):
```bash
git clone --bare git@github.com:firstprinciplecode/marketmaker.git
cd marketmaker.git
git push --mirror git@github.com:antelopehq/marketmaker.git
cd ..
rm -rf marketmaker.git
```

### Step 3: Clone the New Repository

```bash
# Clone your new repository
git clone https://github.com/antelopehq/marketmaker.git
cd marketmaker

# Verify all branches are present
git branch -a

# Verify all tags are present
git tag
```

### Step 4: Configure GitHub Repository Settings

1. Navigate to: https://github.com/antelopehq/marketmaker/settings
2. Configure the following:
   - **General**: Set description, website, topics
   - **Collaborators**: Add team members with appropriate permissions
   - **Branches**: Set default branch and branch protection rules
   - **Secrets and variables**: Add all required secrets (see list below)

### Step 5: Set Up GitHub Actions Secrets

Go to **Settings** → **Secrets and variables** → **Actions** and add all required secrets:

- `JWT_SECRET`
- `JWT_SECRET_KEY`
- `OPENAI_API_KEY`
- `DEEPSEEK_API_KEY`
- `GEMINI_API_KEY`
- `SERPAPI_API_KEY`
- `PINECONE_API_KEY`
- `COINMARKETCAP_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_CHANNEL_ID`
- `ESCROW_SOLANA_ADDRESS`
- `ESCROW_SOLANA_PRIVATE`
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLIC_KEY`
- `STRIPE_SECRET_WEBHOOK_KEY`
- `SPORTS_DB_API_KEY`
- `PINATA_KEY`
- `PINATA_SECRET`
- `PINATA_JWT`
- `PINATA_GATEWAY`
- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`
- `AUTH_SECRET`
- `AUTH_DISCORD_ID`
- `AUTH_DISCORD_SECRET`
- `DROPLET_HOST`
- `DROPLET_USERNAME`
- `DROPLET_SSH_KEY`
- `PUBLIC_BASE_URL`
- `NEXT_PUBLIC_APP_URL`
- `SECURE_STORAGE_KEY`
- `TELEGRAM_WEBHOOK_SECRET`

### Step 6: Test GitHub Actions

1. Push a small test commit or manually trigger a workflow
2. Verify workflows run successfully
3. Check that all environment variables and secrets are working

### Step 7: Update Deployment Configuration

**For a new deployment environment**:
- Set up a new droplet/server for the antelopehq version
- Configure it following your deployment process
- Update DNS/domains as needed

**To switch existing deployment**:
- SSH into your deployment server
- Navigate to deployment directory: `cd /home/appuser/marketmaker` (adapt to your path)
- Update git remote: `git remote set-url origin https://github.com/antelopehq/marketmaker.git`
- Verify: `git remote -v`
- Pull latest: `git pull`

### Benefits of This Approach

✅ Original repository remains untouched and fully functional  
✅ Can work on both repositories simultaneously  
✅ Can test the new repository before switching  
✅ Easy to keep both in sync if needed  
✅ No risk of losing access to the original  

---

## Approach 2: Transfer Repository (Original Method)

This method moves the repository from one organization to another. **Warning**: The original repository will be moved.

### Prerequisites

Before starting the transfer:
1. You must be an owner of both the source (`firstprinciplecode`) and destination (`antelopehq`) organizations
2. The `antelopehq` organization must not already have a repository named `marketmaker`
3. Ensure all team members are aware of the transfer to avoid confusion

### Transfer Process

### Step 1: Transfer the Repository on GitHub

1. Navigate to the repository: https://github.com/firstprinciplecode/marketmaker
2. Click on **Settings** (repository settings, not organization settings)
3. Scroll down to the **Danger Zone** section at the bottom
4. Click **Transfer** button
5. In the transfer dialog:
   - Enter the new owner: `antelopehq`
   - Confirm the repository name: `marketmaker`
   - Type the confirmation text as requested
   - Click **I understand, transfer this repository**
6. Wait for the transfer to complete (usually instant)

### Step 2: Update Local Git Remotes

After the transfer is complete, all team members need to update their local repository remotes:

```bash
# Navigate to your local repository
cd /path/to/marketmaker

# Update the remote URL
git remote set-url origin https://github.com/antelopehq/marketmaker.git

# Verify the change
git remote -v
```

You should see:
```
origin  https://github.com/antelopehq/marketmaker.git (fetch)
origin  https://github.com/antelopehq/marketmaker.git (push)
```

### Step 3: Verify GitHub Actions and Secrets

1. Navigate to the new repository: https://github.com/antelopehq/marketmaker
2. Go to **Settings** → **Secrets and variables** → **Actions**
3. Verify all required secrets are present (both JWT secrets are used by the application):
   - `JWT_SECRET`
   - `JWT_SECRET_KEY`
   - `OPENAI_API_KEY`
   - `DEEPSEEK_API_KEY`
   - `GEMINI_API_KEY`
   - `SERPAPI_API_KEY`
   - `PINECONE_API_KEY`
   - `COINMARKETCAP_API_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_BOT_USERNAME`
   - `TELEGRAM_CHANNEL_ID`
   - `ESCROW_SOLANA_ADDRESS`
   - `ESCROW_SOLANA_PRIVATE`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PUBLIC_KEY`
   - `STRIPE_SECRET_WEBHOOK_KEY`
   - `SPORTS_DB_API_KEY`
   - `PINATA_KEY`
   - `PINATA_SECRET`
   - `PINATA_JWT`
   - `PINATA_GATEWAY`
   - `MYSQL_HOST`
   - `MYSQL_PORT`
   - `MYSQL_USER`
   - `MYSQL_PASSWORD`
   - `MYSQL_DATABASE`
   - `AUTH_SECRET`
   - `AUTH_DISCORD_ID`
   - `AUTH_DISCORD_SECRET`
   - `DROPLET_HOST`
   - `DROPLET_USERNAME`
   - `DROPLET_SSH_KEY`
   - `PUBLIC_BASE_URL`
   - `NEXT_PUBLIC_APP_URL`
   - `SECURE_STORAGE_KEY`
   - `TELEGRAM_WEBHOOK_SECRET`

   **Note**: Secrets should transfer automatically, but it's good to verify.

### Step 4: Update External Integrations

Update any external services that reference the repository URL:

1. **Digital Ocean Deployment**: 
   - SSH into your droplet
   - Navigate to your deployment directory (default: `/home/appuser/marketmaker` - adapt this to your actual deployment path)
   - Update git remote: `git remote set-url origin https://github.com/antelopehq/marketmaker.git`
   - Verify: `git remote -v`

2. **Webhooks**: Check and update any webhooks that might have the old URL

3. **CI/CD Services**: Verify GitHub Actions continue to work

4. **Documentation**: Update any external documentation referencing the old repository URL

### Step 5: Update Team Access

1. Navigate to: https://github.com/antelopehq/marketmaker/settings/access
2. Verify all team members have appropriate access levels
3. Add any missing collaborators

### Step 6: Notify Stakeholders

Inform all team members and stakeholders about:
- The new repository URL: `https://github.com/antelopehq/marketmaker`
- The need to update their local git remotes
- Any changes to access or permissions

## Post-Transfer Verification

After completing the transfer, verify:

- [ ] Repository is accessible at https://github.com/antelopehq/marketmaker
- [ ] All branches are present
- [ ] All tags are present
- [ ] GitHub Actions workflows run successfully
- [ ] Issues and pull requests are preserved
- [ ] All secrets and variables are configured
- [ ] Local git remotes are updated
- [ ] Deployment server git remote is updated
- [ ] External webhooks are updated

## Post-Migration Verification

After completing either approach, verify:

- [ ] Repository is accessible at https://github.com/antelopehq/marketmaker
- [ ] All branches are present
- [ ] All tags are present
- [ ] GitHub Actions workflows run successfully
- [ ] Issues and pull requests are present (if transferred)
- [ ] All secrets and variables are configured
- [ ] Local git remotes are updated (if applicable)
- [ ] Deployment server git remote is updated (if applicable)
- [ ] External webhooks are updated (if applicable)

## Approach-Specific Notes

### For Approach 1 (Copy/Duplicate):
- **Both repositories exist**: You now have two independent repositories
- **No automatic redirects**: Links to the original repository will still point there
- **Syncing**: If you make changes to one, they won't automatically sync to the other
- **Original repository**: Remains fully functional at https://github.com/firstprinciplecode/marketmaker

### For Approach 2 (Transfer):
- **GitHub will automatically redirect**: GitHub automatically redirects requests from the old repository URL to the new one, so old links will continue to work
- **Clones and forks**: Existing clones will continue to work temporarily due to redirects, but it's best to update remotes
- **Stars and watches**: Are preserved during the transfer
- **Issues and PRs**: All issues and pull requests are transferred
- **Actions history**: GitHub Actions history is preserved
- **Releases**: All releases are transferred

## Rollback Options

### For Approach 1 (Copy):
Simply delete the new repository if it's not working as expected. The original remains untouched.

### For Approach 2 (Transfer):
If you need to transfer back:
1. Follow the same transfer process but transfer from `antelopehq` back to `firstprinciplecode`
2. Update all remotes again

## No Code Changes Required

✅ **Good news**: The codebase does not contain any hardcoded references to the `firstprinciplecode` organization, so no code changes are needed!

The GitHub Actions workflow (`.github/workflows/deploy.yml`) uses relative paths and repository secrets, which will work automatically in the new repository regardless of which approach you use.

## Questions or Issues?

If you encounter any issues:
1. Ensure you have appropriate permissions on the destination organization
2. Check GitHub's status page: https://www.githubstatus.com/
3. Contact GitHub Support: https://support.github.com/

---

**Migration completed on**: _(e.g., 2026-01-20)_  
**Approach used**: _(Copy/Duplicate or Transfer)_  
**Performed by**: _(e.g., @username)_  
**Verified by**: _(e.g., @username)_
