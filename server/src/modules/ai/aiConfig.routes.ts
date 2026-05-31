import {Router} from 'express';
import {query, queryOne, transaction} from '../../config/database.js';
import {writeActiveConfigToEnv} from './envWriter.js';
import {callLLM} from './llmClient.js';
import {requireRole} from '../../middleware/requireRole.js';

const router = Router();

// All AI config routes are admin-only (manage API keys, model switching)
router.use(requireRole('admin'));

// Prevent SSRF: only allow HTTPS URLs to known AI providers
const ALLOWED_BASE_URL_PATTERNS = [
  /^https:\/\/api\.openai\.com/,
  /^https:\/\/api\.anthropic\.com/,
  /^https:\/\/generativelanguage\.googleapis\.com/,
  /^https:\/\/api\.deepseek\.com/,
  /^https:\/\/open\.bigmodel\.cn/,
  /^https:\/\/api\.minimax\.io/,
  /^https:\/\/api\.moonshot\.cn/,
  /^https:\/\/dashscope\.aliyuncs\.com/,
  /^https:\/\/[a-zA-Z0-9.-]+\.supabase\.co/,
  /^https:\/\/localhost/,
  /^https:\/\/127\.0\.0\.1/,
];

function validateBaseUrl(url: string): void {
  if (!url) return;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      throw new Error('base_url must use HTTPS');
    }
    // Block internal/private IP ranges
    const hostname = parsed.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' ||
        hostname.startsWith('192.168.') || hostname.startsWith('10.') ||
        hostname.startsWith('172.16.') || hostname.startsWith('169.254.') ||
        hostname === '[::1]' || hostname.startsWith('fe80:')) {
      throw new Error('base_url must not point to internal/private addresses');
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('base_url')) throw e;
    // If URL parsing fails but it's not our error, re-throw
  }
}

function maskApiKey(key: string): string {
  if (!key || key.length <= 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function toPublic(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    api_key_display: maskApiKey(String(row.api_key ?? '')),
    api_key: undefined,
  };
}

// GET / — list all configs (api_key masked)
router.get('/', async (_req, res, next) => {
  try {
    const rows = await query(
      `SELECT * FROM ai_model_configs ORDER BY created_at DESC`,
    );
    res.json(rows.map(toPublic));
  } catch (e) { next(e); }
});

// GET /active — currently active (default) config (MUST be before /:id)
router.get('/active', async (_req, res, next) => {
  try {
    const row = await queryOne(
      `SELECT * FROM ai_model_configs WHERE is_default = true AND is_active = true LIMIT 1`,
    );
    if (!row) {
      res.json({active: null});
      return;
    }
    res.json({active: toPublic(row)});
  } catch (e) { next(e); }
});

// GET /:id — single config (api_key masked)
router.get('/:id', async (req, res, next) => {
  try {
    const row = await queryOne(
      `SELECT * FROM ai_model_configs WHERE id = $1`,
      [req.params.id],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: 'AI model config not found'}});
      return;
    }
    res.json(toPublic(row));
  } catch (e) { next(e); }
});

