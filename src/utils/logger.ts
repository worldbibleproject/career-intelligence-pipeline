import winston from 'winston';
import path from 'path';
import fs from 'fs';
import config from '../config/index.js';

// Ensure log directory exists
if (!fs.existsSync(config.paths.logsDir)) {
  fs.mkdirSync(config.paths.logsDir, { recursive: true });
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

const transports: winston.transport[] = [];

// File transport
if (config.logging.file) {
  transports.push(
    new winston.transports.File({
      filename: config.logging.file,
      format: logFormat,
      maxsize: config.logging.maxBytes,
      maxFiles: config.logging.maxFiles,
      tailable: true,
    })
  );
}

// Console transport
if (config.logging.stderr) {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

export const logger = winston.createLogger({
  level: config.logging.level,
  transports,
  exitOnError: false,
});

export default logger;
