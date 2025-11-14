/**
 * JSON Schema definitions for all 39 AI queries
 * Separated for maintainability
 */

export interface SchemaCommon {
  job: {
    canonical_title: string;
    soc_code: string;
    region_code: string;
  };
  provenance: {
    methodology: string;
    sources: string[];
    assumptions: string[];
    confidence?: number;
    model_version?: string;
  };
}

const SCHEMA_COMMON_JOB = {
  type: 'object',
  properties: {
    canonical_title: { type: 'string' },
    soc_code: { type: 'string' },
    region_code: { type: 'string' },
  },
  required: ['canonical_title', 'soc_code', 'region_code'],
  additionalProperties: true,
};

const SCHEMA_COMMON_PROVENANCE = {
  type: 'object',
  properties: {
    methodology: { type: 'string' },
    sources: { type: 'array', items: { type: 'string' } },
    assumptions: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
    model_version: { type: 'string' },
  },
  required: ['methodology', 'sources', 'assumptions'],
  additionalProperties: true,
};

export const createTopLevelSchema = (dataProperties: any) => ({
  type: 'object',
  properties: {
    query_id: { type: 'string' },
    job: SCHEMA_COMMON_JOB,
    data: dataProperties,
    provenance: SCHEMA_COMMON_PROVENANCE,
  },
  required: ['query_id', 'job', 'data', 'provenance'],
  additionalProperties: false,
});

export const baseTemplate = (queryId: string, body: string): string => {
  const header = `You are an expert labor-market analyst and career educator. OUTPUT STRICTLY VALID JSON ONLY.
Audience: neutral and inclusive; when audience-specific, follow exactly the query brief.
Job: "{{canonical_title}}" (SOC: {{soc_code}}) | Region: {{region_code}} | Date: {{today}} | Currency: {{currency}}
Return JSON with keys: query_id, job, data, provenance. Do not include commentary, markdown, or code fences.`;

  return `${header}\n\n${body}\n\nReturn ONLY the JSON object.`;
};

export interface PromptTemplate {
  id: string;
  purpose: string;
  version: string;
  template: string;
  schema: any;
}

export interface RunPolicy {
  id: string;
  temperature: number;
  top_p: number;
  max_tokens: number;
  stop: string[] | null;
  notes: string;
}

export const runPolicies: RunPolicy[] = [
  {
    id: 'default.lowtemp',
    temperature: 0.25,
    top_p: 0.9,
    max_tokens: 3500,
    stop: null,
    notes: 'Deterministic-leaning outputs for structured JSON across all career queries.',
  },
  {
    id: 'econ.lowtemp',
    temperature: 0.2,
    top_p: 0.9,
    max_tokens: 3500,
    stop: null,
    notes: 'Economics-related queries. Low temp; discourage speculation.',
  },
  {
    id: 'creative.moderate',
    temperature: 0.35,
    top_p: 0.9,
    max_tokens: 3500,
    stop: null,
    notes: 'Slightly more freedom for lesson plans / portfolio ideas, still JSON-structured.',
  },
  {
    id: 'ai-analysis.extended',
    temperature: 0.3,
    top_p: 0.9,
    max_tokens: 6000,
    stop: null,
    notes: 'Extended token limit for AI trajectory analysis (1200-1800 word brutally honest responses).',
  },
];

