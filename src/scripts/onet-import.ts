#!/usr/bin/env tsx
/**
 * onet-import.ts
 * Imports O*NET occupation data from CSV and creates queue items
 */

import { getPool, closePool } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { onetOccupations } from '../data/onet-data.js';

interface ONetRow {
  jobZone: string;
  code: string;
  occupation: string;
  dataLevel: string;
}

interface ImportOptions {
  region: string;
  enqueue: boolean;
}

async function importJob(socCode: string, title: string, description: string): Promise<number> {
  const pool = getPool();
  
  logger.info(`[importJob] Inserting job: ${socCode} - ${title}`);
  
  const result = await pool.query(
    `INSERT INTO jobs (canonicaltitle, shortdescription, soccode, onetcode)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (soccode) DO UPDATE SET
       canonicaltitle = EXCLUDED.canonicaltitle,
       shortdescription = EXCLUDED.shortdescription,
       onetcode = EXCLUDED.onetcode
     RETURNING id`,
    [title, description.substring(0, 500), socCode, socCode]
  );
  
  const jobId = result.rows[0].id;
  logger.info(`[importJob] Job inserted with ID: ${jobId}`);
  
  return jobId;
}

async function createProgressRecords(jobId: number, regionId: number): Promise<void> {
  const pool = getPool();
  
  // Get all query IDs
  const queriesResult = await pool.query('SELECT id FROM ai_queries');
  const queryIds = queriesResult.rows.map((row) => row.id);
  
  // Create progress records
  for (const queryId of queryIds) {
    await pool.query(
      `INSERT INTO job_progress (job_id, region_id, query_id, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (job_id, region_id, query_id) DO NOTHING`,
      [jobId, regionId, queryId]
    );
  }
}

async function enqueueJob(jobId: number, regionId: number): Promise<void> {
  const pool = getPool();
  
  // Get all query IDs
  const queriesResult = await pool.query('SELECT id FROM ai_queries');
  const queryIds = queriesResult.rows.map((row) => row.id);
  
  // Enqueue all queries for this job
  for (const queryId of queryIds) {
    await pool.query(
      `INSERT INTO ai_job_queue (job_id, region_id, query_id, status, priority)
       VALUES ($1, $2, $3, 'pending', 100)
       ON CONFLICT DO NOTHING`,
      [jobId, regionId, queryId]
    );
  }
}

async function getRegionId(regionCode: string): Promise<number> {
  const pool = getPool();
  const result = await pool.query('SELECT id FROM regions WHERE code = $1', [regionCode]);
  
  if (result.rows.length === 0) {
    throw new Error(`Region '${regionCode}' not found in database`);
  }
  
  return result.rows[0].id;
}

async function main(skipPoolClose = false) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const options: ImportOptions = {
    region: 'US',
    enqueue: false,
  };
  
  for (const arg of args) {
    if (arg.startsWith('--region=')) {
      options.region = arg.split('=')[1];
    } else if (arg === '--enqueue' || arg === '--enqueue=all') {
      options.enqueue = true;
    }
  }
  
  logger.info('Starting O*NET import from embedded data', options);
  logger.info(`[DEBUG] onetOccupations array length: ${onetOccupations.length}`);
  
  try {
    // Test database connection first
    const pool = getPool();
    const testResult = await pool.query('SELECT NOW()');
    logger.info(`[DEBUG] Database connection OK: ${testResult.rows[0].now}`);
    
    // Get region ID
    const regionId = await getRegionId(options.region);
    logger.info(`Using region: ${options.region} (ID: ${regionId})`);
    
    // Use embedded data
    const records = onetOccupations as ONetRow[];
    logger.info(`Found ${records.length} occupations in embedded data`);
    logger.info(`[DEBUG] First record: ${JSON.stringify(records[0])}`);
    
    // Import each job
    let imported = 0;
    let updated = 0;
    let enqueued = 0;
    let errors = 0;
    
    for (const record of records) {
      const socCode = record.code;
      const title = record.occupation;
      const jobZone = record.jobZone;
      const description = `Job Zone: ${jobZone || 'N/A'}`;
      
      if (!socCode || !title) {
        logger.warn('Skipping row with missing SOC code or title', record);
        continue;
      }
      
      try {
        const jobId = await importJob(socCode, title, description);
        imported++;
        
        // Create progress records
        await createProgressRecords(jobId, regionId);
        
        // Enqueue if requested
        if (options.enqueue) {
          await enqueueJob(jobId, regionId);
          enqueued++;
        }
        
        if (imported % 100 === 0) {
          logger.info(`Progress: ${imported}/${records.length} jobs imported`);
        }
      } catch (error) {
        errors++;
        logger.error(`Error importing job ${socCode}:`, error);
        if (errors > 10) {
          logger.error('Too many errors, stopping import');
          throw new Error(`Import failed after ${errors} errors`);
        }
      }
    }
    
    logger.info('✅ O*NET import complete', {
      totalRecords: records.length,
      imported,
      enqueued: options.enqueue ? enqueued : 0,
      errors,
    });
    
    // Verify the import
    const verifyResult = await pool.query('SELECT COUNT(*) FROM jobs');
    logger.info(`[VERIFY] Total jobs in database: ${verifyResult.rows[0].count}`);
    
    if (options.enqueue) {
      const queueResult = await pool.query('SELECT COUNT(*) FROM ai_job_queue');
      logger.info(`[VERIFY] Total queue items in database: ${queueResult.rows[0].count}`);
    }
  } catch (error) {
    logger.error('❌ O*NET import failed:', error);
    throw error;
  } finally {
    if (!skipPoolClose) {
      await closePool();
    }
  }
}

// Run if called directly (not when imported as a module)
if (process.argv[1]?.includes('onet-import')) {
  main().catch((error) => {
    logger.error('Script failed:', error);
    process.exit(1);
  });
}

export { main as importONet };
