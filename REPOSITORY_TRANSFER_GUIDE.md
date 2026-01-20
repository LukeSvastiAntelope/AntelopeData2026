# Repository Transfer Guide: Moving to antelopehq Organization

This guide provides step-by-step instructions for transferring the `marketmaker` repository from the `firstprinciplecode` organization to the `antelopehq` organization.

## Prerequisites

Before starting the transfer:
1. You must be an owner of both the source (`firstprinciplecode`) and destination (`antelopehq`) organizations
2. The `antelopehq` organization must not already have a repository named `marketmaker`
3. Ensure all team members are aware of the transfer to avoid confusion

## Transfer Process

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
   - Navigate to your deployment directory (default: `/home/appuser/marketmaker`)
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

## Rollback (If Needed)

If you need to transfer back:
1. Follow the same process but transfer from `antelopehq` back to `firstprinciplecode`
2. Update all remotes again

## Important Notes

- **GitHub will automatically redirect**: GitHub automatically redirects requests from the old repository URL to the new one, so old links will continue to work
- **Clones and forks**: Existing clones will continue to work temporarily due to redirects, but it's best to update remotes
- **Stars and watches**: Are preserved during the transfer
- **Issues and PRs**: All issues and pull requests are transferred
- **Actions history**: GitHub Actions history is preserved
- **Releases**: All releases are transferred

## No Code Changes Required

✅ **Good news**: The codebase does not contain any hardcoded references to the `firstprinciplecode` organization, so no code changes are needed!

The GitHub Actions workflow (`.github/workflows/deploy.yml`) uses relative paths and repository secrets, which will work automatically after the transfer.

## Questions or Issues?

If you encounter any issues during the transfer:
1. Ensure you have owner permissions on both organizations
2. Check GitHub's status page: https://www.githubstatus.com/
3. Contact GitHub Support: https://support.github.com/

---

**Transfer completed on**: _(Fill in date when completed)_  
**Transferred by**: _(Fill in username)_  
**Verified by**: _(Fill in username)_
