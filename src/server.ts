import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import config from './config/index.js';
import { logger } from './utils/logger.js';
import { getPool, testConnection } from './db/connection.js';

const app = express();

// Security middleware - allow inline scripts for admin dashboard
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "'unsafe-inline'"],
      "script-src-attr": ["'unsafe-inline'"],
    },
  },
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});

app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Static files - serve from both root public and dist/public for flexibility
app.use(express.static('public'));
app.use(express.static(path.join(process.cwd(), 'public')));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// Health check routes
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.app.env,
    version: config.app.version,
  });
});

app.get('/health/db', async (req, res) => {
  try {
    const isConnected = await testConnection();
    if (isConnected) {
      res.json({ status: 'ok', database: 'connected' });
    } else {
      res.status(503).json({ status: 'error', database: 'disconnected' });
    }
  } catch (error) {
    logger.error('Database health check failed:', error);
    res.status(503).json({ 
      status: 'error', 
      database: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// API Routes
app.get('/api/jobs', async (req, res) => {
  try {
    const pool = getPool();
    const limit = Math.min(parseInt(req.query.limit as string || '50'), 100);
    const offset = parseInt(req.query.offset as string || '0');
    
    const result = await pool.query(
      'SELECT id, "canonicalTitle", "shortDescription", "socCode", "jobZone" FROM jobs ORDER BY id LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    
    const countResult = await pool.query('SELECT COUNT(*) FROM jobs');
    
    res.json({
      jobs: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset,
    });
  } catch (error) {
    logger.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/jobs/:id', async (req, res) => {
  try {
    const pool = getPool();
    const jobId = parseInt(req.params.id);
    
    const result = await pool.query(
      'SELECT * FROM jobs WHERE id = $1',
      [jobId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({ job: result.rows[0] });
  } catch (error) {
    logger.error('Error fetching job:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/jobs/:id/data', async (req, res) => {
  try {
    const pool = getPool();
    const jobId = parseInt(req.params.id);
    const queryId = req.query.query_id as string | undefined;
    
    let query = 'SELECT * FROM career_intelligence_data WHERE job_id = $1';
    const params: any[] = [jobId];
    
    if (queryId) {
      query += ' AND query_id = $2';
      params.push(queryId);
    }
    
    const result = await pool.query(query, params);
    
    res.json({
      job_id: jobId,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    logger.error('Error fetching job data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin routes (protected by token)
const adminAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== config.app.adminToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

app.get('/api/admin/status', adminAuth, async (req, res) => {
  try {
    const pool = getPool();
    
    const [jobCount, queueStatus, progressStatus] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM jobs'),
      pool.query('SELECT status, COUNT(*) FROM ai_job_queue GROUP BY status'),
      pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status='ok') AS completed,
          COUNT(*) FILTER (WHERE status='pending') AS pending,
          COUNT(*) FILTER (WHERE status='running') AS running,
          COUNT(*) FILTER (WHERE status='error') AS errors,
          COUNT(*) AS total
        FROM job_progress
      `),
    ]);
    
    res.json({
      jobs: {
        total: parseInt(jobCount.rows[0].count),
      },
      queue: queueStatus.rows.reduce((acc, row) => {
        acc[row.status] = parseInt(row.count);
        return acc;
      }, {} as Record<string, number>),
      progress: progressStatus.rows[0],
    });
  } catch (error) {
    logger.error('Error fetching admin status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/setup/database', adminAuth, async (req, res) => {
  try {
    logger.info('Importing db-setup script...');
    const { setupDatabase } = await import('./scripts/db-setup.js');
    logger.info('Running database setup...');
    await setupDatabase();
    res.json({ status: 'ok', message: 'Database schema created successfully' });
  } catch (error) {
    logger.error('Database setup failed:', error);
    res.status(500).json({ 
      error: 'Database setup failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.post('/api/admin/setup/prompts', adminAuth, async (req, res) => {
  try {
    logger.info('Importing ai-queries script...');
    const { installPrompts } = await import('./scripts/ai-queries.js');
    logger.info('Installing prompt templates...');
    await installPrompts();
    res.json({ status: 'ok', message: 'Prompt templates installed successfully' });
  } catch (error) {
    logger.error('Prompt installation failed:', error);
    res.status(500).json({ 
      error: 'Prompt installation failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Admin worker endpoint
app.post('/api/admin/worker/start', adminAuth, async (req, res) => {
  try {
    const maxItems = req.body?.maxItems || 100;
    logger.info(`Starting AI worker with max ${maxItems} items...`);
    
    // Set up argv for worker
    const originalArgv = process.argv;
    process.argv = ['node', 'ai-worker', `--max=${maxItems}`, '--verbose'];
    
    // Import and run worker in background
    import('./scripts/ai-worker.js').then(({ runWorker }) => {
      runWorker().catch(error => {
        logger.error('Worker error:', error);
      }).finally(() => {
        process.argv = originalArgv;
      });
    });
    
    res.json({ 
      status: 'ok', 
      message: `AI worker started (processing up to ${maxItems} items)` 
    });
  } catch (error) {
    logger.error('Failed to start worker:', error);
    res.status(500).json({ 
      error: 'Failed to start worker',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Verification endpoints
app.get('/api/admin/verify/database', adminAuth, async (req, res) => {
  try {
    const pool = getPool();
    const expectedTables = ['jobs', 'regions', 'ai_queries', 'prompt_templates', 'ai_job_queue', 'job_progress', 'career_intelligence_data'];
    const missingTables: string[] = [];
    let tablesFound = 0;
    
    for (const table of expectedTables) {
      const result = await pool.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
        [table]
      );
      if (result.rows[0].exists) {
        tablesFound++;
      } else {
        missingTables.push(table);
      }
    }
    
    res.json({
      success: missingTables.length === 0,
      tablesFound,
      expectedTables,
      missingTables,
    });
  } catch (error) {
    logger.error('Database verification failed:', error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.get('/api/admin/verify/prompts', adminAuth, async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query('SELECT COUNT(*) FROM ai_queries');
    const promptsFound = parseInt(result.rows[0].count);
    
    res.json({
      success: promptsFound === 38,
      promptsFound,
      expected: 38,
    });
  } catch (error) {
    logger.error('Prompts verification failed:', error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.get('/api/admin/verify/import', adminAuth, async (req, res) => {
  try {
    const pool = getPool();
    const [jobsResult, queueResult, progressResult] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM jobs'),
      pool.query('SELECT COUNT(*) FROM ai_job_queue'),
      pool.query('SELECT COUNT(*) FROM job_progress'),
    ]);
    
    res.json({
      success: true,
      jobsCount: parseInt(jobsResult.rows[0].count),
      queueCount: parseInt(queueResult.rows[0].count),
      progressCount: parseInt(progressResult.rows[0].count),
    });
  } catch (error) {
    logger.error('Import verification failed:', error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.get('/api/admin/verify/onet-data', adminAuth, async (req, res) => {
  try {
    // Verify embedded O*NET data
    const { onetOccupations } = await import('./data/onet-data.js');
    
    const dataLength = onetOccupations.length;
    const firstRecord = onetOccupations[0];
    const lastRecord = onetOccupations[dataLength - 1];
    
    // Check required columns
    const requiredColumns = ['occupation', 'code', 'jobZone', 'dataLevel'];
    const firstRecordKeys = Object.keys(firstRecord);
    const missingColumns = requiredColumns.filter(col => !firstRecordKeys.includes(col));
    const hasAllColumns = missingColumns.length === 0;
    
    // Sample validation
    const validRecords = onetOccupations.filter((rec: any) => 
      rec.occupation && rec.code && rec.occupation.length > 0 && rec.code.length > 0
    ).length;
    
    res.json({
      success: hasAllColumns && dataLength === 1016,
      dataLength,
      expectedLength: 1016,
      hasAllColumns,
      requiredColumns,
      missingColumns,
      actualColumns: firstRecordKeys,
      validRecords,
      firstRecord,
      lastRecord,
    });
  } catch (error) {
    logger.error('O*NET data verification failed:', error);
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Test job endpoint - process ONE job with all 38 queries
app.post('/api/admin/worker/test', adminAuth, async (req, res) => {
  try {
    const pool = getPool();
    logger.info('Starting test job - processing 1 job with all 38 queries...');
    
    // Get first job from queue
    const jobResult = await pool.query(`
      SELECT DISTINCT j.id, j.canonicaltitle as "canonicalTitle", j.soccode as "socCode"
      FROM jobs j
      INNER JOIN ai_job_queue q ON q.job_id = j.id
      WHERE q.status = 'pending'
      LIMIT 1
    `);
    
    if (jobResult.rows.length === 0) {
      return res.json({
        success: false,
        message: 'No pending jobs in queue. Run import first.',
      });
    }
    
    const job = jobResult.rows[0];
    const logs: string[] = [];
    
    logs.push(`Testing job: ${job.canonicalTitle} (ID: ${job.id})`);
    logs.push(`SOC Code: ${job.socCode}`);
    logs.push('---');
    
    // Get all queue items for this job
    const queueItems = await pool.query(`
      SELECT q.id, q.query_id, aq.display_name
      FROM ai_job_queue q
      INNER JOIN ai_queries aq ON aq.id = q.query_id
      WHERE q.job_id = $1 AND q.status = 'pending'
      ORDER BY q.query_id
      LIMIT 38
    `, [job.id]);
    
    logs.push(`Found ${queueItems.rows.length} queries to process`);
    logs.push('---');
    
    let successful = 0;
    let failed = 0;
    
    // Process each query (in dry-run mode for testing)
    for (const item of queueItems.rows) {
      try {
        logs.push(`[${successful + failed + 1}/38] ${item.display_name}...`);
        
        // Mark as complete (dry-run, not actually calling OpenAI)
        await pool.query(
          `UPDATE ai_job_queue SET status = 'ok', updated_at = NOW() WHERE id = $1`,
          [item.id]
        );
        
        successful++;
        logs.push(`  ✓ Success`);
      } catch (error) {
        failed++;
        logs.push(`  ✗ Failed: ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }
    
    logs.push('---');
    logs.push(`Test complete: ${successful} successful, ${failed} failed`);
    
    res.json({
      success: true,
      jobTitle: job.canonicalTitle,
      jobId: job.id,
      queriesProcessed: successful + failed,
      successful,
      failed,
      logs,
    });
    
  } catch (error) {
    logger.error('Test job failed:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.post('/api/admin/setup/import', adminAuth, async (req, res) => {
  try {
    logger.info('Starting O*NET import from embedded data...');
    
    // Set up argv to enable enqueue
    const originalArgv = process.argv;
    process.argv = ['node', 'onet-import', '--enqueue'];
    
    const { importONet } = await import('./scripts/onet-import.js');
    logger.info('Importing O*NET data with enqueue enabled...');
    await importONet(true); // skipPoolClose=true since server manages the pool
    
    // Restore argv
    process.argv = originalArgv;
    
    res.json({ status: 'ok', message: 'O*NET data imported and queued successfully (1016 occupations)' });
  } catch (error) {
    logger.error('O*NET import failed:', error);
    res.status(500).json({ 
      error: 'O*NET import failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: config.app.env === 'development' ? err.message : undefined,
  });
});

// Start server
const PORT = config.app.port;

app.listen(PORT, () => {
  logger.info(`🚀 Server started on port ${PORT}`);
  logger.info(`📍 Environment: ${config.app.env}`);
  logger.info(`🔗 Health check: http://localhost:${PORT}/health`);
  
  // Test database connection on startup
  testConnection().then((connected) => {
    if (connected) {
      logger.info('✅ Database connection successful');
    } else {
      logger.error('❌ Database connection failed');
    }
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

export default app;
