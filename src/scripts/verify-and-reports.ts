#!/usr/bin/env tsx
/**
 * verify-and-reports.ts
 * Auditing, validation, and reporting tools
 */

import { getPool, closePool } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import config from '../config/index.js';

interface Stats {
  totalJobs: number;
  totalQueries: number;
  completedItems: number;
  pendingItems: number;
  runningItems: number;
  errorItems: number;
  totalItems: number;
  completionRate: number;
}

async function getOverallStats(regionId?: number): Promise<Stats> {
  const pool = getPool();
  
  let whereClause = '';
  const params: any[] = [];
  
  if (regionId) {
    whereClause = 'WHERE region_id = $1';
    params.push(regionId);
  }
  
  const result = await pool.query(`
    SELECT 
      COUNT(DISTINCT job_id) as total_jobs,
      COUNT(DISTINCT query_id) as total_queries,
      COUNT(*) FILTER (WHERE status='ok') as completed,
      COUNT(*) FILTER (WHERE status='pending') as pending,
      COUNT(*) FILTER (WHERE status='running') as running,
      COUNT(*) FILTER (WHERE status='error') as errors,
      COUNT(*) as total
    FROM job_progress
    ${whereClause}
  `, params);
  
  const row = result.rows[0];
  
  return {
    totalJobs: parseInt(row.total_jobs),
    totalQueries: parseInt(row.total_queries),
    completedItems: parseInt(row.completed),
    pendingItems: parseInt(row.pending),
    runningItems: parseInt(row.running),
    errorItems: parseInt(row.errors),
    totalItems: parseInt(row.total),
    completionRate: (parseInt(row.completed) / parseInt(row.total)) * 100,
  };
}

async function getQueryStats(regionId?: number): Promise<any[]> {
  const pool = getPool();
  
  let whereClause = '';
  const params: any[] = [];
  
  if (regionId) {
    whereClause = 'WHERE jp.region_id = $1';
    params.push(regionId);
  }
  
  const result = await pool.query(`
    SELECT 
      jp.query_id,
      aq.display_name,
      COUNT(*) FILTER (WHERE jp.status='ok') as completed,
      COUNT(*) FILTER (WHERE jp.status='pending') as pending,
      COUNT(*) FILTER (WHERE jp.status='error') as errors,
      COUNT(*) as total
    FROM job_progress jp
    JOIN ai_queries aq ON jp.query_id = aq.id
    ${whereClause}
    GROUP BY jp.query_id, aq.display_name
    ORDER BY completed DESC
  `, params);
  
  return result.rows.map((row) => ({
    queryId: row.query_id,
    displayName: row.display_name,
    completed: parseInt(row.completed),
    pending: parseInt(row.pending),
    errors: parseInt(row.errors),
    total: parseInt(row.total),
    completionRate: (parseInt(row.completed) / parseInt(row.total)) * 100,
  }));
}

async function getRecentErrors(limit = 20): Promise<any[]> {
  const pool = getPool();
  
  const result = await pool.query(`
    SELECT 
      e.occurred_at,
      e.job_id,
      j."canonicalTitle" as job_title,
      e.query_id,
      aq.display_name as query_name,
      e.error
    FROM ai_errors e
    JOIN jobs j ON e.job_id = j.id
    JOIN ai_queries aq ON e.query_id = aq.id
    ORDER BY e.occurred_at DESC
    LIMIT $1
  `, [limit]);
  
  return result.rows;
}

async function getQueueStats(): Promise<any> {
  const pool = getPool();
  
  const result = await pool.query(`
    SELECT 
      status,
      COUNT(*) as count
    FROM ai_job_queue
    GROUP BY status
  `);
  
  const stats: Record<string, number> = {};
  for (const row of result.rows) {
    stats[row.status] = parseInt(row.count);
  }
  
  return stats;
}

async function audit(regionCode?: string): Promise<void> {
  logger.info('Running audit...');
  
  try {
    // Get region ID if specified
    let regionId: number | undefined;
    if (regionCode) {
      const pool = getPool();
      const result = await pool.query('SELECT id FROM regions WHERE code = $1', [regionCode]);
      if (result.rows.length > 0) {
        regionId = result.rows[0].id;
      }
    }
    
    // Overall stats
    const stats = await getOverallStats(regionId);
    logger.info('Overall Statistics:', stats);
    
    console.log('\n=== OVERALL PROGRESS ===');
    console.log(`Total Jobs: ${stats.totalJobs}`);
    console.log(`Total Queries: ${stats.totalQueries}`);
    console.log(`Completed: ${stats.completedItems} / ${stats.totalItems} (${stats.completionRate.toFixed(2)}%)`);
    console.log(`Pending: ${stats.pendingItems}`);
    console.log(`Running: ${stats.runningItems}`);
    console.log(`Errors: ${stats.errorItems}`);
    
    // Per-query stats
    const queryStats = await getQueryStats(regionId);
    console.log('\n=== PER-QUERY PROGRESS ===');
    for (const stat of queryStats) {
      console.log(`${stat.queryId.padEnd(35)} | ${stat.completed}/${stat.total} (${stat.completionRate.toFixed(1)}%)`);
    }
    
    // Queue stats
    const queueStats = await getQueueStats();
    console.log('\n=== QUEUE STATUS ===');
    console.log(JSON.stringify(queueStats, null, 2));
    
    // Recent errors
    if (stats.errorItems > 0) {
      const errors = await getRecentErrors(10);
      console.log('\n=== RECENT ERRORS (last 10) ===');
      for (const error of errors) {
        console.log(`[${error.occurred_at.toISOString()}] Job ${error.job_id} (${error.job_title}) / ${error.query_id}`);
        console.log(`  Error: ${error.error.substring(0, 100)}`);
      }
    }
    
    // Save report to file
    const reportDir = path.join(config.paths.logsDir, 'reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const reportFile = path.join(reportDir, `audit-${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(reportFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      stats,
      queryStats,
      queueStats,
      errors: await getRecentErrors(50),
    }, null, 2));
    
    logger.info(`Report saved to: ${reportFile}`);
  } catch (error) {
    logger.error('Audit failed:', error);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'audit';
  
  let regionCode: string | undefined;
  for (const arg of args) {
    if (arg.startsWith('--region=')) {
      regionCode = arg.split('=')[1];
    }
  }
  
  logger.info(`Running command: ${command}`);
  
  try {
    switch (command) {
      case 'audit':
        await audit(regionCode);
        break;
      default:
        logger.error(`Unknown command: ${command}`);
        console.log('Available commands: audit');
        process.exit(1);
    }
    
    logger.info('✅ Command completed successfully');
  } catch (error) {
    logger.error('❌ Command failed:', error);
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

export { main as verify };
