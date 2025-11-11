#!/usr/bin/env tsx
/**
 * onet-import.ts
 * Imports O*NET occupation data from CSV and creates queue items
 */

import fs from 'fs';
import { parse } from 'csv-parse';
import { getPool, closePool } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import config from '../config/index.js';

interface ONetRow {
  'Job Zone': string;
  'Code': string;
  'Occupation': string;
  'Data-level': string;
}

interface ImportOptions {
  csvPath: string;
  region: string;
  enqueue: boolean;
}

async function parseCSV(filePath: string): Promise<ONetRow[]> {
  return new Promise((resolve, reject) => {
    const records: ONetRow[] = [];
    
    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, skip_empty_lines: true }))
      .on('data', (row) => records.push(row))
      .on('end', () => resolve(records))
      .on('error', reject);
  });
}

async function importJob(socCode: string, title: string, description: string): Promise<number> {
  const pool = getPool();
  
  const result = await pool.query(
    `INSERT INTO jobs ("canonicalTitle", "shortDescription", "socCode", "onetCode")
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ("socCode") DO UPDATE SET
       "canonicalTitle" = EXCLUDED."canonicalTitle",
       "shortDescription" = EXCLUDED."shortDescription",
       "onetCode" = EXCLUDED."onetCode"
     RETURNING id`,
    [title, description.substring(0, 500), socCode, socCode]
  );
  
  return result.rows[0].id;
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

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const options: ImportOptions = {
    csvPath: config.paths.onetCsv,
    region: 'US',
    enqueue: false,
  };
  
  for (const arg of args) {
    if (arg.startsWith('--csv=')) {
      options.csvPath = arg.split('=')[1];
    } else if (arg.startsWith('--region=')) {
      options.region = arg.split('=')[1];
    } else if (arg === '--enqueue' || arg === '--enqueue=all') {
      options.enqueue = true;
    }
  }
  
  logger.info('Starting O*NET import', options);
  
  try {
    // Check if file exists
    if (!fs.existsSync(options.csvPath)) {
      throw new Error(`CSV file not found: ${options.csvPath}`);
    }
    
    // Get region ID
    const regionId = await getRegionId(options.region);
    logger.info(`Using region: ${options.region} (ID: ${regionId})`);
    
    // Parse CSV
    logger.info('Parsing CSV file...');
    const records = await parseCSV(options.csvPath);
    logger.info(`Found ${records.length} occupations in CSV`);
    
    // Import each job
    let imported = 0;
    let updated = 0;
    let enqueued = 0;
    
    for (const record of records) {
      const socCode = record['Code'];
      const title = record['Occupation'];
      const jobZone = record['Job Zone'];
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
        logger.error(`Error importing job ${socCode}:`, error);
      }
    }
    
    logger.info('✅ O*NET import complete', {
      totalRecords: records.length,
      imported,
      enqueued: options.enqueue ? enqueued : 0,
    });
  } catch (error) {
    logger.error('❌ O*NET import failed:', error);
    throw error;
  } finally {
    await closePool();
  }
}

// Run if called directly
main().catch((error) => {
  logger.error('Script failed:', error);
  process.exit(1);
});

export { main as importONet };
