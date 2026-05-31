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

export const proxy = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const body = await req.json();
    const { action } = body;
    const supabase = createSupabaseAdmin(req);

    const config = await resolveLLMConfig(supabase, body.aiModelConfigId);
    if (!config) return jsonRes({ error: 'No active AI model configured' }, 400);

    if (action === 'screen-resume') {
      if (!body.resumeText) return jsonRes({ error: 'resumeText is required' }, 400);
      const systemPrompt = buildSystemPrompt(body.aiPrompt || '', body.scoringRules || []);
      const userMessage = buildUserMessage(body.resumeText, body.positionName || '');
      const raw = await callLLM(config, systemPrompt, userMessage);
      const parsed = parseJSONResponse(raw);
      return jsonRes({
        candidateId: body.candidateId ?? null,
        modelUsed: config.model_name,
        provider: config.provider,
        totalScore: Number(parsed.totalScore) || 0,
        dimensionScores: Array.isArray(parsed.dimensionScores) ? parsed.dimensionScores : [],
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
        matchedQualifications: Array.isArray(parsed.matchedQualifications) ? parsed.matchedQualifications : [],
        missingQualifications: Array.isArray(parsed.missingQualifications) ? parsed.missingQualifications : [],
        overallAssessment: String(parsed.overallAssessment ?? ''),
        recommendation: String(parsed.recommendation ?? ''),
      });
    }

    if (action === 'rank-candidates') {
      if (!body.candidates || !Array.isArray(body.candidates) || body.candidates.length < 2)
        return jsonRes({ error: 'At least 2 candidates required' }, 400);
      const indexed = body.candidates.map((c: { id?: string; resumeText?: string }, i: number) => ({ index: i, id: c.id ?? null, resumeText: c.resumeText || '' }));
      const systemPrompt = buildRankingSystemPrompt(body.aiPrompt || '', body.scoringRules || []);
      const userMessage = buildRankingUserMessage(indexed, body.positionName || '');
      const raw = await callLLM(config, systemPrompt, userMessage);
      const parsed2 = parseJSONResponse(raw);
      return jsonRes({
        modelUsed: config.model_name,
        provider: config.provider,
        ranking: Array.isArray(parsed2.ranking) ? parsed2.ranking : [],
        analysisSummary: String(parsed2.analysisSummary ?? ''),
      });
    }

    if (action === 'parse-resume') {
      if (!body.resumeText || body.resumeText.trim().length < 20) return jsonRes({ error: 'resumeText required (min 20 chars)' }, 400);
      config.temperature = 0.1;
      config.max_tokens = 2048;
      const systemPrompt = `你是一个简历信息提取助手。从用户提供的简历文本中提取结构化信息，以 JSON 格式返回。\n\n必须返回以下字段（如无则留空）：name, gender, ageOrBirth, phone, email, location, highestEducation, school, major, educationTime, expectedSalary, currentlyEmployed, availability, photoBase64, skills(数组最多8个), workExperience(数组{company,role,period,desc}), honors(数组)。\n\n只返回纯 JSON。`;
      const userMessage = `请从以下简历文本中提取结构化信息：\n\n${body.resumeText}`;
      const raw = await callLLM(config, systemPrompt, userMessage);
      const p3 = parseJSONResponse(raw);
      return jsonRes({
        modelUsed: config.model_name,
        provider: config.provider,
        name: String(p3.name ?? ''),
        gender: String(p3.gender ?? ''),
        ageOrBirth: String(p3.ageOrBirth ?? ''),
        phone: String(p3.phone ?? ''),
        email: String(p3.email ?? ''),
        location: String(p3.location ?? ''),
        highestEducation: String(p3.highestEducation ?? ''),
        school: String(p3.school ?? ''),
        major: String(p3.major ?? ''),
        expectedSalary: String(p3.expectedSalary ?? ''),
        currentlyEmployed: String(p3.currentlyEmployed ?? ''),
        availability: String(p3.availability ?? ''),
        photoBase64: String(p3.photoBase64 ?? ''),
        skills: Array.isArray(p3.skills) ? p3.skills : [],
        workExperience: Array.isArray(p3.workExperience) ? p3.workExperience : [],
        honors: Array.isArray(p3.honors) ? p3.honors : [],
      });
    }

    return jsonRes({ error: `Unknown action: ${action}` }, 400);
  } catch {
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};
