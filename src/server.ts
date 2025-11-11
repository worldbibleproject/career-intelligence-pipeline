import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import config from './config/index.js';
import { logger } from './utils/logger.js';
import { getPool, testConnection } from './db/connection.js';

const app = express();

// Security middleware
app.use(helmet());
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

app.post('/api/admin/setup/import', adminAuth, async (req, res) => {
  try {
    logger.info('Importing onet-import script...');
    const { importONet } = await import('./scripts/onet-import.js');
    logger.info('Importing O*NET data...');
    await importONet();
    res.json({ status: 'ok', message: 'O*NET data imported successfully' });
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