// All 38 prompt templates with their schemas
export const promptTemplates: PromptTemplate[] = [
  // 1. Job Taxonomy
  {
    id: 'job-taxonomy',
    purpose: 'Standardize title, aliases, classification, brief description, hazard estimate.',
    version: '1.0.0',
    template: baseTemplate('job-taxonomy', `TASK:
Produce canonical title, up to 10 aliases, SOC and ISCO if known, category path (broad→narrow), brief description (<= 60 words), and hazard_level 0–3 (0 none, 3 high) for the job.
DATA RULES:
- Prefer O*NET for SOC mapping precision.
- Category path is a small ordered list (2–4 elements max).`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        canonical_title: { type: 'string' },
        aliases: { type: 'array', items: { type: 'string' } },
        soc_code: { type: 'string' },
        isco_code: { type: 'string' },
        category_path: { type: 'array', items: { type: 'string' } },
        brief_description: { type: 'string' },
        hazard_level: { type: 'integer', minimum: 0, maximum: 3 },
      },
      required: ['canonical_title', 'category_path', 'brief_description', 'hazard_level'],
      additionalProperties: true,
    }),
  },

  // 2. Keywords
  {
    id: 'job-keywords',
    purpose: 'Extract skills/tools/tasks/contexts/software/certs/industries/value tags.',
    version: '1.0.0',
    template: baseTemplate('job-keywords', `TASK:
List multi-bucket keywords (strings). Minimums: skills(5+), tools(4+), tasks(4+), contexts(3+), software(3+), certs(2+), industries(3+).
Include value_tags like "debt_free","early_income","service","work_life_balance".`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        skills: { type: 'array', items: { type: 'string' } },
        tools: { type: 'array', items: { type: 'string' } },
        tasks: { type: 'array', items: { type: 'string' } },
        contexts: { type: 'array', items: { type: 'string' } },
        software: { type: 'array', items: { type: 'string' } },
        certifications: { type: 'array', items: { type: 'string' } },
        industries: { type: 'array', items: { type: 'string' } },
        value_tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['skills', 'tools', 'tasks', 'contexts', 'software', 'certifications', 'industries'],
      additionalProperties: false,
    }),
  },

  // 3. Task Analysis
  {
    id: 'task-analysis',
    purpose: 'Score 4–8 core tasks across seven 0.0–1.0 dimensions.',
    version: '1.1.0',
    template: baseTemplate('task-analysis', `TASK:
Pick 4–8 essential tasks (prioritize the most important/frequent ones) and score each: manual, tool_use, paperwork, pattern_rec, creative, empathy_ethics, compliance (0.0–1.0).
Provide a diverse range of tasks that represent the full scope of this occupation.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              task: { type: 'string' },
              manual: { type: 'number', minimum: 0, maximum: 1 },
              tool_use: { type: 'number', minimum: 0, maximum: 1 },
              paperwork: { type: 'number', minimum: 0, maximum: 1 },
              pattern_rec: { type: 'number', minimum: 0, maximum: 1 },
              creative: { type: 'number', minimum: 0, maximum: 1 },
              empathy_ethics: { type: 'number', minimum: 0, maximum: 1 },
              compliance: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['task', 'manual', 'tool_use', 'paperwork', 'pattern_rec', 'creative', 'empathy_ethics', 'compliance'],
            additionalProperties: false,
          },
          minItems: 4,
          maxItems: 8,
        },
      },
      required: ['tasks'],
      additionalProperties: false,
    }),
  },

  // 4. AI Resistance
  {
    id: 'ai-resistance',
    purpose: 'Forecast automation resistance at 0,1,2,3,4,5,6,10,15 years with CI bounds.',
    version: '1.0.0',
    template: baseTemplate('ai-resistance', `TASK:
For horizons [0,1,2,3,4,5,6,10,15], provide resistance_pct (0–100) and ci_low/ci_high.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        forecasts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              horizon_years: { type: 'integer' },
              resistance_pct: { type: 'number', minimum: 0, maximum: 100 },
              ci_low: { type: 'number', minimum: 0, maximum: 100 },
              ci_high: { type: 'number', minimum: 0, maximum: 100 },
            },
            required: ['horizon_years', 'resistance_pct', 'ci_low', 'ci_high'],
            additionalProperties: false,
          },
          minItems: 9,
        },
      },
      required: ['forecasts'],
      additionalProperties: false,
    }),
  },

  // 5. Growth Projection
  {
    id: 'growth-projection',
    purpose: 'Status (growing/flat/declining), projected growth %, confidence (0.0–1.0), entry window.',
    version: '1.0.0',
    template: baseTemplate('growth-projection', `TASK:
Assess growth status, projected_growth_pct (can be negative), confidence (0.0–1.0), and entry_window (e.g., "2031-2038").`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['growing', 'flat', 'declining'] },
        projected_growth_pct: { type: 'number' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        entry_window: { type: 'string' },
      },
      required: ['status', 'projected_growth_pct', 'confidence', 'entry_window'],
      additionalProperties: false,
    }),
  },

  // 6. Economics Analysis
  {
    id: 'economics-analysis',
    purpose: 'Median income, progression Y1/Y3/Y5/Y10, future Y5/Y10/Y15, tuition and startup costs.',
    version: '1.0.0',
    template: baseTemplate('economics-analysis', `TASK:
Provide incomes: current_median, progression (y1,y3,y5,y10), projections (Y5,Y10,Y15), tuition_cost (if applicable), startup_cost_low/high (trade path).
Use {{currency}}.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        current_median_income: { type: 'number' },
        progression: {
          type: 'object',
          properties: {
            y1: { type: 'number' },
            y3: { type: 'number' },
            y5: { type: 'number' },
            y10: { type: 'number' },
          },
          required: ['y1', 'y3', 'y5', 'y10'],
          additionalProperties: false,
        },
        projections: {
          type: 'object',
          properties: {
            y5: { type: 'number' },
            y10: { type: 'number' },
            y15: { type: 'number' },
          },
          required: ['y5', 'y10', 'y15'],
          additionalProperties: false,
        },
        tuition_cost: { type: 'number' },
        startup_cost_low: { type: 'number' },
        startup_cost_high: { type: 'number' },
      },
      required: ['current_median_income', 'progression', 'projections'],
      additionalProperties: false,
    }),
  },

  // 7. ROI Modeling
  {
    id: 'roi-modeling',
    purpose: 'Compare college vs trade: costs, debts, early income, break-even year.',
    version: '1.0.0',
    template: baseTemplate('roi-modeling', `TASK:
Compare two paths: college vs trade.
Report: college_cost_all_in, expected_debt_after_college, trade_startup_cost_low/high, trade_income_y1/y3, and computed break_even_year.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        college_cost_all_in: { type: 'number' },
        expected_debt_after_college: { type: 'number' },
        trade_startup_cost_low: { type: 'number' },
        trade_startup_cost_high: { type: 'number' },
        trade_income_y1: { type: 'number' },
        trade_income_y3: { type: 'number' },
        break_even_year: { type: 'integer' },
      },
      required: ['college_cost_all_in', 'expected_debt_after_college', 'trade_startup_cost_low', 'trade_startup_cost_high', 'trade_income_y1', 'trade_income_y3', 'break_even_year'],
      additionalProperties: false,
    }),
  },

  // 8. Family Economics
  {
    id: 'family-economics',
    purpose: 'Time to afford target family budget; monthly debt payments for college route.',
    version: '1.0.0',
    template: baseTemplate('family-economics', `TASK:
Given a target family budget (pick a US-median benchmark in {{currency}}), estimate:
- time_to_afford_trade_years
- time_to_afford_college_years
- monthly_debt_payment_college (if college route)`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        target_family_budget: { type: 'number' },
        time_to_afford_trade_years: { type: 'number' },
        time_to_afford_college_years: { type: 'number' },
        monthly_debt_payment_college: { type: 'number' },
      },
      required: ['target_family_budget', 'time_to_afford_trade_years', 'time_to_afford_college_years'],
      additionalProperties: false,
    }),
  },

  // 9. Training Paths
  {
    id: 'training-paths',
    purpose: 'Multiple routes: apprenticeship, 2yr, 4yr, certificate, self-taught, military.',
    version: '1.0.0',
    template: baseTemplate('training-paths', `TASK:
For each applicable pathway (apprenticeship, 2yr trade, 4yr degree, certificate, self-taught, military):
- months_min, months_max, age_min, description, cost_low/high`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              pathway: { type: 'string' },
              months_min: { type: 'integer' },
              months_max: { type: 'integer' },
              age_min: { type: 'integer' },
              description: { type: 'string' },
              cost_low: { type: 'number' },
              cost_high: { type: 'number' },
            },
            required: ['pathway', 'months_min', 'months_max', 'description'],
            additionalProperties: false,
          },
        },
      },
      required: ['paths'],
      additionalProperties: false,
    }),
  },

  // 10. Licensure Requirements
  {
    id: 'licensure-requirements',
    purpose: 'License names by state/region, boards, key requirements.',
    version: '1.0.0',
    template: baseTemplate('licensure-requirements', `TASK:
Summarize licensure landscape for {{region_code}} (US): include national/federal elements and notable state variations.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        national: {
          type: 'object',
          properties: {
            licenses: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  license_name: { type: 'string' },
                  board_name: { type: 'string' },
                  requirements: { type: 'string' },
                },
                required: ['license_name'],
              },
            },
          },
          required: ['licenses'],
        },
        states: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              state: { type: 'string' },
              licenses: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    license_name: { type: 'string' },
                    board_name: { type: 'string' },
                    requirements: { type: 'string' },
                  },
                  required: ['license_name'],
                },
              },
            },
            required: ['state', 'licenses'],
          },
        },
      },
      required: ['national'],
      additionalProperties: false,
    }),
  },

  // 11. Compliance Flags
  {
    id: 'compliance-flags',
    purpose: 'Vaccine/drug/background likelihoods, minor hours, safety certs, child-protection notes.',
    version: '1.0.0',
    template: baseTemplate('compliance-flags', `TASK:
Provide likelihoods (0 none, 1 sometimes, 2 mandatory) for vaccine, drug test, background check; plus minor_hours_restrictions, required_safety_certs, child_protection_clearances.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        vaccine_req: { type: 'integer', minimum: 0, maximum: 2 },
        drug_test: { type: 'integer', minimum: 0, maximum: 2 },
        background_check: { type: 'integer', minimum: 0, maximum: 2 },
        minor_hours_restrictions: { type: 'string' },
        required_safety_certs: { type: 'string' },
        child_protection_clearances: { type: 'string' },
      },
      required: ['vaccine_req', 'drug_test', 'background_check'],
      additionalProperties: false,
    }),
  },

  // 12. Start Now
  {
    id: 'start-now',
    purpose: 'Ordered, age-specific steps (12–13, 14, 15–16, 17–18).',
    version: '1.0.0',
    template: baseTemplate('start-now', `TASK:
Provide age-specific, ordered steps for age bands: 12-13, 14, 15-16, 17-18.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              age_band: { type: 'string' },
              items: { type: 'array', items: { type: 'string' } },
            },
            required: ['age_band', 'items'],
          },
          minItems: 4,
        },
      },
      required: ['steps'],
      additionalProperties: false,
    }),
  },

  // 13. Tools & Equipment
  {
    id: 'tools-equipment',
    purpose: 'List essential tools, equipment, software with typical costs and skill requirements.',
    version: '1.1.0',
    template: baseTemplate('tools-equipment', `TASK:
List essential tools, equipment, and software used in this job with typical costs.
For each item, indicate the skill_level required to master it: 'low' (days/weeks), 'medium' (months), or 'high' (years).`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              category: { type: 'string' },
              typical_cost: { type: 'number' },
              required: { type: 'boolean' },
              skill_level: { type: 'string', enum: ['low', 'medium', 'high'] },
            },
            required: ['name', 'category', 'skill_level'],
          },
        },
      },
      required: ['items'],
    }),
  },

  // 14. Suitability
  {
    id: 'suitability',
    purpose: 'Who thrives, who struggles, personality fit.',
    version: '1.0.0',
    template: baseTemplate('suitability', `TASK:
Describe who thrives in this job, who struggles, and key personality traits.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        thrives: { type: 'array', items: { type: 'string' } },
        struggles: { type: 'array', items: { type: 'string' } },
        personality_traits: { type: 'array', items: { type: 'string' } },
      },
      required: ['thrives', 'struggles', 'personality_traits'],
    }),
  },

  // 15. Faith Alignment
  {
    id: 'faith-alignment',
    purpose: 'Christian worldview compatibility analysis.',
    version: '1.0.0',
    template: baseTemplate('faith-alignment', `TASK:
Assess this job's compatibility with Christian faith values. Provide alignment_score (0-10), opportunities for ministry/service, and potential conflicts.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        alignment_score: { type: 'integer', minimum: 0, maximum: 10 },
        opportunities: { type: 'array', items: { type: 'string' } },
        potential_conflicts: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
      },
      required: ['alignment_score', 'opportunities', 'potential_conflicts'],
    }),
  },

  // 16. Risks
  {
    id: 'risks',
    purpose: 'Physical, mental, financial, and career risks.',
    version: '1.0.0',
    template: baseTemplate('risks', `TASK:
Identify physical, mental, financial, and career risks with severity scores (0-10).`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        physical_risks: { type: 'array', items: { type: 'object', properties: { risk: { type: 'string' }, severity: { type: 'integer', minimum: 0, maximum: 10 } }, required: ['risk', 'severity'] } },
        mental_risks: { type: 'array', items: { type: 'object', properties: { risk: { type: 'string' }, severity: { type: 'integer', minimum: 0, maximum: 10 } }, required: ['risk', 'severity'] } },
        financial_risks: { type: 'array', items: { type: 'string' } },
        career_risks: { type: 'array', items: { type: 'string' } },
      },
      required: ['physical_risks', 'mental_risks'],
    }),
  },

  // 17. Geographic Variations
  {
    id: 'geographic-variations',
    purpose: 'Regional differences in demand, pay, culture, plus top metro areas.',
    version: '1.1.0',
    template: baseTemplate('geographic-variations', `TASK:
Describe how this job varies by region (urban vs rural, different states/areas).
Also provide top_metros: List 5-10 major US metro areas where this occupation thrives, with:
- city: Metro area name (e.g., "San Francisco, CA" or "Austin, TX")
- demand_level: high/medium/low
- salary_range: Typical salary range in that metro (e.g., "$75,000-$120,000")
- notes: Any unique characteristics of this job in that metro`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        variations: { 
          type: 'array', 
          items: { 
            type: 'object', 
            properties: { 
              region: { type: 'string' }, 
              demand: { type: 'string' }, 
              pay_difference: { type: 'string' }, 
              notes: { type: 'string' } 
            }, 
            required: ['region'] 
          } 
        },
        top_metros: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              city: { type: 'string' },
              demand_level: { type: 'string', enum: ['high', 'medium', 'low'] },
              salary_range: { type: 'string' },
              notes: { type: 'string' },
            },
            required: ['city', 'demand_level', 'salary_range'],
          },
          minItems: 5,
          maxItems: 10,
        },
      },
      required: ['variations', 'top_metros'],
    }),
  },

  // 18. Industry Context
  {
    id: 'industry-context',
    purpose: 'Industry trends, major employers, market dynamics.',
    version: '1.0.0',
    template: baseTemplate('industry-context', `TASK:
Provide industry trends, major employers, and market dynamics for this occupation.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        trends: { type: 'array', items: { type: 'string' } },
        major_employers: { type: 'array', items: { type: 'string' } },
        market_dynamics: { type: 'string' },
      },
      required: ['trends'],
    }),
  },

  // 19. Provenance
  {
    id: 'provenance',
    purpose: 'Data sources and methodology documentation.',
    version: '1.0.0',
    template: baseTemplate('provenance', `TASK:
Document data sources, methodology, and confidence for this career analysis.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        primary_sources: { type: 'array', items: { type: 'string' } },
        methodology_notes: { type: 'string' },
        confidence_level: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['primary_sources', 'confidence_level'],
    }),
  },

  // 20. Safety Analysis
  {
    id: 'safety-analysis',
    purpose: 'Workplace safety, injury rates, protective measures.',
    version: '1.0.0',
    template: baseTemplate('safety-analysis', `TASK:
Analyze workplace safety: injury rates, common hazards, protective equipment, safety training.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        injury_rate_score: { type: 'integer', minimum: 0, maximum: 10 },
        common_hazards: { type: 'array', items: { type: 'string' } },
        protective_equipment: { type: 'array', items: { type: 'string' } },
        safety_training_required: { type: 'boolean' },
      },
      required: ['injury_rate_score', 'common_hazards'],
    }),
  },

  // 21. Regional Licensing
  {
    id: 'regional-licensing',
    purpose: 'State-by-state licensing variations.',
    version: '1.0.0',
    template: baseTemplate('regional-licensing', `TASK:
Provide detailed state-by-state licensing requirements and reciprocity information.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        has_reciprocity: { type: 'boolean' },
        state_details: { type: 'array', items: { type: 'object', properties: { state: { type: 'string' }, requirements: { type: 'string' } }, required: ['state'] } },
      },
      required: ['has_reciprocity'],
    }),
  },

  // 22. Enhanced Economics
  {
    id: 'enhanced-economics',
    purpose: 'Detailed economic analysis including benefits, bonuses, total compensation.',
    version: '1.0.0',
    template: baseTemplate('enhanced-economics', `TASK:
Provide comprehensive compensation: base salary, benefits value, bonuses, total compensation packages.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        base_salary_median: { type: 'number' },
        benefits_value_annual: { type: 'number' },
        bonus_potential: { type: 'string' },
        total_comp_median: { type: 'number' },
      },
      required: ['base_salary_median'],
    }),
  },

  // 23. Advanced Family Planning
  {
    id: 'advanced-family-planning',
    purpose: 'Long-term family economics, multiple children, college savings.',
    version: '1.0.0',
    template: baseTemplate('advanced-family-planning', `TASK:
Analyze long-term family affordability: raising multiple children, saving for college, family milestones.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        children_affordable: { type: 'integer' },
        college_savings_feasible: { type: 'boolean' },
        family_milestones: { type: 'array', items: { type: 'string' } },
      },
      required: ['children_affordable', 'college_savings_feasible'],
    }),
  },

  // 24. College Alternatives
  {
    id: 'college-alternatives',
    purpose: 'Non-degree pathways: bootcamps, apprenticeships, self-study.',
    version: '1.0.0',
    template: baseTemplate('college-alternatives', `TASK:
List alternative pathways to this career without a 4-year degree.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        alternatives: { type: 'array', items: { type: 'object', properties: { pathway: { type: 'string' }, duration: { type: 'string' }, cost: { type: 'number' }, viability: { type: 'string' } }, required: ['pathway'] } },
      },
      required: ['alternatives'],
    }),
  },

  // 25. Portfolio Planning
  {
    id: 'portfolio-planning',
    purpose: 'Career combinations, side income, skill stacking.',
    version: '1.0.0',
    template: baseTemplate('portfolio-planning', `TASK:
Suggest complementary careers, side businesses, and skill combinations.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        complementary_careers: { type: 'array', items: { type: 'string' } },
        side_income_ideas: { type: 'array', items: { type: 'string' } },
        skill_stacks: { type: 'array', items: { type: 'string' } },
      },
      required: ['complementary_careers'],
    }),
  },

  // 26. Daily Life
  {
    id: 'daily-life',
    purpose: 'Typical day, schedule, work environment.',
    version: '1.0.0',
    template: baseTemplate('daily-life', `TASK:
Describe a typical workday including schedule, environment, and daily activities.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        typical_schedule: { type: 'string' },
        work_environment: { type: 'string' },
        daily_activities: { type: 'array', items: { type: 'string' } },
      },
      required: ['typical_schedule', 'daily_activities'],
    }),
  },

  // 27. Lesson Plans
  {
    id: 'lesson-plans',
    purpose: 'Educational resources for teaching about this career.',
    version: '1.0.0',
    template: baseTemplate('lesson-plans', `TASK:
Create lesson plan ideas for teaching students about this career (grades 6-12).`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        lessons: { type: 'array', items: { type: 'object', properties: { grade_level: { type: 'string' }, title: { type: 'string' }, activities: { type: 'array', items: { type: 'string' } } }, required: ['grade_level', 'title'] } },
      },
      required: ['lessons'],
    }),
  },

  // 28. Market Saturation
  {
    id: 'market-saturation',
    purpose: 'Competition analysis, job availability, market conditions.',
    version: '1.0.0',
    template: baseTemplate('market-saturation', `TASK:
Analyze market saturation: competition level, job availability, barriers to entry.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        saturation_score: { type: 'integer', minimum: 0, maximum: 10 },
        competition_level: { type: 'string' },
        job_availability: { type: 'string' },
        barriers_to_entry: { type: 'array', items: { type: 'string' } },
      },
      required: ['saturation_score', 'competition_level'],
    }),
  },

  // 29. Accessibility
  {
    id: 'accessibility',
    purpose: 'Disability accommodations, accessibility considerations.',
    version: '1.0.0',
    template: baseTemplate('accessibility', `TASK:
Assess accessibility for people with various disabilities and available accommodations.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        physical_accessibility: { type: 'string' },
        accommodations_available: { type: 'array', items: { type: 'string' } },
        considerations: { type: 'array', items: { type: 'string' } },
      },
      required: ['physical_accessibility'],
    }),
  },

  // 30. Unionization
  {
    id: 'unionization',
    purpose: 'Union presence, collective bargaining, labor organization.',
    version: '1.0.0',
    template: baseTemplate('unionization', `TASK:
Describe union presence, major unions, benefits of membership, typical contracts.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        union_presence: { type: 'string' },
        major_unions: { type: 'array', items: { type: 'string' } },
        membership_rate: { type: 'number', minimum: 0, maximum: 100 },
        benefits: { type: 'array', items: { type: 'string' } },
      },
      required: ['union_presence'],
    }),
  },

  // 31. Career Ladders
  {
    id: 'career-ladders',
    purpose: 'Advancement paths, promotion timeline, career progression with salary increases.',
    version: '1.1.0',
    template: baseTemplate('career-ladders', `TASK:
Map career progression: entry level, mid-level, senior positions with timelines and requirements.
For each level, include salary_increase_pct: the typical percentage salary increase from the previous level (e.g., 15 means 15% increase).`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        levels: { 
          type: 'array', 
          items: { 
            type: 'object', 
            properties: { 
              level: { type: 'string' }, 
              typical_years: { type: 'integer' }, 
              requirements: { type: 'array', items: { type: 'string' } },
              salary_increase_pct: { type: 'number', minimum: 0, maximum: 200 },
            }, 
            required: ['level', 'salary_increase_pct'] 
          } 
        },
      },
      required: ['levels'],
    }),
  },

  // 32. Remote Work
  {
    id: 'remote-work',
    purpose: 'Work-from-home potential, hybrid options, digital nomad viability.',
    version: '1.0.0',
    template: baseTemplate('remote-work', `TASK:
Assess remote work potential: fully remote (%), hybrid options, tools needed.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        remote_potential_pct: { type: 'integer', minimum: 0, maximum: 100 },
        hybrid_common: { type: 'boolean' },
        tools_needed: { type: 'array', items: { type: 'string' } },
      },
      required: ['remote_potential_pct'],
    }),
  },

  // 33. Time Flexibility
  {
    id: 'time-flexibility',
    purpose: 'Schedule flexibility, shift options, work-life balance.',
    version: '1.0.0',
    template: baseTemplate('time-flexibility', `TASK:
Evaluate schedule flexibility: shift options, typical hours, work-life balance score (0-10).`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        flexibility_score: { type: 'integer', minimum: 0, maximum: 10 },
        shift_options: { type: 'array', items: { type: 'string' } },
        typical_hours_per_week: { type: 'integer' },
      },
      required: ['flexibility_score', 'typical_hours_per_week'],
    }),
  },

  // 34. Entrepreneurship
  {
    id: 'entrepreneurship',
    purpose: 'Self-employment potential, business ownership, freelancing.',
    version: '1.0.0',
    template: baseTemplate('entrepreneurship', `TASK:
Assess self-employment viability: startup costs, business model, success rate.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        viability_score: { type: 'integer', minimum: 0, maximum: 10 },
        startup_cost_low: { type: 'number' },
        startup_cost_high: { type: 'number' },
        business_models: { type: 'array', items: { type: 'string' } },
      },
      required: ['viability_score'],
    }),
  },

  // 35. Side Hustle
  {
    id: 'side-hustle',
    purpose: 'Part-time income potential, gig economy, freelance opportunities.',
    version: '1.0.0',
    template: baseTemplate('side-hustle', `TASK:
Evaluate side hustle potential: part-time income, hours needed, platforms/marketplaces.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        feasibility_score: { type: 'integer', minimum: 0, maximum: 10 },
        part_time_income_range: { type: 'string' },
        hours_per_week: { type: 'integer' },
        platforms: { type: 'array', items: { type: 'string' } },
      },
      required: ['feasibility_score'],
    }),
  },

  // 36. Retirement Planning
  {
    id: 'retirement-planning',
    purpose: 'Late-career options, retirement timing, pension availability.',
    version: '1.0.0',
    template: baseTemplate('retirement-planning', `TASK:
Analyze retirement considerations: typical retirement age, pension/401k availability, late-career options.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        typical_retirement_age: { type: 'integer' },
        pension_common: { type: 'boolean' },
        retirement_savings_outlook: { type: 'string' },
        late_career_options: { type: 'array', items: { type: 'string' } },
      },
      required: ['typical_retirement_age'],
    }),
  },

  // 37. Income Stability
  {
    id: 'income-stability',
    purpose: 'Earnings consistency, seasonality, economic sensitivity.',
    version: '1.0.0',
    template: baseTemplate('income-stability', `TASK:
Assess income stability: consistency score (0-10), seasonal variations, recession resistance.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        stability_score: { type: 'integer', minimum: 0, maximum: 10 },
        seasonal_variations: { type: 'string' },
        recession_resistance: { type: 'string' },
      },
      required: ['stability_score'],
    }),
  },

  // 38. Job Satisfaction
  {
    id: 'job-satisfaction',
    purpose: 'Worker satisfaction, fulfillment, burnout rates.',
    version: '1.0.0',
    template: baseTemplate('job-satisfaction', `TASK:
Analyze job satisfaction: overall score (0-10), fulfillment factors, burnout risk, retention rates.`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        satisfaction_score: { type: 'integer', minimum: 0, maximum: 10 },
        fulfillment_factors: { type: 'array', items: { type: 'string' } },
        burnout_risk: { type: 'string' },
        typical_tenure_years: { type: 'integer' },
      },
      required: ['satisfaction_score', 'fulfillment_factors'],
    }),
  },

  // 39. AI Trajectory Analysis
  {
    id: 'ai-trajectory-analysis',
    purpose: 'BRUTALLY HONEST deep analysis of AI impact with month-by-month, year-by-year trajectory thinking.',
    version: '2.0.0',
    template: baseTemplate('ai-trajectory-analysis', `TASK:
Provide a BRUTALLY HONEST, deeply researched analysis of how AI will impact {{canonical_title}}. You must be RADICALLY TRANSPARENT about automation risks. This analysis must be 1200-1800 words.

🎯 CRITICAL CONTEXT:
- We are in November 2025. AI has progressed EXPONENTIALLY since GPT-4 (March 2023).
- GPT-4o, Claude 3.5 Sonnet, Gemini 2.0, and multimodal AI are NOW in production.
- AI can now: write code, analyze images/video, generate realistic voices, automate workflows, handle customer service, create marketing content, analyze legal documents, diagnose medical conditions from scans, and more.
- The pace is ACCELERATING. What took 5 years (2018-2023) might take 18 months (2025-2026).

📊 YOUR ANALYSIS MUST INCLUDE:

1. **CURRENT STATE (November 2025)** - 200 words:
   - What SPECIFIC AI tools are being used in {{canonical_title}} RIGHT NOW?
   - Name actual products: ChatGPT, Claude, Copilot, Midjourney, Runway, etc.
   - What % of workers in this field are already using AI daily? Weekly?
   - Which tasks are ALREADY being automated TODAY?
   - Be SPECIFIC: "X% of [specific task] is now handled by [specific AI tool]"

2. **AI CAPABILITY REALITY CHECK** - 200 words:
   - HONESTLY assess: Which parts of {{canonical_title}} are:
     * EASILY AUTOMATED (routine, digital, pattern-based)
     * PARTIALLY AUTOMATABLE (AI assists, human verifies)
     * HARD TO AUTOMATE (physical, emotional, creative, ethical)
     * IMPOSSIBLE TO AUTOMATE (for now)
   - Don't be optimistic. If a task CAN be automated, it WILL be.
   - Economic pressure is REAL. If AI is 10x cheaper, businesses WILL adopt it.

3. **MONTH-BY-MONTH TRAJECTORY** - 400 words:
   Think like an AI researcher tracking progress:
   
   **2026 (12 months out)**:
   - What AI models will be released? (GPT-5? Claude 4? Gemini 3?)
   - What NEW capabilities will emerge? (longer context? better reasoning? multimodal fusion?)
   - How will {{canonical_title}} workers experience this?
   - Takeover estimate: X% of tasks
   
   **2028 (3 years out)**:
   - Extrapolate from current velocity. If AI improved 10x in 2 years (2023-2025), what happens by 2028?
   - What workflows will be COMPLETELY automated?
   - What new AI-human collaboration models emerge?
   - How many jobs in this field are eliminated vs. transformed?
   - Takeover estimate: X% of tasks
   
   **2030 (5 years out)**:
   - AGI timeline? Probably not, but NARROW AI will be EXTREMELY capable.
   - What does a typical day look like for a {{canonical_title}} worker?
   - Are there FEWER jobs? Same number but different skills? More jobs?
   - Takeover estimate: X% of tasks
   
   **2032 (7 years out)**:
   - Compounding effects. 7 years of exponential AI growth.
   - Is {{canonical_title}} unrecognizable? A niche specialty? Gone?
   - What human skills are now PREMIUM (non-automatable)?
   - Takeover estimate: X% of tasks
   
   **2035 (10 years out)**:
   - Long-term structural changes.
   - Is this job title even used anymore?
   - What happened to the workers? Retrained? Unemployed? Elevated to higher roles?
   - Takeover estimate: X% of tasks

4. **TAKEOVER PERCENTAGES - BE HONEST** - 200 words:
   For EACH year (2026, 2028, 2030, 2032, 2035), provide:
   - **takeover_pct**: 0-100. Don't lowball this. If 60% of tasks are routine, say 60%.
   - **confidence_level**: low/medium/high. Be honest about uncertainty.
   - **key_factors**: 2-4 specific reasons. Examples:
     * "LLM context windows reached 1M tokens, enabling full document analysis"
     * "Computer vision accuracy exceeded human radiologists"
     * "Economic incentive: AI costs $0.10/hour vs human $50/hour"
     * "Regulatory barriers removed in 2027 legislation"

5. **INDUSTRY ADOPTION REALITY** - 150 words:
   - Will this industry adopt AI FAST or SLOW?
   - What are the ECONOMIC incentives? (Huge cost savings = fast adoption)
   - What are the BARRIERS? (Regulation, safety, liability, unions)
   - Compare to other industries: Healthcare (slow), Tech (fast), Finance (medium)

6. **HUMAN ADVANTAGE - SHRINKING OVER TIME** - 150 words:
   - What can humans do that AI CAN'T (yet)?
   - Be realistic: Many "human-only" skills are being automated NOW.
   - Physical presence? (Robots improving)
   - Empathy? (AI can simulate convincingly)
   - Creativity? (AI generates art, music, code)
   - What's LEFT that's truly human?

7. **SURVIVAL STRATEGIES - BRUTAL HONESTY** - 150 words:
   - If you're entering this field NOW, should you?
   - If you're IN this field, what MUST you do?
   - Be honest: "This job has 10 good years left, then...?"
   - Upskilling paths: What skills are AI-RESISTANT?
   - Career pivots: Where should people go?

🚨 CRITICAL INSTRUCTIONS:
- Do NOT sugarcoat. Workers need TRUTH, not comfort.
- Do NOT catastrophize. Be data-driven, not alarmist.
- Use REAL examples: "Like how [X job] automated in [Y years]"
- Reference ACTUAL AI progress: GPT-3 (2020) → GPT-4 (2023) → GPT-4o (2024) → ?
- Consider economic forces: AI adoption is driven by COST SAVINGS, not ethics.
- Remember: AI doesn't need to be PERFECT to replace humans, just GOOD ENOUGH and CHEAPER.

Return JSON with:
- data.analysis (string, 1200-1800 words)
- data.timeline (array of 5 objects: year, horizon_label, takeover_pct, confidence_level, key_factors[])
- data.summary (object: current_impact, human_advantage, adaptation_priority)
- data.brutal_truth (string, 2-3 sentences: The uncomfortable reality)`),
    schema: createTopLevelSchema({
      type: 'object',
      properties: {
        analysis: { 
          type: 'string',
          minLength: 800,
          maxLength: 3000,
          description: 'Brutally honest 1200-1800 word analysis (minimum 800 for flexibility)'
        },
        timeline: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              year: { type: 'integer' },
              horizon_label: { type: 'string' },
              takeover_pct: { type: 'integer', minimum: 0, maximum: 100 },
              confidence_level: { type: 'string', enum: ['low', 'medium', 'high'] },
              key_factors: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
            },
            required: ['year', 'horizon_label', 'takeover_pct', 'confidence_level', 'key_factors'],
          },
          minItems: 5,
          maxItems: 5,
        },
        summary: {
          type: 'object',
          properties: {
            current_impact: { type: 'string', description: 'Current AI impact in 1-2 sentences' },
            human_advantage: { type: 'string', description: 'Key human advantages that resist automation' },
            adaptation_priority: { type: 'string', enum: ['critical', 'high', 'moderate', 'low'] },
          },
          required: ['current_impact', 'human_advantage', 'adaptation_priority'],
        },
        brutal_truth: {
          type: 'string',
          description: 'The uncomfortable reality in 2-3 sentences'
        },
      },
      required: ['analysis', 'timeline', 'summary'],
      additionalProperties: false,
    }),
  },

];

export default { promptTemplates, runPolicies, baseTemplate, createTopLevelSchema };
