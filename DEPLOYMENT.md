# Deployment Guide - Railway

Complete guide to deploy the Career Intelligence Pipeline to Railway.

## Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **Railway CLI**: Install globally
   ```bash
   npm install -g @railway/cli
   ```
3. **GitHub Account**: For connecting repository
4. **Database Credentials**: Supabase or Postgres connection details
5. **OpenAI API Key**: From [platform.openai.com](https://platform.openai.com)

## Step-by-Step Deployment

### 1. Prepare the Project

```bash
cd "C:\Users\Jeff\Desktop\jobs - Copy (2)\nodejs-version"

# Install dependencies to verify setup
npm install

# Build to verify no TypeScript errors
npm run build

# Test locally (optional)
cp .env.example .env
# Edit .env with your credentials
npm run dev
```

### 2. Initialize Git Repository

```bash
# Initialize git if not already done
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Node.js version for Railway"
```

### 3. Create GitHub Repository

```bash
# Create repo on GitHub (via web or gh CLI)
gh repo create career-intelligence-pipeline --private --source=. --remote=origin

# Or manually:
# 1. Go to github.com/new
# 2. Create "career-intelligence-pipeline" repo
# 3. Follow instructions to push existing repository

git push -u origin main
```

### 4. Deploy to Railway (CLI Method)

```bash
# Login to Railway
railway login

# Initialize new project
railway init
# When prompted:
#   - Project name: career-intelligence-pipeline
#   - Environment: production

# Link to GitHub (optional but recommended for auto-deploys)
railway link

# Set environment variables
railway variables set SUPABASE_DB_HOST=db.yourproject.supabase.co
railway variables set SUPABASE_DB_PORT=5432
railway variables set SUPABASE_DB_NAME=postgres
railway variables set SUPABASE_DB_USER=postgres
railway variables set SUPABASE_DB_PASSWORD=your-actual-password-here
railway variables set OPENAI_API_KEY=sk-your-actual-key-here
railway variables set NODE_ENV=production
railway variables set PORT=5000
railway variables set ADMIN_TOKEN=your-secure-admin-token-here

# Deploy
railway up

# The deployment URL will be shown, e.g.:
# https://career-intelligence-pipeline-production.up.railway.app
```

### 5. Run Database Setup

```bash
# After deployment, run one-time setup commands

# Initialize database schema
railway run npm run db:setup

# Install AI prompt templates
railway run npm run db:prompts

# You should see success messages
```

### 6. Import O*NET Data

```bash
# Option A: Upload CSV to project first, then import
railway run npm run onet:import -- --csv=./data/All_Occupations.csv --enqueue=all

# Option B: Import from URL if hosted
railway run npm run onet:import -- --csv=https://your-url/All_Occupations.csv --enqueue=all
```

### 7. Start AI Worker (Optional - Separate Service)

If you want a dedicated worker process:

```bash
# In Railway dashboard:
# 1. Click "New" > "Empty Service"
# 2. Name it "ai-worker"
# 3. Link to same GitHub repo
# 4. In Settings > Deploy:
#    - Build Command: npm install && npm run build
#    - Start Command: npm run worker:ai -- --max=1000 --sleep=10
# 5. Copy all environment variables from main service
```

## Alternative: Deploy via Railway Dashboard

### 1. Push to GitHub

```bash
git add .
git commit -m "Ready for Railway deployment"
git push origin main
```

### 2. Railway Dashboard

1. Go to [railway.app/new](https://railway.app/new)
2. Click "Deploy from GitHub repo"
3. Select your repository
4. Railway will detect Node.js and auto-configure
5. Click "Add variables" and add all environment variables:
   ```
   SUPABASE_DB_HOST=...
   SUPABASE_DB_PASSWORD=...
   OPENAI_API_KEY=...
   NODE_ENV=production
   PORT=5000
   ADMIN_TOKEN=...
   ```
6. Click "Deploy"

### 3. Run Setup Commands

In Railway dashboard:
1. Go to your service
2. Click "Settings" > "Service"
3. Scroll to "One-off Commands"
4. Run:
   ```
   npm run db:setup
   npm run db:prompts
   ```

## Post-Deployment

### Verify Deployment

```bash
# Check health
curl https://your-app.up.railway.app/health

# Check database health
curl https://your-app.up.railway.app/health/db

# List jobs (should be empty initially)
curl https://your-app.up.railway.app/api/jobs

# Check admin status (requires auth)
curl -H "Authorization: Bearer your-admin-token" \
  https://your-app.up.railway.app/api/admin/status
```

### View Logs

```bash
# Real-time logs via CLI
railway logs

# Or in Railway dashboard:
# Click your service > "Deployments" > Click latest > "View Logs"
```

### Monitor Progress

```sql
-- Connect to your database and run:

-- Overall progress
SELECT 
  COUNT(*) FILTER (WHERE status='ok') AS completed,
  COUNT(*) FILTER (WHERE status='pending') AS pending,
  COUNT(*) FILTER (WHERE status='error') AS errors
FROM job_progress;

-- Queue status  
SELECT status, COUNT(*) FROM ai_job_queue GROUP BY status;

-- Recent activity
SELECT * FROM ai_job_queue ORDER BY updated_at DESC LIMIT 10;
```

## Environment Variables Reference

### Required

```bash
SUPABASE_DB_HOST=db.project.supabase.co
SUPABASE_DB_PASSWORD=your-password
OPENAI_API_KEY=sk-your-key
```

### Recommended

```bash
NODE_ENV=production
PORT=5000
ADMIN_TOKEN=secure-random-token
LOG_LEVEL=info
```

### Optional

```bash
# Database
SUPABASE_DB_PORT=5432
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres
SUPABASE_DB_SSLMODE=require

# OpenAI
OPENAI_MODEL=gpt-4o
OPENAI_TEMPERATURE=0.3
OPENAI_MAX_TOKENS=4096

# AI Pipeline
AI_MAX_CONCURRENCY=3
AI_RETRY_MAX=3
AI_RETRY_BACKOFF=15

# File Paths (if using persistent volume)
ONET_CSV_PATH=./data/All_Occupations.csv
LOGS_DIR=./logs
```

## Continuous Deployment

Once connected to GitHub, Railway automatically deploys on push:

```bash
# Make changes
git add .
git commit -m "Update feature"
git push origin main

# Railway automatically:
# 1. Detects push
# 2. Builds project
# 3. Runs tests (if configured)
# 4. Deploys if successful
# 5. Sends notification
```

## Scaling

### Vertical Scaling

In Railway dashboard:
1. Click service > "Settings"
2. Adjust resources under "Resource Limits"
3. Save changes
4. Service will restart with new limits

### Horizontal Scaling

For the AI worker:
1. Create multiple worker services
2. Each processes queue concurrently
3. `SKIP LOCKED` prevents conflicts
4. Adjust `AI_MAX_CONCURRENCY` per worker

## Troubleshooting

### Build Failures

```bash
# Check build logs
railway logs --deployment

# Common issues:
# - Missing dependencies: Check package.json
# - TypeScript errors: Run `npm run build` locally
# - Environment variables: Verify in dashboard
```

### Runtime Errors

```bash
# Check runtime logs
railway logs

# Common issues:
# - Database connection: Verify credentials
# - OpenAI API: Check key and rate limits
# - Memory limits: Increase in dashboard
```

### Database Connection Issues

```bash
# Test connection
railway run node -e "const{testConnection}=require('./dist/db/connection');testConnection()"

# Check SSL mode
railway variables set SUPABASE_DB_SSLMODE=require

# Verify host
railway variables get SUPABASE_DB_HOST
```

### Worker Not Processing

```bash
# Check queue
railway run node -e "const{getPool}=require('./dist/db/connection');getPool().query('SELECT COUNT(*) FROM ai_job_queue WHERE status=\\'pending\\'').then(r=>console.log(r.rows))"

# Reduce concurrency if rate limited
railway variables set AI_MAX_CONCURRENCY=1

# Add cooldown
railway variables set AI_PER_JOB_COOLDOWN=2
```

## Cost Optimization

1. **Use gpt-4o-mini**: Set `OPENAI_MODEL=gpt-4o-mini` (10x cheaper)
2. **Reduce concurrency**: Lower `AI_MAX_CONCURRENCY`
3. **Scale down when idle**: Use Railway's sleep mode
4. **Batch processing**: Process in chunks, not 24/7
5. **Monitor usage**: Check Railway and OpenAI dashboards

## Security Checklist

- [ ] Changed `ADMIN_TOKEN` from default
- [ ] Using environment variables (not hardcoded secrets)
- [ ] Database SSL enabled (`sslmode=require`)
- [ ] Railway project set to private
- [ ] GitHub repository set to private
- [ ] CORS configured for your domain
- [ ] Rate limiting enabled
- [ ] Monitoring and alerts configured

## Next Steps

1. ✅ Verify deployment is healthy
2. ✅ Run database setup
3. ✅ Import O*NET data
4. ✅ Start AI worker
5. ✅ Monitor progress
6. ✅ Archive PHP version
7. ✅ Update DNS (if using custom domain)
8. ✅ Configure monitoring/alerts
9. ✅ Document API for consumers
10. ✅ Set up backup strategy

## Support

For Railway-specific issues:
- [Railway Docs](https://docs.railway.app)
- [Railway Discord](https://discord.gg/railway)
- [Railway Status](https://railway.statuspage.io)

For application issues:
- Check logs: `railway logs`
- Review README.md
- Query `ai_errors` table

---

**Deployment Platform**: Railway  
**Runtime**: Node.js 18+  
**Framework**: Express.js + TypeScript  
**Database**: Supabase/PostgreSQL
