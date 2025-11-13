#!/usr/bin/env tsx
/**
 * db-setup.ts
 * Database schema initialization for Career Intelligence Pipeline
 * Creates all tables, indexes, and seeds initial data
 */

import { getPool, closePool } from '../db/connection.js';
import { logger } from '../utils/logger.js';

async function execSQL(label: string, sql: string): Promise<void> {
  const pool = getPool();
  try {
    await pool.query(sql);
    logger.info(`[OK] ${label}`);
  } catch (error) {
    logger.error(`[ERROR] ${label}:`, error);
    throw error;
  }
}

async function main() {
  logger.info('Starting database schema initialization...');

  try {
    // Extensions
    await execSQL('Extensions (uuid-ossp)', `
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    `);
    
    // Try vector extension, but don't fail if unavailable
    try {
      await execSQL('Extensions (vector)', `CREATE EXTENSION IF NOT EXISTS vector;`);
    } catch (error) {
      logger.warn('Vector extension not available - embeddings table will be skipped');
    }

    // Helper function for updated_at trigger
    await execSQL('Helper trigger function', `
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Core tables: jobs + regions
    await execSQL('Core: jobs + regions', `
      CREATE TABLE IF NOT EXISTS jobs (
        id                BIGSERIAL PRIMARY KEY,
        canonicalTitle    TEXT NOT NULL,
        shortDescription  TEXT,
        socCode           TEXT,
        onetCode          TEXT,
        jobZone           INT,
        categoryPath      TEXT[],
        hazardLevel       INT,
        UNIQUE(socCode)
      );

      CREATE TABLE IF NOT EXISTS regions (
        id     SERIAL PRIMARY KEY,
        code   TEXT UNIQUE NOT NULL,
        name   TEXT NOT NULL,
        currency TEXT DEFAULT 'USD',
        locale   TEXT DEFAULT 'en-US'
      );

      INSERT INTO regions (code, name) VALUES ('US', 'United States')
      ON CONFLICT (code) DO NOTHING;
    `);

    // AI queries catalog - Define all 39 query types
    await execSQL('AI queries catalog', `
      CREATE TABLE IF NOT EXISTS ai_queries (
        id           TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        target_table TEXT NOT NULL
      );

      INSERT INTO ai_queries (id, display_name, target_table) VALUES
        ('job-taxonomy', 'Job Taxonomy', 'job_aliases'),
        ('job-keywords', 'Keywords', 'job_keywords'),
        ('task-analysis', 'Task Analysis', 'job_task_analysis'),
        ('ai-resistance', 'AI Resistance', 'job_ai_resistance'),
        ('growth-projection', 'Growth Projection', 'job_growth'),
        ('economics-analysis', 'Economics Analysis', 'job_economics'),
        ('roi-modeling', 'ROI Modeling', 'job_roi_models'),
        ('family-economics', 'Family Economics', 'job_family_economics'),
        ('training-paths', 'Training Paths', 'job_training_paths'),
        ('licensure-requirements', 'Licensure Requirements', 'job_licensure'),
        ('compliance-flags', 'Compliance Flags', 'job_compliance_flags'),
        ('start-now', 'Start Now Steps', 'job_start_now_steps'),
        ('tools-equipment', 'Tools & Equipment', 'job_tools'),
        ('suitability', 'Suitability', 'job_suitability'),
        ('faith-alignment', 'Faith Alignment', 'job_faith_alignment'),
        ('risks', 'Risks', 'job_risks'),
        ('geographic-variations', 'Geographic Variations', 'job_geographic_variations'),
        ('industry-context', 'Industry Context', 'job_industry_context'),
        ('provenance', 'Provenance', 'job_provenance'),
        ('safety-analysis', 'Safety Analysis', 'job_safety_analysis'),
        ('regional-licensing', 'Regional Licensing', 'job_regional_licensing'),
        ('enhanced-economics', 'Enhanced Economics', 'job_enhanced_economics'),
        ('advanced-family-planning', 'Advanced Family Planning', 'job_advanced_family_planning'),
        ('college-alternatives', 'College Alternatives', 'job_college_alternatives'),
        ('portfolio-planning', 'Portfolio Planning', 'job_portfolio_planning'),
        ('daily-life', 'Daily Life', 'job_daily_life'),
        ('lesson-plans', 'Lesson Plans', 'job_lesson_plans'),
        ('market-saturation', 'Market Saturation', 'job_market_saturation'),
        ('accessibility', 'Accessibility', 'job_accessibility'),
        ('unionization', 'Unionization', 'job_unionization'),
        ('career-ladders', 'Career Ladders', 'job_career_ladders'),
        ('remote-work', 'Remote Work', 'job_remote_work'),
        ('time-flexibility', 'Time Flexibility', 'job_time_flexibility'),
        ('entrepreneurship', 'Entrepreneurship', 'job_entrepreneurship'),
        ('side-hustle', 'Side Hustle', 'job_side_hustle'),
        ('retirement-planning', 'Retirement Planning', 'job_retirement_planning'),
        ('income-stability', 'Income Stability', 'job_income_stability'),
        ('job-satisfaction', 'Job Satisfaction', 'job_satisfaction'),
        ('ai-trajectory-analysis', 'AI Trajectory Analysis', 'job_ai_trajectory')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Main AI JSON store
    await execSQL('Main AI JSON store', `
      CREATE TABLE IF NOT EXISTS career_intelligence_data (
        id            SERIAL PRIMARY KEY,
        job_id        BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
        region_id     INT REFERENCES regions(id) ON DELETE CASCADE,
        query_id      TEXT REFERENCES ai_queries(id) ON DELETE CASCADE,
        response_data JSONB NOT NULL,
        created_at    TIMESTAMPTZ DEFAULT now(),
        updated_at    TIMESTAMPTZ DEFAULT now(),
        UNIQUE(job_id, region_id, query_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_cid_job_query ON career_intelligence_data(job_id, query_id);
      
      DROP TRIGGER IF EXISTS trg_cid_updated_at ON career_intelligence_data;
      CREATE TRIGGER trg_cid_updated_at
      BEFORE UPDATE ON career_intelligence_data
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);

    // Progress/Audit/Queue tables
    await execSQL('Progress/Audit/Queue', `
      CREATE TABLE IF NOT EXISTS job_run_state (
        id          SERIAL PRIMARY KEY,
        started_at  TIMESTAMPTZ DEFAULT now(),
        finished_at TIMESTAMPTZ,
        total_jobs  INT,
        model       TEXT,
        version     TEXT,
        notes       TEXT
      );

      CREATE TABLE IF NOT EXISTS job_progress (
        job_id     BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
        region_id  INT REFERENCES regions(id) ON DELETE CASCADE DEFAULT 1,
        query_id   TEXT REFERENCES ai_queries(id) ON DELETE CASCADE,
        status     TEXT CHECK (status IN ('pending','running','ok','error')) DEFAULT 'pending',
        last_error TEXT,
        updated_at TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY(job_id, region_id, query_id)
      );
      
      DROP TRIGGER IF EXISTS trg_job_progress_updated_at ON job_progress;
      CREATE TRIGGER trg_job_progress_updated_at
      BEFORE UPDATE ON job_progress
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      CREATE TABLE IF NOT EXISTS ai_errors (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        job_id      BIGINT,
        region_id   INT,
        query_id    TEXT,
        model       TEXT,
        prompt      TEXT,
        error       TEXT,
        occurred_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS ai_job_queue (
        id         BIGSERIAL PRIMARY KEY,
        job_id     BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        region_id  INT NOT NULL REFERENCES regions(id) ON DELETE CASCADE DEFAULT 1,
        query_id   TEXT NOT NULL REFERENCES ai_queries(id) ON DELETE CASCADE,
        status     TEXT CHECK (status IN ('pending','running','ok','error')) DEFAULT 'pending',
        attempts   INT DEFAULT 0,
        priority   INT DEFAULT 100,
        last_error TEXT,
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      
      CREATE INDEX IF NOT EXISTS idx_ai_job_queue_status_priority ON ai_job_queue(status, priority);
      
      DROP TRIGGER IF EXISTS trg_ai_job_queue_updated_at ON ai_job_queue;
      CREATE TRIGGER trg_ai_job_queue_updated_at
      BEFORE UPDATE ON ai_job_queue
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);

    // Embeddings (skip if vector extension unavailable)
    try {
      await execSQL('Embeddings', `
        CREATE TABLE IF NOT EXISTS job_embeddings (
          job_id   BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
          source   TEXT,
          embedding vector(1536)
        );
      `);
    } catch (error) {
      logger.warn('Skipping embeddings table creation (vector extension not available)');
    }

    // Supporting infrastructure
    await execSQL('Prompts/Policies/Versions', `
      CREATE TABLE IF NOT EXISTS prompt_templates (
        id        TEXT PRIMARY KEY,
        purpose   TEXT,
        template  TEXT NOT NULL,
        schema    JSONB,
        version   TEXT
      );

      CREATE TABLE IF NOT EXISTS ai_run_policies (
        id            TEXT PRIMARY KEY,
        temperature   NUMERIC,
        top_p         NUMERIC,
        max_tokens    INT,
        stop          JSONB,
        notes         TEXT
      );

      CREATE TABLE IF NOT EXISTS data_versions (
        id         SERIAL PRIMARY KEY,
        namespace  TEXT,
        version    TEXT,
        released_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    // Audience layer
    await execSQL('Audience layer', `
      CREATE TABLE IF NOT EXISTS audience_profiles (
        id    SERIAL PRIMARY KEY,
        code  TEXT UNIQUE NOT NULL,
        name  TEXT NOT NULL,
        notes TEXT
      );

      INSERT INTO audience_profiles (code, name) VALUES
        ('christian_homeschool','Christian Homeschool'),
        ('secular_school','Secular School'),
        ('catholic_school','Catholic School'),
        ('job_seeker','Job Seeker / Transition'),
        ('general_public','General Public')
      ON CONFLICT (code) DO NOTHING;

      CREATE TABLE IF NOT EXISTS job_audience_overrides (
        id            BIGSERIAL PRIMARY KEY,
        job_id        BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
        audience_code TEXT REFERENCES audience_profiles(code),
        field_path    TEXT NOT NULL,
        override_value JSONB NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_job_audience_overrides_job ON job_audience_overrides(job_id);
    `);

    // i18n
    await execSQL('i18n', `
      CREATE TABLE IF NOT EXISTS i18n_strings (
        key   TEXT PRIMARY KEY,
        default_text TEXT NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS i18n_translations (
        key    TEXT REFERENCES i18n_strings(key) ON DELETE CASCADE,
        locale TEXT,
        text   TEXT,
        PRIMARY KEY(key, locale)
      );
    `);

    // Create all normalized tables for the 38 query types
    await createNormalizedTables();

    logger.info('✅ Database schema initialization completed successfully');
  } catch (error) {
    logger.error('❌ Database schema initialization failed:', error);
    throw error;
  } finally {
    await closePool();
  }
}

async function createNormalizedTables() {
  // Core Identity (1-3)
  await execSQL('Normalized tables: Core Identity', `
    CREATE TABLE IF NOT EXISTS job_aliases (
      id     SERIAL PRIMARY KEY,
      job_id BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
      alias  TEXT
    );

    CREATE TABLE IF NOT EXISTS job_source_maps (
      id       SERIAL PRIMARY KEY,
      job_id   BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
      source   TEXT,
      source_id TEXT
    );

    CREATE TABLE IF NOT EXISTS job_keywords (
      id     SERIAL PRIMARY KEY,
      job_id BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
      keyword TEXT NOT NULL,
      kind   TEXT CHECK (kind IN ('skill','tool','task','context','software','cert','industry','synonym','value_tag')) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_job_keywords_job_kind ON job_keywords(job_id, kind);

    CREATE TABLE IF NOT EXISTS job_task_analysis (
      id     SERIAL PRIMARY KEY,
      job_id BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
      task   TEXT NOT NULL,
      manual NUMERIC,
      tool_use NUMERIC,
      paperwork NUMERIC,
      pattern_rec NUMERIC,
      creative NUMERIC,
      empathy_ethics NUMERIC,
      compliance NUMERIC
    );
  `);

  // Future Viability (4-5)
  await execSQL('Normalized tables: Future Viability', `
    CREATE TABLE IF NOT EXISTS job_ai_resistance (
      id     SERIAL PRIMARY KEY,
      job_id BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
      horizon_years INT,
      resistance_pct NUMERIC,
      ci_low NUMERIC,
      ci_high NUMERIC
    );

    CREATE TABLE IF NOT EXISTS job_growth (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      entry_window TEXT,
      status TEXT CHECK (status IN ('growing','flat','declining')),
      projected_growth_pct NUMERIC,
      confidence NUMERIC
    );
  `);

  // Financial Analysis (6-8)
  await execSQL('Normalized tables: Financial Analysis', `
    CREATE TABLE IF NOT EXISTS job_economics (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      current_median_income NUMERIC,
      y5 NUMERIC, y10 NUMERIC, y15 NUMERIC,
      y1 NUMERIC, y3 NUMERIC, y5_prog NUMERIC, y10_prog NUMERIC,
      tuition_cost NUMERIC,
      startup_cost_low NUMERIC,
      startup_cost_high NUMERIC,
      geo_adjusted BOOLEAN DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS job_roi_models (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      college_cost_all_in NUMERIC,
      expected_debt_after_college NUMERIC,
      trade_startup_cost_low NUMERIC,
      trade_startup_cost_high NUMERIC,
      trade_income_y1 NUMERIC,
      trade_income_y3 NUMERIC,
      break_even_year INT
    );

    CREATE TABLE IF NOT EXISTS job_family_economics (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      target_family_budget NUMERIC,
      time_to_afford_trade_years NUMERIC,
      time_to_afford_college_years NUMERIC,
      monthly_debt_payment_college NUMERIC
    );
  `);

  // Education & Training (9-12)
  await execSQL('Normalized tables: Education & Training', `
    CREATE TABLE IF NOT EXISTS job_training_paths (
      id     SERIAL PRIMARY KEY,
      job_id BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
      pathway TEXT,
      months_min INT,
      months_max INT,
      age_min INT,
      description TEXT,
      cost_low NUMERIC,
      cost_high NUMERIC
    );

    CREATE TABLE IF NOT EXISTS job_licensure (
      id     SERIAL PRIMARY KEY,
      job_id BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
      region_code TEXT DEFAULT 'US',
      license_name TEXT,
      board_name TEXT,
      requirements TEXT
    );

    CREATE TABLE IF NOT EXISTS job_compliance_flags (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      vaccine_req SMALLINT,
      drug_test SMALLINT,
      background_check SMALLINT,
      minor_hours_restrictions TEXT,
      required_safety_certs TEXT,
      child_protection_clearances TEXT
    );

    CREATE TABLE IF NOT EXISTS job_start_now_steps (
      id     SERIAL PRIMARY KEY,
      job_id BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
      age_band TEXT,
      step_order INT,
      step TEXT
    );
  `);

  // Personal Fit (13-16)
  await execSQL('Normalized tables: Personal Fit', `
    CREATE TABLE IF NOT EXISTS job_tools (
      id     SERIAL PRIMARY KEY,
      job_id BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
      tier TEXT CHECK (tier IN ('starter','pro')),
      item TEXT,
      cost_low NUMERIC,
      cost_high NUMERIC
    );

    CREATE TABLE IF NOT EXISTS job_suitability (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      work_contexts JSONB,
      aptitudes JSONB,
      value_tags JSONB
    );

    CREATE TABLE IF NOT EXISTS job_faith_alignment (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      service_notes TEXT,
      scriptures JSONB,
      integration_notes TEXT
    );

    CREATE TABLE IF NOT EXISTS job_risks (
      id     SERIAL PRIMARY KEY,
      job_id BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
      risk   TEXT,
      category TEXT
    );
  `);

  // Market Intelligence (17-19)
  await execSQL('Normalized tables: Market Intelligence', `
    CREATE TABLE IF NOT EXISTS job_geographic_variations (
      id     SERIAL PRIMARY KEY,
      job_id BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
      region TEXT,
      avg_salary NUMERIC,
      col_adj NUMERIC,
      growth_outlook TEXT,
      licensing_notes TEXT,
      market_notes TEXT
    );

    CREATE TABLE IF NOT EXISTS job_industry_context (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      primary_industries JSONB,
      secondary_industries JSONB,
      emerging JSONB,
      declining JSONB,
      seasonal JSONB,
      cross_industry JSONB
    );

    CREATE TABLE IF NOT EXISTS job_provenance (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      sources JSONB,
      last_refreshed TIMESTAMPTZ,
      schema_version TEXT,
      quality_notes TEXT,
      methodology_summary TEXT,
      assumptions JSONB,
      model_version TEXT
    );
  `);

  // Extended modules (20-38)
  await execSQL('Normalized tables: Extended modules (20-28)', `
    CREATE TABLE IF NOT EXISTS job_safety_analysis (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      hazard_level INT,
      physical_hazards JSONB,
      osha_requirements JSONB,
      safety_training JSONB,
      ppe JSONB,
      regional_regs JSONB,
      psychosocial_risks JSONB
    );

    CREATE TABLE IF NOT EXISTS job_regional_licensing (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      federal_required JSONB,
      federal_optional JSONB,
      orgs JSONB,
      state_by_state JSONB,
      industry_certs JSONB
    );

    CREATE TABLE IF NOT EXISTS job_enhanced_economics (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      industry_salary_variations JSONB,
      company_size_impact JSONB,
      benefits JSONB,
      mobility_timeline JSONB,
      recession_resilience JSONB
    );

    CREATE TABLE IF NOT EXISTS job_advanced_family_planning (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      single_income_feasibility JSONB,
      dual_income_model JSONB,
      childcare_impact JSONB,
      homeschool_compatibility JSONB,
      eldercare_compatibility JSONB
    );

    CREATE TABLE IF NOT EXISTS job_college_alternatives (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      apprenticeships JSONB,
      boot_camps JSONB,
      online_certs JSONB,
      military_paths JSONB,
      comparison_notes TEXT
    );

    CREATE TABLE IF NOT EXISTS job_portfolio_planning (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      student_projects JSONB,
      freelance_gigs JSONB,
      competitions JSONB,
      credentialing_paths JSONB
    );

    CREATE TABLE IF NOT EXISTS job_daily_life (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      typical_day TEXT,
      schedule_variability TEXT,
      physical_demands TEXT,
      social_environment TEXT,
      travel_requirements TEXT
    );

    CREATE TABLE IF NOT EXISTS job_lesson_plans (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      units JSONB,
      hands_on_projects JSONB,
      field_trips JSONB,
      mentorship_ideas JSONB
    );

    CREATE TABLE IF NOT EXISTS job_market_saturation (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      current_saturation_level TEXT,
      barriers_to_entry JSONB,
      competitive_landscape TEXT,
      demand_vs_supply TEXT
    );
  `);

  await execSQL('Normalized tables: Extended modules (29-38)', `
    CREATE TABLE IF NOT EXISTS job_accessibility (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      mobility_accommodations JSONB,
      sensory_considerations JSONB,
      cognitive_demands JSONB,
      adaptive_tech JSONB
    );

    CREATE TABLE IF NOT EXISTS job_unionization (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      union_presence TEXT,
      major_unions JSONB,
      benefits_summary TEXT,
      right_to_work_impact TEXT
    );

    CREATE TABLE IF NOT EXISTS job_career_ladders (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      entry_roles JSONB,
      mid_career JSONB,
      senior_roles JSONB,
      lateral_moves JSONB
    );

    CREATE TABLE IF NOT EXISTS job_remote_work (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      remote_feasibility TEXT,
      hybrid_models JSONB,
      required_on_site JSONB,
      digital_nomad_compatible BOOLEAN
    );

    CREATE TABLE IF NOT EXISTS job_time_flexibility (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      shift_options JSONB,
      seasonal_variations TEXT,
      overtime_expectations TEXT,
      part_time_feasibility TEXT
    );

    CREATE TABLE IF NOT EXISTS job_entrepreneurship (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      business_models JSONB,
      startup_requirements JSONB,
      scalability TEXT,
      competition_notes TEXT
    );

    CREATE TABLE IF NOT EXISTS job_side_hustle (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      feasibility TEXT,
      income_potential JSONB,
      time_commitment TEXT,
      platforms JSONB
    );

    CREATE TABLE IF NOT EXISTS job_retirement_planning (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      pension_availability TEXT,
      retirement_accounts JSONB,
      longevity_feasibility TEXT,
      transition_strategies JSONB
    );

    CREATE TABLE IF NOT EXISTS job_income_stability (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      income_predictability TEXT,
      recession_impact JSONB,
      seasonal_fluctuations TEXT,
      diversification_options JSONB
    );

    CREATE TABLE IF NOT EXISTS job_satisfaction (
      job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      satisfaction_scores JSONB,
      burnout_risk TEXT,
      meaning_purpose TEXT,
      work_life_balance TEXT
    );
  `);
}

// Run if called directly (not when imported as a module)
if (process.argv[1]?.includes('db-setup')) {
  main().catch((error) => {
    logger.error('Script failed:', error);
    process.exit(1);
  });
}

export { main as setupDatabase };
