import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface AppConfig {
  app: {
    name: string;
    env: string;
    timezone: string;
    version: string;
    port: number;
    adminToken: string;
  };
  pg: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    sslmode: string;
    connectTimeout: number;
  };
  supabase: {
    url: string;
    serviceRoleKey: string;
    anonKey: string;
    httpTimeout: number;
  };
  openai: {
    apiKey: string;
    model: string;
    timeout: number;
    temperature: number;
    topP: number;
    maxTokens: number;
  };
  paths: {
    onetCsv: string;
    logsDir: string;
    tmpDir: string;
  };
  ai: {
    maxConcurrency: number;
    retry: {
      max: number;
      backoffSec: number;
    };
    perJobRateLimitSec: number;
  };
  logging: {
    level: string;
    stderr: boolean;
    file: string;
    rotate: boolean;
    maxBytes: number;
    maxFiles: number;
  };
  http: {
    userAgent: string;
    connectTimeout: number;
    timeout: number;
  };
}

// Parse DATABASE_URL if provided (Railway style)
function parseDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    try {
      const url = new URL(databaseUrl);
      return {
        host: url.hostname,
        port: parseInt(url.port || '5432'),
        database: url.pathname.slice(1),
        user: url.username,
        password: url.password,
      };
    } catch (e) {
      // Ignore parse error, fall through to individual vars
    }
  }
  return null;
}

const dbFromUrl = parseDatabaseUrl();

const config: AppConfig = {
  app: {
    name: 'Career Intelligence ETL',
    env: process.env.NODE_ENV || 'production',
    timezone: process.env.APP_TZ || 'UTC',
    version: '1.0.0',
    port: parseInt(process.env.PORT || '5000', 10),
    adminToken: process.env.ADMIN_TOKEN || 'change-this-token',
  },
  pg: {
    host: dbFromUrl?.host || process.env.SUPABASE_DB_HOST || 'localhost',
    port: dbFromUrl?.port || parseInt(process.env.SUPABASE_DB_PORT || '5432', 10),
    database: dbFromUrl?.database || process.env.SUPABASE_DB_NAME || 'postgres',
    user: dbFromUrl?.user || process.env.SUPABASE_DB_USER || 'postgres',
    password: dbFromUrl?.password || process.env.SUPABASE_DB_PASSWORD || '',
    sslmode: process.env.SUPABASE_DB_SSLMODE || 'require',
    connectTimeout: parseInt(process.env.SUPABASE_DB_CONNECT_TIMEOUT || '10', 10),
  },
  supabase: {
    url: (process.env.SUPABASE_URL || 'https://zmlptinizralkxtdjaez.supabase.co').replace(/\/$/, ''),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    httpTimeout: parseInt(process.env.SUPABASE_HTTP_TIMEOUT || '30', 10),
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    timeout: parseInt(process.env.OPENAI_TIMEOUT || '60', 10),
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.3'),
    topP: parseFloat(process.env.OPENAI_TOP_P || '0.9'),
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '4096', 10),
  },
  paths: {
    onetCsv: process.env.ONET_CSV_PATH || path.join(process.cwd(), 'All_Occupations.csv'),
    logsDir: process.env.LOGS_DIR || path.join(process.cwd(), 'logs'),
    tmpDir: process.env.TMP_DIR || '/tmp',
  },
  ai: {
    maxConcurrency: parseInt(process.env.AI_MAX_CONCURRENCY || '3', 10),
    retry: {
      max: parseInt(process.env.AI_RETRY_MAX || '3', 10),
      backoffSec: parseInt(process.env.AI_RETRY_BACKOFF || '15', 10),
    },
    perJobRateLimitSec: parseInt(process.env.AI_PER_JOB_COOLDOWN || '0', 10),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    stderr: process.env.LOG_STDERR !== '0',
    file: process.env.LOG_FILE || path.join(process.cwd(), 'logs', 'pipeline.log'),
    rotate: process.env.LOG_ROTATE !== '0',
    maxBytes: parseInt(process.env.LOG_MAX_BYTES || String(10 * 1024 * 1024), 10),
    maxFiles: parseInt(process.env.LOG_MAX_FILES || '5', 10),
  },
  http: {
    userAgent: 'Career-Intel-Pipeline/1.0',
    connectTimeout: parseInt(process.env.HTTP_CONNECT_TIMEOUT || '10', 10),
    timeout: parseInt(process.env.HTTP_TIMEOUT || '60', 10),
  },
};

// Validate required secrets
const errors: string[] = [];

// Only require password if DATABASE_URL is not provided
if (!config.pg.password && !process.env.DATABASE_URL) {
  errors.push('Either DATABASE_URL or SUPABASE_DB_PASSWORD is required for Postgres connection.');
}
if (!config.openai.apiKey) {
  errors.push('OPENAI_API_KEY is required.');
}

if (errors.length > 0) {
  throw new Error(`Configuration error(s):\n - ${errors.join('\n - ')}`);
}

export default config;
