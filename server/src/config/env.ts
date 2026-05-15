import 'dotenv/config';

const requireEnv = (name: string): string => {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
};

export const env = {
  DATABASE_URL: requireEnv('DATABASE_URL'),
  JWT_SECRET: requireEnv('JWT_SECRET'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '2h',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  PORT: parseInt(process.env.PORT || '4000', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 min
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10),
  MINERU_API_URL: process.env.MINERU_API_URL || 'https://mineru.net/api/v4/extract/task',
  MINERU_API_TOKEN: process.env.MINERU_API_TOKEN || '',
  AI_PROVIDER: process.env.AI_PROVIDER || '',
  AI_MODEL_NAME: process.env.AI_MODEL_NAME || '',
  AI_API_KEY: process.env.AI_API_KEY || '',
  AI_BASE_URL: process.env.AI_BASE_URL || '',
  AI_TEMPERATURE: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
  AI_MAX_TOKENS: parseInt(process.env.AI_MAX_TOKENS || '4096', 10),
  AI_MODEL_CONFIG_ID: process.env.AI_MODEL_CONFIG_ID || '',
};
