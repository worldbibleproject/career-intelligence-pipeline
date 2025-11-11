#!/usr/bin/env tsx
/**
 * ai-worker.ts
 * Processes AI job queue items - fetches, generates, validates, and stores career intelligence
 */

import { getPool, closePool } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { callOpenAI, validateJSON } from '../services/openai.js';
import config from '../config/index.js';

interface WorkerOptions {
  maxItems?: number;
  region?: string;
  sleep?: number;
  dryRun?: boolean;
  verbose?: boolean;
}

interface QueueItem {
  queue_id: number;
  job_id: number;
  region_id: number;
  query_id: string;
  canonical_title: string;
  soc_code: string;
  region_code: string;
  prompt_template: string;
}

async function fetchQueueItem(regionCode?: string): Promise<QueueItem | null> {
  const pool = getPool();
  
  let query = `
    SELECT 
      q.id as queue_id,
      q.job_id,
      q.region_id,
      q.query_id,
      j."canonicalTitle" as canonical_title,
      j."socCode" as soc_code,
      r.code as region_code,
      pt.template as prompt_template
    FROM ai_job_queue q
    JOIN jobs j ON q.job_id = j.id
    JOIN regions r ON q.region_id = r.id
    JOIN prompt_templates pt ON q.query_id = pt.id
    WHERE q.status = 'pending'
  `;
  
  const params: any[] = [];
  if (regionCode) {
    params.push(regionCode);
    query += ` AND r.code = $1`;
  }
  
  query += `
    ORDER BY q.priority DESC, q.id ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `;
  
  const result = await pool.query(query, params);
  return result.rows[0] || null;
}

async function markQueueItemRunning(queueId: number): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE ai_job_queue SET status = 'running', updated_at = now() WHERE id = $1`,
    [queueId]
  );
}

async function markQueueItemComplete(queueId: number, jobId: number, regionId: number, queryId: string): Promise<void> {
  const pool = getPool();
  
  // Update queue
  await pool.query(
    `UPDATE ai_job_queue SET status = 'ok', updated_at = now() WHERE id = $1`,
    [queueId]
  );
  
  // Update progress
  await pool.query(
    `UPDATE job_progress SET status = 'ok', last_error = NULL, updated_at = now()
     WHERE job_id = $1 AND region_id = $2 AND query_id = $3`,
    [jobId, regionId, queryId]
  );
}

async function markQueueItemError(queueId: number, jobId: number, regionId: number, queryId: string, error: string): Promise<void> {
  const pool = getPool();
  
  // Update queue
  await pool.query(
    `UPDATE ai_job_queue 
     SET status = 'error', last_error = $2, attempts = attempts + 1, updated_at = now()
     WHERE id = $1`,
    [queueId, error.substring(0, 1000)]
  );
  
  // Update progress
  await pool.query(
    `UPDATE job_progress SET status = 'error', last_error = $4, updated_at = now()
     WHERE job_id = $1 AND region_id = $2 AND query_id = $3`,
    [jobId, regionId, queryId, error.substring(0, 1000)]
  );
  
  // Log to errors table
  await pool.query(
    `INSERT INTO ai_errors (job_id, region_id, query_id, model, error, occurred_at)
     VALUES ($1, $2, $3, $4, $5, now())`,
    [jobId, regionId, queryId, config.openai.model, error.substring(0, 5000)]
  );
}

async function saveCareerIntelligence(jobId: number, regionId: number, queryId: string, data: any): Promise<void> {
  const pool = getPool();
  
  await pool.query(
    `INSERT INTO career_intelligence_data (job_id, region_id, query_id, response_data, created_at, updated_at)
     VALUES ($1, $2, $3, $4, now(), now())
     ON CONFLICT (job_id, region_id, query_id) DO UPDATE SET
       response_data = EXCLUDED.response_data,
       updated_at = now()`,
    [jobId, regionId, queryId, JSON.stringify(data)]
  );
}

function renderPrompt(template: string, variables: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return rendered;
}

async function processQueueItem(item: QueueItem, options: WorkerOptions): Promise<boolean> {
  const { job_id, region_id, query_id, queue_id, canonical_title, soc_code, region_code, prompt_template } = item;
  
  logger.info(`Processing: Job ${job_id} / Query ${query_id}`, {
    title: canonical_title,
    socCode: soc_code,
  });
  
  try {
    // Mark as running
    await markQueueItemRunning(queue_id);
    
    // Render prompt with variables
    const prompt = renderPrompt(prompt_template, {
      canonical_title,
      soc_code,
      region_code,
      today: new Date().toISOString().split('T')[0],
      currency: 'USD',
    });
    
    if (options.verbose) {
      logger.debug('Rendered prompt', { prompt: prompt.substring(0, 200) + '...' });
    }
    
    // Call OpenAI
    if (!options.dryRun) {
      const response = await callOpenAI({ prompt });
      
      // Validate JSON
      const validation = await validateJSON(response.content);
      if (!validation.valid) {
        throw new Error(`Invalid JSON response: ${validation.error}`);
      }
      
      // Save to database
      await saveCareerIntelligence(job_id, region_id, query_id, validation.data);
      
      // Mark complete
      await markQueueItemComplete(queue_id, job_id, region_id, query_id);
      
      logger.info(`✅ Completed: Job ${job_id} / Query ${query_id}`, {
        tokens: response.usage?.totalTokens,
      });
    } else {
      logger.info(`[DRY RUN] Would process: Job ${job_id} / Query ${query_id}`);
      await markQueueItemComplete(queue_id, job_id, region_id, query_id);
    }
    
    return true;
  } catch (error: any) {
    logger.error(`❌ Error processing: Job ${job_id} / Query ${query_id}`, {
      error: error.message,
    });
    
    if (!options.dryRun) {
      await markQueueItemError(queue_id, job_id, region_id, query_id, error.message);
    }
    
    return false;
  }
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const options: WorkerOptions = {
    maxItems: undefined,
    region: undefined,
    sleep: 5,
    dryRun: false,
    verbose: false,
  };
  
  for (const arg of args) {
    if (arg.startsWith('--max=')) {
      options.maxItems = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--region=')) {
      options.region = arg.split('=')[1];
    } else if (arg.startsWith('--sleep=')) {
      options.sleep = parseInt(arg.split('=')[1]);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    }
  }
  
  logger.info('Starting AI worker', options);
  
  let processed = 0;
  let successful = 0;
  let failed = 0;
  
  try {
    while (true) {
      // Fetch next item
      const item = await fetchQueueItem(options.region);
      
      if (!item) {
        if (options.maxItems) {
          logger.info('No more items in queue, exiting');
          break;
        } else {
          logger.info(`No items in queue, sleeping ${options.sleep}s...`);
          await new Promise((resolve) => setTimeout(resolve, options.sleep! * 1000));
          continue;
        }
      }
      
      // Process item
      const success = await processQueueItem(item, options);
      processed++;
      if (success) successful++;
      else failed++;
      
      // Rate limiting
      if (config.ai.perJobRateLimitSec > 0) {
        await new Promise((resolve) => setTimeout(resolve, config.ai.perJobRateLimitSec * 1000));
      }
      
      // Check if max reached
      if (options.maxItems && processed >= options.maxItems) {
        logger.info(`Reached max items (${options.maxItems}), exiting`);
        break;
      }
    }
    
    logger.info('✅ AI worker finished', {
      processed,
      successful,
      failed,
    });
  } catch (error) {
    logger.error('❌ AI worker failed:', error);
    throw error;
  } finally {
    await closePool();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Script failed:', error);
    process.exit(1);
  });
}

export { main as runWorker };
