import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';
import { callLLM, callVisionLLM, type ContentPart } from '../_shared/llmClient.ts';
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

async function resolveLLMConfig(supabase: ReturnType<typeof createSupabaseAdmin>, preferId?: string, forVision = false): Promise<AIModelConfig | null> {
  const getRow = async (query: ReturnType<typeof supabase.from>['select']) => {
    const { data } = await query;
    return data as Record<string, unknown> | null;
  };

  let configRow: Record<string, unknown> | null = null;

  if (preferId) {
    configRow = await getRow(supabase.from('ai_model_configs').select('*').eq('id', preferId).eq('is_active', true).single());
  }

  // For vision actions, prefer a vision-capable model
  if (!configRow && forVision) {
    // Known vision model name substrings — order matters (most specific first)
    const visionPatterns = ['glm-4v', 'MiniMax-01', 'MiniMax-VL', 'gpt-4o', 'gpt-4v', 'vision', 'gemini'];
    for (const pattern of visionPatterns) {
      configRow = await getRow(
        supabase.from('ai_model_configs')
          .select('*')
          .ilike('model_name', `%${pattern}%`)
          .eq('is_active', true)
          .limit(1).single(),
      );
      if (configRow) break;
    }
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
        // Return a 200 with empty result so the frontend's aiParseResume fallback kicks in
        return jsonRes({ name: '', gender: '', ageOrBirth: '', phone: '', email: '', location: '',
          highestEducation: '', school: '', major: '', skills: [], workExperience: [],
          honors: [], expectedSalary: '', currentlyEmployed: '', availability: '', photoBase64: '',
          _parseFailed: true, _parseError: e instanceof Error ? e.message : String(e) });
      }
      return jsonRes({ modelUsed: config.model_name, provider: config.provider, ...parseJSONResponse(raw) });
    }

    if (action === 'parse-resume-vision') {
      // Vision LLM: takes PDF pages as base64 images, returns structured resume JSON
      const images: string[] = Array.isArray(body.images) ? body.images : [];
      if (images.length === 0) return jsonRes({ error: 'images array required for vision parse' }, 400);

      // Resolve a vision-capable model (glm-4v-plus, etc.) instead of default text model
      const visionConfig = await resolveLLMConfig(supabase, body.aiModelConfigId, true);
      if (!visionConfig) return jsonRes({ error: 'No active AI vision model configured' }, 400);
      if (visionConfig.provider === 'mineru') return jsonRes({ error: 'MinerU is not a vision LLM provider' }, 400);

      visionConfig.temperature = 0.1;
      visionConfig.max_tokens = 4096;
      const systemPrompt = `你是一个简历信息提取助手。用户会发送简历的图片（可能有多页），请仔细查看每一页的每一个文字，提取所有能找到的结构化信息，以 JSON 格式返回。

**重要：宁可返回空字符串也不要遗漏任何能找到的信息。请逐一检查以下字段：**

- name: 姓名（通常在简历顶部最显眼位置，字号最大。中文2-4字，如"张三"、"欧阳娜娜"。一定要找到！）
- gender: 性别（"男"或"女"，通常在基本信息区）
- ageOrBirth: 年龄或出生日期（如"1990-05"、"28岁"）
- phone: 手机号码（仔细找！通常在基本信息区或联系方式区，格式如 138xxxxxxx 或 +86-xxx。识别所有11位手机号）
- email: 邮箱地址（仔细找！包含 @ 符号，如 zhangsan@example.com。可能在联系方式区或页眉页脚）
- location: 所在地/城市（如"深圳"、"上海"、"北京"）
- highestEducation: 最高学历（如：本科、硕士、博士、大专、高中。通常在教育经历区）
- school: 毕业院校（学校全名，在教育经历区）
- major: 专业（如"计算机科学与技术"，在教育经历区）
- expectedSalary: 期望薪资（如"15K-20K"、"面议"）
- currentlyEmployed: 当前是否在职（如"在职"、"离职"、"应届"）
- availability: 到岗时间（如"随时"、"一个月内"）
- skills: 技能列表（数组，最多8个。如["Java", "Python", "项目管理"]）
- workExperience: 工作经历（数组，每个元素：{company, role, period, desc}）
- honors: 荣誉/证书（数组）
- photoBbox: 简历照片在第一页的位置，格式为 {x, y, width, height}，数值为占整页宽高的比例（0-1之间）。例如右上角一寸照通常是 {x:0.72, y:0.08, width:0.22, height:0.28}。如果简历中没有照片，返回 null。

只返回纯 JSON，不要有其他文字。`;
      const mimeType = body.mimeType || 'image/jpeg';
      const parts: ContentPart[] = images.map((data: string) => ({
        type: 'image',
        image: { media_type: mimeType, data },
      }));
      parts.push({
        type: 'text',
        text: '请从以上简历图片中提取所有结构化信息，以纯 JSON 格式返回。',
      });

      let raw: string;
      try {
        console.log('[parse-resume-vision] Calling', visionConfig.provider, visionConfig.model_name, 'with', images.length, 'images');
        raw = await callVisionLLM(visionConfig, systemPrompt, parts);
        console.log('[parse-resume-vision] Response length:', raw.length, '| first 300 chars:', raw.slice(0, 300));
      } catch (e) {
        console.error('[parse-resume-vision] Vision LLM call failed:', e);
        return jsonRes({ name: '', gender: '', ageOrBirth: '', phone: '', email: '', location: '',
          highestEducation: '', school: '', major: '', skills: [], workExperience: [],
          honors: [], expectedSalary: '', currentlyEmployed: '', availability: '',
          _parseFailed: true, _parseError: e instanceof Error ? e.message : String(e),
          _modelUsed: visionConfig.model_name, _provider: visionConfig.provider });
      }
      const parsed = parseJSONResponse(raw);
      if (!parsed.name && !parsed.phone && !parsed.email) {
        console.warn('[parse-resume-vision] Parsed result has no name/phone/email. Raw response:', raw.slice(0, 500));
      }
      return jsonRes({ modelUsed: visionConfig.model_name, provider: visionConfig.provider, ...parsed });
    }

    return jsonRes({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    console.error('[ai-proxy]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};
