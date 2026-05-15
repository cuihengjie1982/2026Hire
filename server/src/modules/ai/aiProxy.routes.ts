import {Router} from 'express';
import {queryOne, query} from '../../config/database.js';
import {callLLM} from './llmClient.js';
import {AppError} from '../../shared/errors.js';
import {buildSystemPrompt, buildUserMessage, buildRankingSystemPrompt, buildRankingUserMessage} from './promptBuilder.js';

const router = Router();

// POST /screen-resume — AI-powered single resume screening
router.post('/screen-resume', async (req, res, next) => {
  try {
    const {
      candidateId, positionName, aiPrompt, scoringRules,
      aiModelConfigId, resumeText,
    } = req.body;

    if (!resumeText) {
      res.status(400).json({error: 'resumeText is required'});
      return;
    }

    // Resolve AI model config
    let row: Record<string, unknown> | null = null;
    if (aiModelConfigId) {
      row = await queryOne(
        `SELECT * FROM ai_model_configs WHERE id = $1 AND is_active = true`,
        [aiModelConfigId],
      );
    }
    // Fallback to default active config (any provider)
    if (!row) {
      row = await queryOne(
        `SELECT * FROM ai_model_configs WHERE is_default = true AND is_active = true LIMIT 1`,
      );
    }
    if (!row) {
      row = await queryOne(
        `SELECT * FROM ai_model_configs WHERE is_active = true ORDER BY created_at DESC LIMIT 1`,
      );
    }
    if (!row) {
      res.status(400).json({error: 'No active AI model configured. Please configure one in AI Agents > Model Config.'});
      return;
    }

    const config = {
      id: row.id as string,
      provider: row.provider as string,
      model_name: row.model_name as string,
      api_key: row.api_key as string,
      base_url: row.base_url as string | null,
      temperature: parseFloat(String(row.temperature ?? 0.7)),
      max_tokens: parseInt(String(row.max_tokens ?? 4096), 10),
    };

    const systemPrompt = buildSystemPrompt(aiPrompt || '', scoringRules || []);
    const userMessage = buildUserMessage(resumeText, positionName || '');

    let rawResponse: string;
    try {
      rawResponse = await callLLM(config, systemPrompt, userMessage);
    } catch (llmErr) {
      throw new AppError(502,
        `AI model call failed (${config.provider}/${config.model_name}): ${(llmErr as Error).message}`,
        'AI_MODEL_ERROR');
    }
    const parsed = parseJSONResponse(rawResponse);

    res.json({
      candidateId: candidateId ?? null,
      modelUsed: config.model_name,
      provider: config.provider,
      ...parsed,
    });
  } catch (e) { next(e); }
});

// POST /rank-candidates — AI-powered candidate ranking
router.post('/rank-candidates', async (req, res, next) => {
  try {
    const {
      candidates, positionName, aiPrompt, scoringRules, aiModelConfigId,
    } = req.body;

    if (!candidates || !Array.isArray(candidates) || candidates.length < 2) {
      res.status(400).json({error: 'At least 2 candidates are required for ranking'});
      return;
    }

    // Resolve AI model config (same pattern as screen-resume)
    let row: Record<string, unknown> | null = null;
    if (aiModelConfigId) {
      row = await queryOne(
        `SELECT * FROM ai_model_configs WHERE id = $1 AND is_active = true`,
        [aiModelConfigId],
      );
    }
    if (!row) {
      row = await queryOne(
        `SELECT * FROM ai_model_configs WHERE is_default = true AND is_active = true LIMIT 1`,
      );
    }
    if (!row) {
      row = await queryOne(
        `SELECT * FROM ai_model_configs WHERE is_active = true ORDER BY created_at DESC LIMIT 1`,
      );
    }
    if (!row) {
      res.status(400).json({error: 'No active AI model configured.'});
      return;
    }

    const config = {
      id: row.id as string,
      provider: row.provider as string,
      model_name: row.model_name as string,
      api_key: row.api_key as string,
      base_url: row.base_url as string | null,
      temperature: parseFloat(String(row.temperature ?? 0.7)),
      max_tokens: parseInt(String(row.max_tokens ?? 4096), 10),
    };

    const indexedCandidates = candidates.map((c: {id?: string; resumeText?: string}, i: number) => ({
      index: i,
      id: c.id ?? null,
      resumeText: c.resumeText || '',
    }));

    const systemPrompt = buildRankingSystemPrompt(aiPrompt || '', scoringRules || []);
    const userMessage = buildRankingUserMessage(indexedCandidates, positionName || '');

    let rawResponse: string;
    try {
      rawResponse = await callLLM(config, systemPrompt, userMessage);
    } catch (llmErr) {
      throw new AppError(502,
        `AI model call failed (${config.provider}/${config.model_name}): ${(llmErr as Error).message}`,
        'AI_MODEL_ERROR');
    }
    const parsed = parseJSONResponse(rawResponse);

    res.json({
      modelUsed: config.model_name,
      provider: config.provider,
      ...parsed,
    });
  } catch (e) { next(e); }
});

