# Career Intelligence Pipeline - Node.js/TypeScript

**Railway-ready deployment** of the Career Intelligence ETL pipeline. This is a complete port from PHP to Node.js/TypeScript for seamless deployment via Railway CLI and GitHub integration.

## 🚀 Quick Deploy to Railway

### Prerequisites
- Node.js 18+ installed
- Railway CLI installed: `npm install -g @railway/cli`
- GitHub account
- Supabase/Postgres database
- OpenAI API key

### Deploy Steps

```bash
# 1. Navigate to project directory
cd nodejs-version

# 2. Install dependencies
npm install

# 3. Login to Railway
railway login

# 4. Initialize Railway project
railway init

# 5. Link to GitHub (optional but recommended)
railway link

# 6. Set environment variables
railway variables set SUPABASE_DB_PASSWORD=your-password
railway variables set OPENAI_API_KEY=your-key
railway variables set SUPABASE_DB_HOST=your-host
railway variables set NODE_ENV=production

# 7. Deploy
railway up

# 8. Run database setup (one-time)
railway run npm run db:setup

# 9. Install AI prompts (one-time)
railway run npm run db:prompts
```

## 📋 Project Structure

```
nodejs-version/
├── src/
│   ├── config/           # Configuration management
│   │   └── index.ts
│   ├── db/               # Database connection
│   │   └── connection.ts
│   ├── services/         # Business logic
│   │   ├── openai.ts    # OpenAI integration
│   │   └── parser.ts    # JSON parsing logic
│   ├── scripts/          # CLI scripts
│   │   ├── db-setup.ts   # Database schema setup
│   │   ├── ai-queries.ts # AI prompt templates
│   │   ├── onet-import.ts # O*NET CSV import
│   │   ├── ai-worker.ts  # AI processing worker
│   │   └── verify-and-reports.ts # Auditing
│   ├── routes/           # API routes
│   │   ├── health.ts
│   │   ├── jobs.ts
│   │   └── admin.ts
│   ├── middleware/       # Express middleware
│   │   ├── auth.ts
│   │   └── errorHandler.ts
│   ├── utils/            # Utilities
│   │   └── logger.ts
│   └── server.ts         # Express server
├── package.json
├── tsconfig.json
├── Procfile             # Railway process definition
├── railway.json         # Railway configuration
└── README.md

```

## 🔧 Environment Variables

Create a `.env` file (use `.env.example` as template):

```env
# Required
SUPABASE_DB_HOST=db.yourproject.supabase.co
SUPABASE_DB_PASSWORD=your-password
OPENAI_API_KEY=sk-...

# Optional (with defaults)
NODE_ENV=production
PORT=5000
SUPABASE_DB_PORT=5432
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres
OPENAI_MODEL=gpt-4o
AI_MAX_CONCURRENCY=3
LOG_LEVEL=info
```

## 📦 Available Scripts

```bash
# Development
npm run dev              # Start with hot reload

# Production
npm run build            # Compile TypeScript
npm start                # Start production server

# Database
npm run db:setup         # Initialize database schema
npm run db:prompts       # Install AI prompt templates

# Data Pipeline
npm run onet:import      # Import O*NET CSV data
npm run worker:ai        # Run AI processing worker
npm run verify           # Run audits and reports

# Quality
npm run lint             # ESLint check
npm run type-check       # TypeScript type checking
```

## 🗄️ Database Setup

The database schema includes:
- **Core Tables**: jobs, regions, ai_queries
- **AI Data**: career_intelligence_data (raw JSON responses)
- **Progress Tracking**: job_progress, ai_job_queue, ai_errors
- **38 Normalized Tables**: One for each query type
- **Supporting**: prompt_templates, audience_profiles, embeddings

### Initialize Database

```bash
# Run schema setup
npm run db:setup

# Install prompts
npm run db:prompts

# Import O*NET data
npm run onet:import -- --csv=./data/All_Occupations.csv --enqueue=all

# Start processing
npm run worker:ai -- --max=100 --verbose
```

## 🤖 AI Worker

The AI worker processes jobs from the queue:

```bash
# Process 200 items then stop
npm run worker:ai -- --max=200

# Continuous mode (sleeps when no work)
npm run worker:ai -- --sleep=5

# Specific region
npm run worker:ai -- --region=US

# Dry run (no database writes)
npm run worker:ai -- --dry-run --verbose
```

## 🌐 API Endpoints

### Health Check
```
GET /health
GET /health/db
```

### Jobs
```
GET /api/jobs              # List all jobs
GET /api/jobs/:id          # Get job details
GET /api/jobs/:id/data     # Get all AI data for job
```

