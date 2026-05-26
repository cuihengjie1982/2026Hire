import {query, queryOne} from '../../config/database.js';
import {callLLM} from '../ai/llmClient.js';
import {buildSystemPrompt, buildUserMessage, buildRankingSystemPrompt, buildRankingUserMessage} from '../ai/promptBuilder.js';

interface AgentConfig {
  positionId?: string;
  positionName?: string;
  aiModelConfigId?: string;
  autoApproveGrades?: string[];
  processedCount?: number;
  lastRunAt?: string;
  lastRunSummary?: string;
}

interface RunResult {
  processed: number;
  approved: number;
  rejected: number;
  pending: number;
  summary: string;
  duration: number;
}

/** Resolve AI model config: specified ID → default → any active */
async function resolveAIConfig(configId?: string) {
  let row = null as Record<string, unknown> | null;
  if (configId) {
    row = await queryOne(`SELECT * FROM ai_model_configs WHERE id = $1 AND is_active = true`, [configId]);
  }
  if (!row) {
    row = await queryOne(`SELECT * FROM ai_model_configs WHERE is_default = true AND is_active = true LIMIT 1`);
  }
  if (!row) {
    row = await queryOne(`SELECT * FROM ai_model_configs WHERE is_active = true ORDER BY created_at DESC LIMIT 1`);
  }
  if (!row) throw new Error('没有可用的 AI 模型配置，请先在"模型配置"中添加。');
  return {
    id: String(row.id),
    provider: String(row.provider),
    model_name: String(row.model_name),
    api_key: String(row.api_key),
    base_url: row.base_url ? String(row.base_url) : undefined,
    temperature: parseFloat(String(row.temperature)) || 0.7,
    max_tokens: parseInt(String(row.max_tokens), 10) || 4096,
  };
}

/** Get position detail with scoring_rules, grade_rules, ai_prompt */
async function getPositionDetail(positionId: string) {
  const row = await queryOne(
    `SELECT p.name, pd.scoring_rules, pd.grade_rules, pd.ai_prompt
     FROM positions p
     LEFT JOIN position_details pd ON p.id = pd.position_id
     WHERE p.id = $1`,
    [positionId],
  );
  if (!row) throw new Error(`岗位 ${positionId} 不存在`);
  return {
    name: String(row.name),
    scoringRules: typeof row.scoring_rules === 'string' ? JSON.parse(row.scoring_rules) : (row.scoring_rules as unknown[] || []),
    gradeRules: typeof row.grade_rules === 'string' ? JSON.parse(row.grade_rules) : (row.grade_rules as unknown[] || []),
    aiPrompt: String(row.ai_prompt || ''),
  };
}

/** Parse JSON from LLM response */
function parseJSON(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw); } catch { /* */ }
  const m1 = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m1) { try { return JSON.parse(m1[1].trim()); } catch { /* */ } }
  const m2 = raw.match(/\{[\s\S]*\}/);
  if (m2) { try { return JSON.parse(m2[0]); } catch { /* */ } }
  return {};
}

function mapRecommendationToGrade(rec: string): string {
  switch (rec) {
    case '强烈推荐': return 'A';
    case '推荐': return 'B+';
    case '考虑': return 'B';
    case '不推荐': return 'C';
    default: return 'B';
  }
}

// ─── Parser: 简历解析 ────────────────────────────────────────────

