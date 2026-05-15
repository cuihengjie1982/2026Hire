import {writeFile, readFile,rename, mkdir} from 'fs/promises';
import {dirname, resolve} from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ENV_PATH = resolve(__dirname, '../../../.env');
const TMP_PATH = ENV_PATH + '.tmp';

// Simple mutex to prevent concurrent .env writes
let writeLock: Promise<void> = Promise.resolve();

const AI_ENV_KEYS = [
  'AI_PROVIDER',
  'AI_MODEL_NAME',
  'AI_API_KEY',
  'AI_BASE_URL',
  'AI_TEMPERATURE',
  'AI_MAX_TOKENS',
  'AI_MODEL_CONFIG_ID',
] as const;

export interface ActiveEnvConfig {
  AI_PROVIDER: string;
  AI_MODEL_NAME: string;
  AI_API_KEY: string;
  AI_BASE_URL: string;
  AI_TEMPERATURE: string;
  AI_MAX_TOKENS: string;
  AI_MODEL_CONFIG_ID: string;
}

function buildConfigValues(input: {
  id: string;
  provider: string;
  model_name: string;
  api_key: string;
  base_url: string | null;
  temperature: number;
  max_tokens: number;
}): ActiveEnvConfig {
  return {
    AI_PROVIDER: input.provider,
    AI_MODEL_NAME: input.model_name,
    AI_API_KEY: input.api_key,
    AI_BASE_URL: input.base_url || '',
    AI_TEMPERATURE: String(input.temperature),
    AI_MAX_TOKENS: String(input.max_tokens),
    AI_MODEL_CONFIG_ID: input.id,
  };
}

/**
 * Write active AI model config to server/.env atomically.
 * Preserves all existing non-AI keys.
 * Uses a simple mutex to prevent concurrent writes.
 */
export async function writeActiveConfigToEnv(input: {
  id: string;
  provider: string;
  model_name: string;
  api_key: string;
  base_url: string | null;
  temperature: number;
  max_tokens: number;
}): Promise<void> {
  // Wait for any in-progress write to finish
  await writeLock;

  let release: () => void;
  writeLock = new Promise<void>(r => { release = r; });
  try {
    await doWrite(input);
  } finally {
    release!();
  }
}

async function doWrite(input: {
  id: string;
  provider: string;
  model_name: string;
  api_key: string;
  base_url: string | null;
  temperature: number;
  max_tokens: number;
}): Promise<void> {
  const config = buildConfigValues(input);
  const keySet = new Set<string>(AI_ENV_KEYS);

  // Read existing .env content
  let content: string;
  try {
    content = await readFile(ENV_PATH, 'utf-8');
  } catch {
    content = '';
  }

  const lines = content.split('\n');
  const written = new Set<string>();
  const result: string[] = [];

  // Process existing lines, replacing AI_* keys in place
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      result.push(line);
      continue;
    }

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      result.push(line);
      continue;
    }

    const key = trimmed.slice(0, eqIdx).trim();
    if (keySet.has(key)) {
      result.push(`${key}="${config[key as keyof ActiveEnvConfig]}"`);
      written.add(key);
    } else {
      result.push(line);
    }
  }

  // Append any AI_* keys that weren't in the original file
  const missing = AI_ENV_KEYS.filter(k => !written.has(k));
  if (missing.length > 0) {
    result.push('');
    result.push('# AI Model Configuration (auto-managed by model switcher)');
    for (const key of missing) {
      result.push(`${key}="${config[key]}"`);
    }
  }

  // Ensure trailing newline
  const output = result.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';

  // Atomic write: temp file + rename
  await mkdir(dirname(ENV_PATH), {recursive: true});
  await writeFile(TMP_PATH, output, 'utf-8');
  await rename(TMP_PATH, ENV_PATH);
}

/**
 * Read current AI_* values from server/.env.
 */
export async function readActiveConfigFromEnv(): Promise<Partial<ActiveEnvConfig>> {
  let content: string;
  try {
    content = await readFile(ENV_PATH, 'utf-8');
  } catch {
    return {};
  }

  const result: Record<string, string> = {};
  const keySet = new Set<string>(AI_ENV_KEYS);

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (!keySet.has(key)) continue;
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }

  return result;
}