### Admin (requires ADMIN_TOKEN)
```
POST /api/admin/setup      # Run database setup
POST /api/admin/prompts    # Install prompts
POST /api/admin/import     # Import O*NET data
GET  /api/admin/status     # Pipeline status
POST /api/admin/worker     # Trigger worker
```

## 🚂 Railway Deployment

### Via CLI

```bash
# Login
railway login

# Create new project
railway init

# Set environment variables
railway variables set SUPABASE_DB_PASSWORD=***
railway variables set OPENAI_API_KEY=***

# Deploy
railway up
```

### Via GitHub

1. Push code to GitHub repository
2. Connect repository in Railway dashboard
3. Railway will auto-deploy on push
4. Set environment variables in Railway dashboard

### Railway Configuration

The `railway.json` file configures the build and deployment:

```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install && npm run build"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### Multiple Services (Optional)

Railway supports multiple services via `Procfile`:

```
web: node dist/server.js
worker: node dist/scripts/ai-worker.js
```

To deploy both:
1. Create two services in Railway dashboard
2. Link both to same repo
3. Configure each with different start command

## 🔐 Security

1. **Never commit secrets** - Use environment variables
2. **ADMIN_TOKEN** - Change default token immediately
3. **Database SSL** - Always use `sslmode=require`
4. **API Rate Limiting** - Configured in Express middleware
5. **CORS** - Restricted to specified origins

## 📊 Monitoring

### Database Queries

```sql
-- Overall completion
SELECT 
  COUNT(*) FILTER (WHERE status='ok') AS completed,
  COUNT(*) FILTER (WHERE status='pending') AS pending,
  COUNT(*) FILTER (WHERE status='error') AS errors
FROM job_progress WHERE region_id=1;

-- Queue status
SELECT status, COUNT(*) FROM ai_job_queue GROUP BY status;

-- Recent errors
SELECT * FROM ai_errors ORDER BY occurred_at DESC LIMIT 10;
```

### Railway Dashboard

Monitor your deployment in Railway dashboard:
- View logs in real-time
- Track resource usage
- Monitor deployment status
- Manage environment variables

## 🐛 Troubleshooting

### Database Connection Issues
```bash
# Test connection
npm run db:setup

# Check logs
railway logs
```

### OpenAI Rate Limits
- Reduce `AI_MAX_CONCURRENCY`
- Add cooldown: `AI_PER_JOB_COOLDOWN=2`
- Use `gpt-4o-mini` for cost savings

### Build Failures
```bash
# Clean install
rm -rf node_modules dist
npm install
npm run build
```

### Worker Not Processing
```bash
# Check queue
railway run node -e "const{getPool}=require('./dist/db/connection');getPool().query('SELECT COUNT(*) FROM ai_job_queue WHERE status=\\'pending\\'').then(r=>console.log(r.rows))"

# Run verbose
npm run worker:ai -- --verbose --max=1
```

## 📈 Performance Tips

1. **Concurrency**: Adjust `AI_MAX_CONCURRENCY` based on OpenAI rate limits
2. **Batch Size**: Process in chunks with `--max` flag
3. **Database Indexes**: Already optimized in schema
4. **Connection Pooling**: Configured for 20 connections
5. **Logging**: Set `LOG_LEVEL=warn` in production

## 🔄 Migration from PHP

The Node.js version maintains 100% compatibility with the PHP version:
- Same database schema
- Same API query structure
- Same 38 AI queries
- Same JSON schemas
- Same prompt templates

### Migration Steps

1. ✅ Deploy Node.js version to Railway
2. ✅ Run database setup (if new database)
3. ✅ Import O*NET data
4. ✅ Verify data integrity
5. ✅ Archive PHP version

## 📝 Development

### Local Development

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your credentials

# Start development server
npm run dev

# In another terminal, run worker
npm run worker:ai -- --verbose
```

### Adding New AI Queries

1. Add query to `src/scripts/db-setup.ts` (ai_queries INSERT)
2. Create table in `createNormalizedTables()`
3. Add prompt template in `src/scripts/ai-queries.ts`
4. Add parser case in `src/services/parser.ts`
5. Run `npm run db:setup && npm run db:prompts`

## 🤝 Support

For issues or questions:
1. Check Railway logs: `railway logs`
2. Review database errors: Query `ai_errors` table
3. Run verification: `npm run verify`
4. Check this README

## 📄 License

Proprietary - Internal Use Only

---

**Version**: 1.0.0  
**Platform**: Railway  
**Runtime**: Node.js 18+  
**Database**: Supabase/Postgres  
**AI**: OpenAI GPT-4
