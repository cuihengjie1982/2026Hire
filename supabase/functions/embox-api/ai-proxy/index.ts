import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';
import { callLLM } from '../_shared/llmClient.ts';
import { buildSystemPrompt, buildUserMessage, buildRankingSystemPrompt, buildRankingUserMessage } from '../_shared/promptBuilder.ts';
import { parseJSONResponse } from '../_shared/jsonParser.ts';

interface AIModelConfig {
  id: string;
  provider: string;
  model_name: string;
  api_key: string;
  base_url?: string | null;
  temperature: number;
  max_tokens: number;
}

async function resolveLLMConfig(supabase: ReturnType<typeof createSupabaseAdmin>, preferId?: string): Promise<AIModelConfig | null> {
  const getRow = async (query: ReturnType<typeof supabase.from>['select']) => {
    const { data } = await query;
    return data as Record<string, unknown> | null;
  };

  let configRow: Record<string, unknown> | null = null;

  if (preferId) {
    configRow = await getRow(supabase.from('ai_model_configs').select('*').eq('id', preferId).eq('is_active', true).single());
  }
  if (!configRow) {
    configRow = await getRow(supabase.from('ai_model_configs').select('*').eq('is_default', true).eq('is_active', true).limit(1).single());
  }
  if (!configRow) {
    configRow = await getRow(supabase.from('ai_model_configs').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1).single());
  }
  if (!configRow) return null;

  return {
    id: String(configRow.id),
    provider: String(configRow.provider),
    model_name: String(configRow.model_name),
    api_key: String(configRow.api_key),
    base_url: configRow.base_url ? String(configRow.base_url) : null,
    temperature: parseFloat(String(configRow.temperature ?? 0.7)),
    max_tokens: parseInt(String(configRow.max_tokens ?? 4096)),
  };
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Minimal fetch wrapper with hard timeout — for calls where the standard
 * fetchWithRetry (25s) would exceed the Supabase Edge Function 150s worker limit.
 */
async function fetchWithHardTimeout(
  url: string,
  init: RequestInit,
  timeMs = 18_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeMs);
  try {
    return await fetch(url, {...init, signal: controller.signal});
  } finally {
    clearTimeout(timer);
  }
}

export const proxy = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const body = await req.json();
    const { action } = body;
    const supabase = createSupabaseAdmin(req);

    const config = await resolveLLMConfig(supabase, body.aiModelConfigId);
    if (!config) return jsonRes({ error: 'No active AI model configured' }, 400);

    // Reject MinerU as an LLM provider (it's a PDF parser, not a chat LLM)
    if (config.provider === 'mineru') {
      return jsonRes({ error: 'MinerU is not a chat LLM provider — cannot use for AI proxy actions' }, 400);
    }

    if (action === 'screen-resume') {
      if (!body.resumeText) return jsonRes({ error: 'resumeText is required' }, 400);
      const systemPrompt = buildSystemPrompt(body.aiPrompt || '', body.scoringRules || []);
      const userMessage = buildUserMessage(body.resumeText, body.positionName || '');
      const raw = await callLLM(config, systemPrompt, userMessage);
      return jsonRes({ candidateId: body.candidateId ?? null, modelUsed: config.model_name, provider: config.provider, ...parseJSONResponse(raw) });
    }

    if (action === 'rank-candidates') {
      if (!body.candidates || !Array.isArray(body.candidates) || body.candidates.length < 2)
        return jsonRes({ error: 'At least 2 candidates required' }, 400);
      const indexed = body.candidates.map((c: { id?: string; resumeText?: string }, i: number) => ({ index: i, id: c.id ?? null, resumeText: c.resumeText || '' }));
      const systemPrompt = buildRankingSystemPrompt(body.aiPrompt || '', body.scoringRules || []);
      const userMessage = buildRankingUserMessage(indexed, body.positionName || '');
      const raw = await callLLM(config, systemPrompt, userMessage);
      return jsonRes({ modelUsed: config.model_name, provider: config.provider, ...parseJSONResponse(raw) });
    }

    if (action === 'parse-resume') {
      if (!body.resumeText || body.resumeText.trim().length < 20) return jsonRes({ error: 'resumeText required (min 20 chars)' }, 400);
      config.temperature = 0.1;
      config.max_tokens = 2048;
      const systemPrompt = `你是一个简历信息提取助手。从用户提供的简历文本中提取结构化信息，以 JSON 格式返回。

必须返回以下字段（如无则留空）：name, gender, ageOrBirth, phone, email, location, highestEducation, school, major, expectedSalary, currentlyEmployed, availability, photoBase64, skills(数组最多8个), workExperience(数组{company,role,period,desc}), honors(数组)。

只返回纯 JSON。`;
      const userMessage = `请从以下简历文本中提取结构化信息：\n\n${body.resumeText}`;
      let raw: string;
      try {
        raw = await callLLM(config, systemPrompt, userMessage);
      } catch (e) {
        console.error('[parse-resume] LLM call failed:', e);
        return jsonRes({ error: { code: 'LLM_TIMEOUT', message: 'AI resume parsing timed out' } }, 408);
      }
      return jsonRes({ modelUsed: config.model_name, provider: config.provider, ...parseJSONResponse(raw) });
    }

    return jsonRes({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    console.error('[ai-proxy]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};