export async function runParser(agent: Record<string, unknown>): Promise<RunResult> {
  const config = (typeof agent.config === 'string' ? JSON.parse(agent.config) : agent.config || {}) as AgentConfig;
  const aiConfig = await resolveAIConfig(config.aiModelConfigId);
  const start = Date.now();

  // Find candidates with raw text but no parsed_info
  const candidates = await query(
    `SELECT id, parsed_info FROM candidates
     WHERE parsed_info IS NOT NULL
       AND (parsed_info::text LIKE '%"rawText"%')
       AND (parsed_info::text NOT LIKE '%"name"%'
            OR (parsed_info->>'name') IS NULL
            OR (parsed_info->>'name') = '')
     ORDER BY created_at DESC
     LIMIT 20`,
  );

  if (candidates.length === 0) {
    return {processed: 0, approved: 0, rejected: 0, pending: 0, summary: '没有需要解析的简历', duration: Date.now() - start};
  }

  const systemPrompt = `你是一个简历信息提取助手。从用户提供的简历文本中提取结构化信息，以 JSON 格式返回。

必须返回以下字段（如果简历中没有则留空字符串""）：
- name: 姓名
- gender: 性别（"男"或"女"）
- phone: 手机号
- email: 邮箱
- location: 所在城市
- highestEducation: 最高学历
- school: 学校名称
- major: 专业
- skills: 技能关键词数组
- workExperience: 工作经历数组，每项包含 {company, role, period, desc}

只返回纯 JSON，不要任何其他文字。`;

  let parsed = 0;
  let failed = 0;

  for (const c of candidates) {
    try {
      const pInfo = typeof c.parsed_info === 'string' ? JSON.parse(String(c.parsed_info)) : c.parsed_info as Record<string, unknown>;
      const rawText = String(pInfo?.rawText || pInfo?.raw_text || '');
      if (!rawText || rawText.length < 20) { failed++; continue; }

      const raw = await callLLM(aiConfig, systemPrompt, `请从以下简历文本中提取结构化信息：\n\n${rawText.slice(0, 8000)}`);
      const extracted = parseJSON(raw);

      await query(
        `UPDATE candidates SET parsed_info = parsed_info || $2::jsonb, updated_at = now() WHERE id = $1`,
        [c.id, JSON.stringify({...pInfo, ...extracted})],
      );
      parsed++;
    } catch {
      failed++;
    }
  }

  const summary = `解析 ${parsed} 份简历成功，${failed} 份失败`;
  await updateAgentStats(String(agent.id), agent, parsed, parsed, failed, 0, summary);
  return {processed: parsed, approved: parsed, rejected: failed, pending: 0, summary, duration: Date.now() - start};
}

// ─── Screener: 简历筛选评分 ──────────────────────────────────────

export async function runScreener(agent: Record<string, unknown>): Promise<RunResult> {
  const config = (typeof agent.config === 'string' ? JSON.parse(agent.config) : agent.config || {}) as AgentConfig;
  if (!config.positionId) throw new Error('请先绑定岗位');
  const aiConfig = await resolveAIConfig(config.aiModelConfigId);
  const position = await getPositionDetail(config.positionId);
  const start = Date.now();

  // Find candidates that are parsed but not yet graded (or empty grade)
  const candidates = await query(
    `SELECT id, parsed_info FROM candidates
     WHERE parsed_info IS NOT NULL
       AND (grade IS NULL OR grade = '' OR score_total IS NULL OR score_total = 0)
       AND parsed_info::text LIKE '%rawText%'
     ORDER BY created_at DESC
     LIMIT 20`,
  );

  if (candidates.length === 0) {
    return {processed: 0, approved: 0, rejected: 0, pending: 0, summary: '没有需要评分的候选人', duration: Date.now() - start};
  }

  const systemPrompt = buildSystemPrompt(position.aiPrompt, position.scoringRules as Array<{dimension: string; weight: number; keywords: string[]; matchMode?: 'all' | 'any'}>);
  let approved = 0;
  let rejected = 0;
  let pending = 0;

  for (const c of candidates) {
    try {
      const pInfo = typeof c.parsed_info === 'string' ? JSON.parse(String(c.parsed_info)) : c.parsed_info as Record<string, unknown>;
      const rawText = String(pInfo?.rawText || pInfo?.raw_text || '');
      if (!rawText || rawText.length < 20) { rejected++; continue; }

      const userMsg = buildUserMessage(rawText, position.name);
      const raw = await callLLM(aiConfig, systemPrompt, userMsg);
      const result = parseJSON(raw);

      const totalScore = Number(result.totalScore) || 0;
      const grade = mapRecommendationToGrade(String(result.recommendation || ''));

      await query(
        `UPDATE candidates SET grade = $2, score_total = $3, updated_at = now() WHERE id = $1`,
        [c.id, grade, totalScore],
      );

      if (['A', 'B+'].includes(grade)) approved++;
      else if (grade === 'C') rejected++;
      else pending++;
    } catch {
      rejected++;
    }
  }

  const processed = approved + rejected + pending;
  const summary = `评分 ${processed} 人，推荐 ${approved} 人，不推荐 ${rejected} 人，待定 ${pending} 人`;
  await updateAgentStats(String(agent.id), agent, processed, approved, rejected, pending, summary);
  return {processed, approved, rejected, pending, summary, duration: Date.now() - start};
}

