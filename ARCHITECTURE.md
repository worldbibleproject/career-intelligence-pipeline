# Career Intelligence Pipeline - System Architecture

## 🏗️ High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        WEB DASHBOARD                             │
│          (admin.html - Railway Public URL)                       │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│   │ Setup DB │ │ Prompts  │ │ Import   │ │ Test Job │         │
│   │ + Verify │ │ + Verify │ │ + Verify │ │ + Worker │         │
│   └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              ↓ HTTPS API
┌─────────────────────────────────────────────────────────────────┐
│                    EXPRESS.JS SERVER                             │
│                  (Node.js 22 + TypeScript)                       │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ API ENDPOINTS                                              │ │
│  │ • /health, /health/db                                      │ │
│  │ • /api/jobs, /api/jobs/:id                                 │ │
│  │ • /api/admin/status                                        │ │
│  │ • /api/admin/setup/* (database, prompts, import)           │ │
│  │ • /api/admin/verify/* (database, prompts, import)          │ │
│  │ • /api/admin/worker/* (start, test)                        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              ↓                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ BUSINESS LOGIC LAYER                                       │ │
│  │ • db-setup.ts       → Schema initialization                │ │
│  │ • ai-queries.ts     → Prompt template installation         │ │
│  │ • onet-import.ts    → Job data import                      │ │
│  │ • ai-worker.ts      → Queue processor + OpenAI calls       │ │
│  │ • openai.ts         → OpenAI service wrapper               │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    POSTGRESQL DATABASE                           │
│                    (Railway PostgreSQL 17.6)                     │
│                                                                   │
│  📊 38 TABLES:                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ CORE TABLES:                                             │  │
│  │ • jobs (1,016 rows)             → O*NET occupations      │  │
│  │ • regions (1 row)               → Geographic data        │  │
│  │ • ai_queries (38 rows)          → Query definitions      │  │
│  │ • prompt_templates (38 rows)    → OpenAI prompts         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ QUEUE & TRACKING:                                        │  │
│  │ • ai_job_queue (38,608 rows)    → Work queue            │  │
│  │ • job_progress (38,608 rows)    → Status tracking       │  │
│  │ • ai_errors                     → Error logs             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ RESULTS STORAGE:                                         │  │
│  │ • career_intelligence_data      → AI JSON responses      │  │
│  │   (job_id, query_id, response_data JSONB)               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ NORMALIZED TABLES (38 tables):                          │  │
│  │ • job_economics, job_roi_models, job_training_paths      │  │
│  │ • job_keywords, job_task_analysis, job_suitability       │  │
│  │ • job_risks, job_remote_work, job_career_ladders         │  │
│  │ • ... (35 more specialized tables)                       │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                       OPENAI API                                 │
│                    (GPT-4o via REST)                             │
│  • Model: gpt-4o                                                 │
│  • Temperature: 0.3                                              │
│  • Max tokens: 4096                                              │
│  • Retry logic: 3 attempts with exponential backoff             │
└─────────────────────────────────────────────────────────────────┘
```

## 📁 Directory Structure

```
career-intelligence-pipeline/
├── public/               # Static web assets
│   └── admin.html       # Web dashboard (single-page app)
│
├── src/                 # TypeScript source code
│   ├── server.ts        # Main Express server
│   │
│   ├── config/
│   │   └── index.ts     # Configuration management
│   │
│   ├── db/
│   │   └── connection.ts # PostgreSQL connection pool
│   │
│   ├── data/
│   │   └── onet-data.ts  # Embedded O*NET occupations (1,016 jobs)
│   │
│   ├── scripts/
│   │   ├── db-setup.ts              # Creates 38 database tables
│   │   ├── ai-queries.ts            # Installs 38 prompt templates
│   │   ├── ai-queries-schemas.ts    # Prompt template definitions
│   │   ├── onet-import.ts           # Imports jobs & creates queue
│   │   ├── ai-worker.ts             # Queue processor + AI executor
│   │   └── verify-and-reports.ts    # Verification & reporting
│   │
│   ├── services/
│   │   └── openai.ts    # OpenAI API wrapper with retry logic
│   │
│   └── utils/
│       └── logger.ts    # Winston logging
│
├── data/
│   └── All_Occupations.csv # Original O*NET data (converted to .ts)
│
├── dist/                # Compiled JavaScript (Railway runs this)
├── logs/                # Application logs
├── package.json         # Dependencies & scripts
├── tsconfig.json        # TypeScript configuration
├── railway.json         # Railway deployment config
└── Procfile            # Railway startup command
```

## 🔄 Data Flow

### **1. Setup Phase**
```
1. Setup Database
   └─> db-setup.ts
       └─> Creates 38 tables in PostgreSQL
       └─> Installs triggers & indexes

2. Install Prompts
   └─> ai-queries.ts
       └─> Reads ai-queries-schemas.ts
       └─> Inserts 38 prompt templates into database

3. Import O*NET Jobs
   └─> onet-import.ts
       └─> Reads onet-data.ts (1,016 occupations)
       └─> For each job:
           ├─> Insert into 'jobs' table
           ├─> Create 38 rows in 'job_progress'
           └─> Create 38 rows in 'ai_job_queue'
       └─> Result: 38,608 queue items
```

### **2. Processing Phase**
```
AI Worker Process:
1. Fetch item from ai_job_queue (WHERE status='pending')
2. Get job details (canonical_title, soc_code)
3. Get prompt template for this query_id
4. Render prompt with job variables
5. Call OpenAI API (with retry logic)
6. Validate JSON response
7. Save to career_intelligence_data (JSONB)
8. Update job_progress (status='ok')
9. Mark queue item complete
10. Repeat
```

### **3. Query Phase**
```
API Request: GET /api/jobs/123/data?query_id=economics-analysis
    └─> Query career_intelligence_data
        WHERE job_id = 123 
        AND query_id = 'economics-analysis'
    └─> Return JSONB response_data
```

## 🗄️ Database Schema Details

### **Core Relationship**
```sql
jobs (1,016)
  ├─> job_progress (38,608) = jobs × 38 queries
  ├─> ai_job_queue (38,608) = jobs × 38 queries
  └─> career_intelligence_data (38,608 when complete) = jobs × 38 queries

ai_queries (38) -- Defines the 38 query types
  ├─> Referenced by job_progress.query_id
  ├─> Referenced by ai_job_queue.query_id
  └─> Referenced by career_intelligence_data.query_id

prompt_templates (38) -- Stores OpenAI prompt text
  └─> Matched by id to ai_queries.id
```

### **The 38 AI Queries**
1. job-taxonomy
2. job-keywords
3. task-analysis
4. ai-resistance
5. growth-projection
6. economics-analysis
7. roi-modeling
8. family-economics
9. training-paths
10. licensure-requirements
11. compliance-flags
12. start-now
13. tools-equipment
14. suitability
15. faith-alignment
16. risks
17. geographic-variations
18. industry-context
19. provenance
20. safety-analysis
21. regional-licensing
22. enhanced-economics
23. advanced-family-planning
24. college-alternatives
25. portfolio-planning
26. daily-life
27. lesson-plans
28. market-saturation
29. accessibility
30. unionization
31. career-ladders
32. remote-work
33. time-flexibility
34. entrepreneurship
35. side-hustle
36. retirement-planning
37. income-stability
38. job-satisfaction

## 🚀 Deployment Architecture

```
GitHub Repository
    └─> Push to main branch
        └─> Railway Auto-Deploy
            ├─> Build: npm install && npm run build
            ├─> Start: npm start (runs dist/server.js)
            └─> Environment:
                ├─> NODE_ENV=production
                ├─> PORT=5000
                ├─> DATABASE_URL=postgresql://...
                ├─> OPENAI_API_KEY=sk-...
                └─> ADMIN_TOKEN=secure-random-token-2025

Railway Services:
├─> Web Service (career-api)
│   ├─> Domain: career-api-production-9b6a.up.railway.app
│   ├─> Health: /health
│   └─> Dashboard: /admin.html
│
└─> PostgreSQL Database (17.6)
    ├─> Internal: postgres.railway.internal:5432
    └─> Connection: Via DATABASE_URL
```

## 🔐 Security

- **Helmet**: Content Security Policy, XSS protection
- **CORS**: Configured for Railway domain
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Admin Auth**: Bearer token authentication
- **SSL/TLS**: Enforced by Railway

## 📊 Monitoring & Logging

- **Winston Logger**: JSON structured logs
- **Health Endpoints**: /health, /health/db
- **Admin Status**: Real-time stats on jobs, queue, progress
- **Console Logs**: Available in dashboard for debugging

## ⚡ Performance Considerations

- **Connection Pool**: PostgreSQL connection pooling
- **Indexes**: Created on frequently queried columns
- **JSONB Storage**: Efficient binary JSON storage
- **Batch Processing**: Worker processes queue in batches
- **Rate Limiting**: Prevents OpenAI rate limit errors

## 🧪 Testing Workflow

1. **Setup Database** → Verify tables created
2. **Install Prompts** → Verify 38 prompts loaded
3. **Import Jobs** → Verify 1,016 jobs + 38,608 queue items
4. **Test Job** → Process 1 job (38 queries) in dry-run mode
5. **Full Worker** → Process all jobs with OpenAI

## 📈 Scalability

**Current Capacity:**
- 1,016 jobs × 38 queries = **38,608 API calls**
- At ~$0.01 per call = **~$386 total cost**
- At 1 request/second = **~10.7 hours** to complete

**Scaling Options:**
- Increase worker concurrency (config.ai.maxConcurrency)
- Multiple worker instances
- Priority-based queue processing
- Regional expansion (add more regions)

## 🔧 Configuration

**Environment Variables:**
```bash
# Application
NODE_ENV=production
PORT=5000
APP_TZ=UTC

# Database (Railway provides this)
DATABASE_URL=postgresql://user:pass@host:port/db

# OpenAI
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o
OPENAI_TEMPERATURE=0.3
OPENAI_MAX_TOKENS=4096

# Admin
ADMIN_TOKEN=secure-random-token-2025

# Worker
AI_MAX_CONCURRENCY=3
AI_RETRY_MAX=3
AI_RETRY_BACKOFF=15
```

## 📝 Development Commands

```bash
# Local development
npm run dev           # Watch mode with tsx

# Build & Deploy
npm run build         # Compile TypeScript
npm start            # Start production server

# Database
npm run db:setup     # Initialize schema
npm run db:prompts   # Install AI prompts

# Import & Process
npm run onet:import  # Import O*NET jobs
npm run worker:ai    # Start AI worker

# Utilities
npm run verify       # Run verification checks
npm run lint         # ESLint
npm run type-check   # TypeScript validation
```

## 🎯 API Endpoints Reference

### Public Endpoints
- `GET /health` - Server health check
- `GET /health/db` - Database connection check
- `GET /api/jobs` - List all jobs (paginated)
- `GET /api/jobs/:id` - Get specific job
- `GET /api/jobs/:id/data` - Get AI data for job

### Admin Endpoints (require Bearer token)
- `GET /api/admin/status` - Pipeline status & stats
- `POST /api/admin/setup/database` - Initialize database
- `POST /api/admin/setup/prompts` - Install prompts
- `POST /api/admin/setup/import` - Import O*NET jobs
- `GET /api/admin/verify/database` - Verify tables
- `GET /api/admin/verify/prompts` - Verify prompts count
- `GET /api/admin/verify/import` - Verify import counts
- `POST /api/admin/worker/start` - Start full worker
- `POST /api/admin/worker/test` - Run test job (1 job only)

## 🌐 URLs

- **Dashboard**: https://career-api-production-9b6a.up.railway.app/admin.html
- **API Base**: https://career-api-production-9b6a.up.railway.app
- **GitHub**: https://github.com/worldbibleproject/career-intelligence-pipeline
- **Railway**: https://railway.app

---

**Built with:** Node.js 22, TypeScript, Express, PostgreSQL, OpenAI GPT-4o  
**Deployed on:** Railway  
**Last Updated:** 2025-11-11