// POST / — create config
router.post('/', async (req, res, next) => {
  try {
    const {name, provider, model_name, api_key, base_url, temperature, max_tokens, is_default} = req.body;
    if (!name || !provider || !model_name || !api_key) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'name, provider, model_name, api_key are required'}});
      return;
    }

    // Validate base_url to prevent SSRF
    if (base_url) {
      try { validateBaseUrl(base_url); } catch (e) {
        res.status(400).json({error: {code: 'VALIDATION_ERROR', message: (e as Error).message}});
        return;
      }
    }

    const row = await queryOne(
      `INSERT INTO ai_model_configs (name, provider, model_name, api_key, base_url, temperature, max_tokens, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        name,
        provider,
        model_name,
        api_key,
        base_url ?? null,
        temperature ?? 0.7,
        max_tokens ?? 4096,
        is_default ?? false,
      ],
    );
    res.status(201).json(toPublic(row!));
  } catch (e) { next(e); }
});

// PATCH /:id — update config
router.patch('/:id', async (req, res, next) => {
  try {
    const {id} = req.params;
    const existing = await queryOne(`SELECT * FROM ai_model_configs WHERE id = $1`, [id]);
    if (!existing) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: 'AI model config not found'}});
      return;
    }

    // Validate base_url to prevent SSRF
    if (req.body.base_url) {
      try { validateBaseUrl(req.body.base_url); } catch (e) {
        res.status(400).json({error: {code: 'VALIDATION_ERROR', message: (e as Error).message}});
        return;
      }
    }

    const {name, provider, model_name, api_key, base_url, temperature, max_tokens, is_default, is_active} = req.body;
    const row = await queryOne(
      `UPDATE ai_model_configs
       SET name = $1, provider = $2, model_name = $3, api_key = $4,
           base_url = $5, temperature = $6, max_tokens = $7,
           is_default = $8, is_active = $9, updated_at = now()
       WHERE id = $10
       RETURNING *`,
      [
        name ?? existing.name,
        provider ?? existing.provider,
        model_name ?? existing.model_name,
        api_key ?? existing.api_key,
        base_url !== undefined ? base_url : existing.base_url,
        temperature ?? existing.temperature,
        max_tokens ?? existing.max_tokens,
        is_default ?? existing.is_default,
        is_active ?? existing.is_active,
        id,
      ],
    );
    res.json(toPublic(row!));
  } catch (e) { next(e); }
});

// DELETE /:id
router.delete('/:id', async (req, res, next) => {
  try {
    const {id} = req.params;
    const row = await queryOne(`DELETE FROM ai_model_configs WHERE id = $1 RETURNING id`, [id]);
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: 'AI model config not found'}});
      return;
    }
    res.json({deleted: true, id: row.id});
  } catch (e) { next(e); }
});

// POST /switch — switch active model and write to .env
router.post('/switch', async (req, res, next) => {
  try {
    const {configId} = req.body;
    if (!configId) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'configId is required'}});
      return;
    }

    const target = await queryOne(
      `SELECT * FROM ai_model_configs WHERE id = $1`,
      [configId],
    );
    if (!target) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: 'Config not found'}});
      return;
    }
    if (!target.is_active) {
      res.status(400).json({error: {code: 'INACTIVE', message: 'Cannot switch to inactive config'}});
      return;
    }

    // Transaction: clear all defaults, set new default
    const previousDefault = await queryOne(
      `SELECT id FROM ai_model_configs WHERE is_default = true LIMIT 1`,
    );
    await transaction(async (client) => {
      await client.query(`UPDATE ai_model_configs SET is_default = false`);
      await client.query(
        `UPDATE ai_model_configs SET is_default = true, updated_at = now() WHERE id = $1`,
        [configId],
      );
    });

    // Write to .env — rollback DB if write fails
    let envWarning: string | null = null;
    try {
      await writeActiveConfigToEnv({
        id: String(target.id),
        provider: String(target.provider),
        model_name: String(target.model_name),
        api_key: String(target.api_key),
        base_url: target.base_url ? String(target.base_url) : null,
        temperature: parseFloat(String(target.temperature)) || 0.7,
        max_tokens: parseInt(String(target.max_tokens), 10) || 4096,
      });
    } catch (envErr) {
      envWarning = `数据库已切换，但 .env 写入失败: ${(envErr as Error).message}`;
      // Rollback DB to previous default
      if (previousDefault) {
        await transaction(async (client) => {
          await client.query(`UPDATE ai_model_configs SET is_default = false`);
          await client.query(`UPDATE ai_model_configs SET is_default = true WHERE id = $1`, [previousDefault.id]);
        });
      }
    }

    const updated = await queryOne(`SELECT * FROM ai_model_configs WHERE id = $1`, [configId]);
    res.json({...toPublic(updated!), envWarning});
  } catch (e) { next(e); }
});

// POST /health-check — verify API key connectivity
router.post('/health-check', async (req, res, next) => {
  try {
    const {configId} = req.body;
    if (!configId) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'configId is required'}});
      return;
    }

    const row = await queryOne(`SELECT * FROM ai_model_configs WHERE id = $1`, [configId]);
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: 'Config not found'}});
      return;
    }

    const start = Date.now();
    try {
      await callLLM(
        {
          id: String(row.id),
          provider: String(row.provider),
          model_name: String(row.model_name),
          api_key: String(row.api_key),
          base_url: row.base_url ? String(row.base_url) : undefined,
          temperature: 0,
          max_tokens: 5,
        },
        'Reply with only: OK',
        'test',
      );
      res.json({healthy: true, latencyMs: Date.now() - start});
    } catch (e) {
      res.json({healthy: false, latencyMs: Date.now() - start, error: (e as Error).message});
    }
  } catch (e) { next(e); }
});

export default router;
