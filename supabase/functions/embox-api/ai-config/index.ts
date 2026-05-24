import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';
import { callLLM } from '../_shared/llmClient.ts';

function maskApiKey(key: string): string {
  if (!key || key.length <= 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function toPublic(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row, api_key_display: maskApiKey(String(row.api_key ?? '')), api_key: undefined };
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const handleAiConfig = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const url = new URL(req.url);
    const fullPath = url.pathname;
    // Strip function name prefix to get clean sub-path (mirrors main router logic)
    const path = fullPath.replace(/^\/embox-api/, '') || '/';
    const prefix = '/ai-config';
    const subPath = path.startsWith(prefix) ? path.slice(prefix.length) || '/' : '/';
    const method = req.method;

    // GET / — list all (masked)
    if (method === 'GET' && (subPath === '/' || subPath === '')) {
      const { data } = await supabase.from('ai_model_configs').select('*').order('created_at', { ascending: false });
      return jsonRes((data ?? []).map((r: Record<string, unknown>) => toPublic(r)));
    }

    // GET /active
    if (method === 'GET' && subPath === '/active') {
      const { data } = await supabase.from('ai_model_configs').select('*').eq('is_default', true).eq('is_active', true).limit(1).single();
      if (!data) return jsonRes({ active: null });
      return jsonRes({ active: toPublic(data as Record<string, unknown>) });
    }

    // GET /:id
    if (method === 'GET' && subPath.length > 1 && subPath !== '/active') {
      const id = subPath.startsWith('/') ? subPath.slice(1) : subPath;
      const { data } = await supabase.from('ai_model_configs').select('*').eq('id', id).single();
      if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Config not found' } }, 404);
      return jsonRes(toPublic(data as Record<string, unknown>));
    }

    // POST / — create
    if (method === 'POST' && (subPath === '/' || subPath === '')) {
      const body = await req.json() as Record<string, unknown>;
      const { name, provider, model_name, api_key, base_url, temperature, max_tokens, is_default } = body;
      if (!name || !provider || !model_name || !api_key)
        return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'name, provider, model_name, api_key required' } }, 400);

      const { data, error } = await supabase.from('ai_model_configs').insert({
        name: String(name), provider: String(provider), model_name: String(model_name),
        api_key: String(api_key), base_url: base_url ? String(base_url) : null,
        temperature: Number(temperature ?? 0.7), max_tokens: Number(max_tokens ?? 4096),
        is_default: Boolean(is_default ?? false),
      }).select('*').single();

      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 400);
      return jsonRes(toPublic(data as Record<string, unknown>), 201);
    }

    // PATCH /:id — update
    if (method === 'PATCH') {
      const id = subPath.startsWith('/') ? subPath.slice(1) : subPath;
      const body = await req.json() as Record<string, unknown>;
      const { data: existing } = await supabase.from('ai_model_configs').select('*').eq('id', id).single();
      if (!existing) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Config not found' } }, 404);

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const key of ['name', 'provider', 'model_name', 'base_url', 'temperature', 'max_tokens', 'is_default', 'is_active']) {
        if (body[key] !== undefined) updates[key] = body[key];
      }
      if (body.api_key) updates.api_key = String(body.api_key);

      const { data } = await supabase.from('ai_model_configs').update(updates).eq('id', id).select('*').single();
      return jsonRes(toPublic(data as Record<string, unknown>));
    }

    // DELETE /:id
    if (method === 'DELETE') {
      const id = subPath.startsWith('/') ? subPath.slice(1) : subPath;
      const { data } = await supabase.from('ai_model_configs').delete().eq('id', id).select('id').single();
      if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Config not found' } }, 404);
      return jsonRes({ deleted: true, id: (data as Record<string, unknown>).id });
    }

    // POST /switch — switch active model
    if (method === 'POST' && subPath === '/switch') {
      const body = await req.json() as Record<string, unknown>;
      const configId = String(body.configId ?? '');
      if (!configId) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'configId required' } }, 400);

      const { data: target } = await supabase.from('ai_model_configs').select('*').eq('id', configId).single();
      if (!target) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Config not found' } }, 404);
      if (!(target as Record<string, unknown>).is_active) return jsonRes({ error: { code: 'INACTIVE', message: 'Cannot switch to inactive config' } }, 400);

      await supabase.from('ai_model_configs').update({ is_default: false }).neq('id', configId);
      await supabase.from('ai_model_configs').update({ is_default: true, updated_at: new Date().toISOString() }).eq('id', configId);

      const { data: updated } = await supabase.from('ai_model_configs').select('*').eq('id', configId).single();
      return jsonRes(toPublic(updated as Record<string, unknown>));
    }

    // POST /health-check — verify API key
    if (method === 'POST' && subPath === '/health-check') {
      const body = await req.json() as Record<string, unknown>;
      const configId = String(body.configId ?? '');
      if (!configId) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'configId required' } }, 400);

      const { data: row } = await supabase.from('ai_model_configs').select('*').eq('id', configId).single();
      if (!row) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Config not found' } }, 404);

      const r = row as Record<string, unknown>;
      const config = {
        id: String(r.id), provider: String(r.provider), model_name: String(r.model_name),
        api_key: String(r.api_key), base_url: r.base_url ? String(r.base_url) : null,
        temperature: 0, max_tokens: 5,
      };

      const start = Date.now();
      try {
        await callLLM(config, 'Reply with only: OK', 'test');
        return jsonRes({ healthy: true, latencyMs: Date.now() - start });
      } catch (e) {
        console.error('[ai-config] health check failed:', e);
        return jsonRes({ healthy: false, latencyMs: Date.now() - start, error: 'Health check failed' }, 200);
      }
    }

    return jsonRes({ error: { code: 'NOT_FOUND', message: `Route ${method} ${path} not found` } }, 404);
  } catch (e) {
    console.error('[ai-config]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};
