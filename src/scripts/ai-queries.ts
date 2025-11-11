#!/usr/bin/env tsx
/**
 * ai-queries.ts
 * Seeds all 38 prompt templates and run policies into database
 */

import { getPool, closePool } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { promptTemplates, runPolicies } from './ai-queries-schemas.js';

async function upsertPrompt(id: string, purpose: string, template: string, schema: any, version: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO prompt_templates (id, purpose, template, schema, version)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       purpose = EXCLUDED.purpose,
       template = EXCLUDED.template,
       schema = EXCLUDED.schema,
       version = EXCLUDED.version`,
    [id, purpose, template, JSON.stringify(schema), version]
  );
  logger.info(`[OK] Upserted prompt template: ${id}`);
}

async function upsertPolicy(policy: typeof runPolicies[0]): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO ai_run_policies (id, temperature, top_p, max_tokens, stop, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       temperature = EXCLUDED.temperature,
       top_p = EXCLUDED.top_p,
       max_tokens = EXCLUDED.max_tokens,
       stop = EXCLUDED.stop,
       notes = EXCLUDED.notes`,
    [policy.id, policy.temperature, policy.top_p, policy.max_tokens, JSON.stringify(policy.stop), policy.notes]
  );
  logger.info(`[OK] Upserted policy: ${policy.id}`);
}

async function main() {
  logger.info('Installing AI prompts and policies...');

  try {
    // Install policies
    for (const policy of runPolicies) {
      await upsertPolicy(policy);
    }

    // Install all prompt templates
    for (const tpl of promptTemplates) {
      await upsertPrompt(tpl.id, tpl.purpose, tpl.template, tpl.schema, tpl.version);
    }

    logger.info(`✅ Successfully installed ${runPolicies.length} policies and ${promptTemplates.length} prompt templates`);
  } catch (error) {
    logger.error('❌ Failed to install prompts:', error);
    throw error;
  } finally {
    await closePool();
  }
}

// Run if called directly (not when imported as a module)
if (process.argv[1]?.includes('ai-queries')) {
  main().catch((error) => {
    logger.error('Script failed:', error);
    process.exit(1);
  });
}

export { main as installPrompts };