// POST /parse-resume — AI-powered resume structured extraction
router.post('/parse-resume', async (req, res, next) => {
  try {
    const {resumeText} = req.body;
    if (!resumeText || resumeText.trim().length < 20) {
      res.status(400).json({error: 'resumeText is required (min 20 chars)'});
      return;
    }

    // Resolve AI model config
    let row = await queryOne(
      `SELECT * FROM ai_model_configs WHERE is_default = true AND is_active = true LIMIT 1`,
    );
    if (!row) {
      row = await queryOne(
        `SELECT * FROM ai_model_configs WHERE is_active = true ORDER BY created_at DESC LIMIT 1`,
      );
    }
    if (!row) {
      res.status(400).json({error: 'No active AI model configured. Please configure one in Settings > AI Model Config.'});
      return;
    }

    const config = {
      id: row.id as string,
      provider: row.provider as string,
      model_name: row.model_name as string,
      api_key: row.api_key as string,
      base_url: row.base_url as string | null,
      temperature: 0.1,
      max_tokens: 2048,
    };

    const systemPrompt = `你是一个简历信息提取助手。从用户提供的简历文本中提取结构化信息，以 JSON 格式返回。

必须返回以下字段（如果简历中没有则留空字符串""）：
- name: 姓名（2-4个中文字符）
- gender: 性别（"男"或"女"）
- ageOrBirth: 年龄（如"23岁"）或出生年月（如"2000年"）
- phone: 手机号
- email: 邮箱
- location: 所在城市/期望城市
- highestEducation: 最高学历（如"本科"、"大专"、"硕士"等）
- school: 学校名称
- major: 专业
- educationTime: 教育时间段（如"2021-2025"）
- expectedSalary: 期望薪酬（如"6-7K"、"8000-12000"）
- currentlyEmployed: 在职状态（"在职"/"离职"/"待业"）
- availability: 到岗时间（如"随时到岗"、"一周内"、"2025-06"）
- photoBase64: 留空字符串
- skills: 技能关键词数组，最多8个，只提取核心技能词（如["数据标注","ArcGIS","遥感"]），不要数字和描述
- workExperience: 工作经历数组，每项包含 {company, role, period, desc}，desc是简短描述
- honors: 荣誉证书数组

只返回纯 JSON，不要任何其他文字。`;

    const userMessage = `请从以下简历文本中提取结构化信息：\n\n${resumeText}`;

    let rawResponse: string;
    try {
      rawResponse = await callLLM(config, systemPrompt, userMessage);
    } catch (llmErr) {
      throw new AppError(502,
        `AI model call failed (${config.provider}/${config.model_name}): ${(llmErr as Error).message}`,
        'AI_MODEL_ERROR');
    }
    const parsed = parseJSONResponse(rawResponse);

    res.json({
      modelUsed: config.model_name,
      provider: config.provider,
      ...parsed,
    });
  } catch (e) { next(e); }
});

function parseJSONResponse(raw: string): Record<string, unknown> {
  // Try direct JSON parse first
  try {
    return JSON.parse(raw);
  } catch {
    // Try to extract JSON block from markdown code fences
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch { /* fall through */ }
    }
    // Try to find JSON object in text
    const objMatch = raw.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch { /* fall through */ }
    }
    // Return raw text as fallback
    return {
      totalScore: 0,
      error: 'Failed to parse structured response',
      rawResponse: raw.slice(0, 1000),
    };
  }
}

export default router;