// ─── Matcher: 岗位匹配排名 ──────────────────────────────────────

export async function runMatcher(agent: Record<string, unknown>): Promise<RunResult> {
  const config = (typeof agent.config === 'string' ? JSON.parse(agent.config) : agent.config || {}) as AgentConfig;
  if (!config.positionId) throw new Error('请先绑定岗位');
  const aiConfig = await resolveAIConfig(config.aiModelConfigId);
  const position = await getPositionDetail(config.positionId);
  const start = Date.now();

  // Get candidates that are parsed and scored
  const candidates = await query(
    `SELECT id, parsed_info, grade, score_total FROM candidates
     WHERE parsed_info IS NOT NULL
       AND parsed_info::text LIKE '%rawText%'
       AND grade IS NOT NULL AND grade != ''
     ORDER BY score_total DESC NULLS LAST
     LIMIT 20`,
  );

  if (candidates.length < 2) {
    return {processed: 0, approved: 0, rejected: 0, pending: 0, summary: '至少需要 2 名已评分候选人才可排名', duration: Date.now() - start};
  }

  const indexed = candidates.map((c: Record<string, unknown>, i: number) => {
    const pInfo = typeof c.parsed_info === 'string' ? JSON.parse(String(c.parsed_info)) : c.parsed_info as Record<string, unknown>;
    return {index: i, id: String(c.id), resumeText: String(pInfo?.rawText || pInfo?.raw_text || '')};
  }).filter(c => c.resumeText.length >= 20);

  if (indexed.length < 2) {
    return {processed: 0, approved: 0, rejected: 0, pending: 0, summary: '有效简历不足 2 份', duration: Date.now() - start};
  }

  const systemPrompt = buildRankingSystemPrompt(position.aiPrompt, position.scoringRules as Array<{dimension: string; weight: number; keywords: string[]; matchMode?: 'all' | 'any'}>);
  const userMsg = buildRankingUserMessage(indexed, position.name);
  const raw = await callLLM(aiConfig, systemPrompt, userMsg);
  const result = parseJSON(raw);

  const ranking = (result.ranking || []) as Array<{candidateIndex: number; totalScore: number}>;
  const topCount = Math.min(5, ranking.length);

  const summary = `排名 ${indexed.length} 人，前 ${topCount} 名推荐`;
  await updateAgentStats(String(agent.id), agent, indexed.length, topCount, 0, indexed.length - topCount, summary);

  return {
    processed: indexed.length,
    approved: topCount,
    rejected: 0,
    pending: indexed.length - topCount,
    summary,
    duration: Date.now() - start,
  };
}

// ─── Update agent stats after run ───────────────────────────────

async function updateAgentStats(
  agentId: string,
  agent: Record<string, unknown>,
  processed: number,
  approved: number,
  rejected: number,
  pending: number,
  summary: string,
) {
  const prevConfig = typeof agent.config === 'string' ? JSON.parse(agent.config) : (agent.config || {}) as AgentConfig;
  const newConfig: AgentConfig = {
    ...prevConfig,
    processedCount: (prevConfig.processedCount || 0) + processed,
    lastRunAt: new Date().toISOString(),
    lastRunSummary: summary,
  };

  await query(
    `UPDATE agents
     SET config = $2,
         pushed_today = pushed_today + $3,
         approved = approved + $4,
         rejected = rejected + $5,
         pending_count = pending_count + $6,
         adoption_rate = CASE WHEN (approved + $4 + rejected + $5) = 0 THEN 0
                              ELSE ROUND(((approved + $4)::numeric / (approved + $4 + rejected + $5)) * 100, 2)
                         END,
         updated_at = now()
     WHERE id = $1`,
    [agentId, JSON.stringify(newConfig), processed, approved, rejected, pending],
  );
}
