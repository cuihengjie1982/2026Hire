import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';
import { callLLM } from '../_shared/llmClient.ts';
import { buildSystemPrompt, buildUserMessage, buildRankingSystemPrompt, buildRankingUserMessage } from '../_shared/promptBuilder.ts';
import { parseJSONResponse } from '../_shared/jsonParser.ts';

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function resolveAIConfig(supabase: ReturnType<typeof createSupabaseAdmin>, configId?: string) {
  let row: Record<string, unknown> | null = null;

  if (configId) {
    const { data } = await supabase.from('ai_model_configs').select('*').eq('id', configId).eq('is_active', true).single();
    row = data as Record<string, unknown> | null;
  }
  if (!row) {
    const { data } = await supabase.from('ai_model_configs').select('*').eq('is_default', true).eq('is_active', true).limit(1).single();
    row = data as Record<string, unknown> | null;
  }
  if (!row) {
    const { data } = await supabase.from('ai_model_configs').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1).single();
    row = data as Record<string, unknown> | null;
  }
  if (!row) throw new Error('没有可用的 AI 模型配置');
  return {
    id: String(row.id), provider: String(row.provider), model_name: String(row.model_name),
    api_key: String(row.api_key), base_url: row.base_url ? String(row.base_url) : null,
    temperature: parseFloat(String(row.temperature ?? 0.7)), max_tokens: parseInt(String(row.max_tokens ?? 4096)),
  };
}

async function getPositionDetail(supabase: ReturnType<typeof createSupabaseAdmin>, positionId: string) {
  const { data: pos } = await supabase.from('positions').select('name').eq('id', positionId).single();
  if (!pos) throw new Error(`岗位 ${positionId} 不存在`);
  const { data: detail } = await supabase.from('position_details').select('scoring_rules, grade_rules, ai_prompt').eq('position_id', positionId).single();
  const d = (detail ?? {}) as Record<string, unknown>;
  return {
    name: String((pos as Record<string, unknown>).name),
    scoringRules: typeof d.scoring_rules === 'string' ? JSON.parse(d.scoring_rules) : (d.scoring_rules ?? []),
    gradeRules: typeof d.grade_rules === 'string' ? JSON.parse(d.grade_rules) : (d.grade_rules ?? []),
    aiPrompt: String(d.ai_prompt || ''),
  };
}

function mapRecToGrade(rec: string): string {
  switch (rec) {
    case '强烈推荐': return 'A';
    case '推荐': return 'B+';
    case '考虑': return 'B';
    case '不推荐': return 'C';
    default: return 'B';
  }
}

// ─── Single-candidate processing (exported for auto-trigger) ────

const PARSER_SYSTEM_PROMPT = `你是一个简历信息提取助手。从用户提供的简历文本中提取结构化信息，以 JSON 格式返回。\n\n必须返回以下字段（如果没有则留空）：name, gender, phone, email, location, highestEducation, school, major, skills(数组), workExperience(数组{company,role,period,desc})。\n\n只返回纯 JSON。`;

/** Parse a single candidate's resume text with LLM. Returns extracted fields. */
export async function parseOneCandidate(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  aiConfig: Record<string, unknown>,
  candidateId: string,
  rawText: string,
): Promise<Record<string, unknown>> {
  const raw = await callLLM(aiConfig as Parameters<typeof callLLM>[0], PARSER_SYSTEM_PROMPT, `请从以下简历文本中提取结构化信息：\n\n${rawText.slice(0, 8000)}`);
  const extracted = parseJSONResponse(raw);

  const { data: existing } = await supabase.from('candidates').select('parsed_info').eq('id', candidateId).single();
  const existingRow = existing as Record<string, unknown> | null;
  const pInfo = existingRow?.parsed_info
    ? (typeof existingRow.parsed_info === 'string' ? JSON.parse(String(existingRow.parsed_info)) : (existingRow.parsed_info as Record<string, unknown> || {}))
    : {};

  await supabase.from('candidates').update({
    parsed_info: { ...pInfo, ...extracted },
    updated_at: new Date().toISOString(),
  }).eq('id', candidateId);

  return extracted;
}

/** Score a single candidate against a position's criteria. */
export async function screenOneCandidate(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  aiConfig: Record<string, unknown>,
  position: { name: string; scoringRules: unknown[]; gradeRules: unknown[]; aiPrompt: string },
  candidateId: string,
  rawText: string,
): Promise<{ totalScore: number; grade: string; recommendation: string }> {
  const systemPrompt = buildSystemPrompt(position.aiPrompt, position.scoringRules as Parameters<typeof buildSystemPrompt>[1]);
  const userMsg = buildUserMessage(rawText, position.name);
  const raw = await callLLM(aiConfig as Parameters<typeof callLLM>[0], systemPrompt, userMsg);
  const result = parseJSONResponse(raw);

  const totalScore = Number(result.totalScore) || 0;
  const recommendation = String(result.recommendation || '');
  const grade = mapRecToGrade(recommendation);

  await supabase.from('candidates').update({ grade, score_total: totalScore, updated_at: new Date().toISOString() }).eq('id', candidateId);

  return { totalScore, grade, recommendation };
}

// ─── Agent stats update helper ───────────────────────────────────

async function updateAgentStats(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  agentId: string, agent: Record<string, unknown>,
  processed: number, approved: number, rejected: number, pending: number, summary: string,
) {
  const prevConfig = typeof agent.config === 'string' ? JSON.parse(agent.config) : (agent.config || {});
  const newConfig = {
    ...prevConfig,
    processedCount: ((prevConfig as Record<string, unknown>).processedCount || 0) as number + processed,
    lastRunAt: new Date().toISOString(),
    lastRunSummary: summary,
  };

  await supabase.from('agents').update({
    config: newConfig,
    pushed_today: ((agent.pushed_today as number) || 0) + processed,
    approved: ((agent.approved as number) || 0) + approved,
    rejected: ((agent.rejected as number) || 0) + rejected,
    pending_count: ((agent.pending_count as number) || 0) + pending,
    updated_at: new Date().toISOString(),
  }).eq('id', agentId);
}

// ─── Auto-trigger: called after candidate import ─────────────────

/**
 * Find and run autoRun agents for a newly imported candidate.
 * Called fire-and-forget from candidate-ops — errors are caught internally.
 */
export async function autoTriggerForCandidate(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  candidateId: string,
  positionId?: string | null,
): Promise<void> {
  try {
    if (!positionId) return;

    // Get candidate's rawText
    const { data: candidateRow } = await supabase.from('candidates').select('parsed_info').eq('id', candidateId).single();
    if (!candidateRow) return;

    const candidate = candidateRow as Record<string, unknown>;
    const pInfo = candidate.parsed_info
      ? (typeof candidate.parsed_info === 'string' ? JSON.parse(String(candidate.parsed_info)) : candidate.parsed_info as Record<string, unknown>)
      : {};
    const rawText = String(pInfo?.rawText || pInfo?.raw_text || '');
    if (rawText.length < 20) return;

    // Find running agents with autoRun=true:
    // - Screener agents: must match the candidate's position
    // - Parser agents: match position OR be global (positionId = null)
    const [posMatch, globalParsers] = await Promise.all([
      supabase.from('agents')
        .select('*')
        .eq('status', 'running')
        .in('type', ['parser', 'screener'])
        .filter('config->>positionId', 'eq', positionId)
        .filter('config->>autoRun', 'eq', 'true'),
      supabase.from('agents')
        .select('*')
        .eq('status', 'running')
        .eq('type', 'parser')
        .is('config->>positionId', null)
        .filter('config->>autoRun', 'eq', 'true'),
    ]);

    const agents = [...(posMatch.data ?? []), ...(globalParsers.data ?? [])];

    if (!agents || agents.length === 0) return;

    for (const agent of agents as Record<string, unknown>[]) {
      try {
        const config = (typeof agent.config === 'string' ? JSON.parse(agent.config) : (agent.config || {})) as Record<string, unknown>;
        const aiConfig = await resolveAIConfig(supabase, config.aiModelConfigId as string | undefined);
        const type = String(agent.type || '');

        if (type === 'parser') {
          const hasName = pInfo?.name && String(pInfo.name).trim().length > 0;
          if (!hasName) {
            await parseOneCandidate(supabase, aiConfig, candidateId, rawText);
            await updateAgentStats(supabase, String(agent.id), agent, 1, 1, 0, 0, `自动解析候选人 ${candidateId.slice(0, 8)}`);
          }
        } else if (type === 'screener') {
          const { data: checkRow } = await supabase.from('candidates').select('grade, score_total').eq('id', candidateId).single();
          const check = (checkRow ?? {}) as Record<string, unknown>;
          const needsScoring = !check.grade || !check.score_total;
          if (needsScoring) {
            const position = await getPositionDetail(supabase, positionId);
            const result = await screenOneCandidate(supabase, aiConfig, position, candidateId, rawText);
            const approved = ['A', 'B+'].includes(result.grade) ? 1 : 0;
            const rejected = result.grade === 'C' ? 1 : 0;
            const pending = approved + rejected === 0 ? 1 : 0;
            await updateAgentStats(supabase, String(agent.id), agent, 1, approved, rejected, pending,
              `自动评分候选人 ${candidateId.slice(0, 8)}: ${result.grade}`);
          }
        }
      } catch (e) {
        console.error(`[autoTrigger] Agent ${agent.id} failed for candidate ${candidateId}:`, e);
      }
    }
  } catch (e) {
    console.error(`[autoTrigger] Failed for candidate ${candidateId}:`, e);
  }
}

// ─── Agent CRUD ─────────────────────────────────────────────────

export const handleAgents = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  const supabase = createSupabaseAdmin(req);
  const method = req.method;

  try {
    if (method === 'GET') {
      const { data } = await supabase.from('agents').select('*').order('created_at', { ascending: false });
      return jsonRes(data ?? []);
    }

    if (method === 'POST') {
      const body = await req.json() as Record<string, unknown>;
      const { name, type, roleType, config, projectId, projectName, description } = body;
      if (!name) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'name is required' } }, 400);

      const { data, error } = await supabase.from('agents').insert({
        name: String(name),
        type: type ? String(type) : null,
        role_type: roleType ? String(roleType) : null,
        config: config || {},
        project_id: projectId ? String(projectId) : null,
        project_name: projectName ? String(projectName) : null,
        description: description ? String(description) : null,
        status: 'pending',
      }).select('*').single();

      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      return jsonRes(data, 201);
    }

    if (method === 'PATCH') {
      const body = await req.json() as Record<string, unknown>;
      const { id, ...updates } = body;
      if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id is required' } }, 400);

      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (updates.name !== undefined) row.name = updates.name;
      if (updates.description !== undefined) row.description = updates.description;
      if (updates.type !== undefined) row.type = updates.type;
      if (updates.roleType !== undefined) row.role_type = updates.roleType;
      if (updates.config !== undefined) row.config = updates.config;
      if (updates.status !== undefined) row.status = updates.status;
      if (updates.projectId !== undefined) row.project_id = updates.projectId;
      if (updates.projectName !== undefined) row.project_name = updates.projectName;

      const { data, error } = await supabase.from('agents').update(row).eq('id', String(id)).select('*').single();
      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
      return jsonRes(data);
    }

    if (method === 'DELETE') {
      const body = await req.json() as Record<string, unknown>;
      const { id } = body;
      if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id is required' } }, 400);

      const { data, error } = await supabase.from('agents').delete().eq('id', String(id)).select('id').single();
      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
      return jsonRes({ deleted: true, id: String(id) });
    }

    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: `Method ${method} not allowed` } }, 405);
  } catch (e) {
    console.error('[agent-executor] CRUD:', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// ─── Route handler: POST /agent-executor/run ─────────────────────

interface RunResult { processed: number; approved: number; rejected: number; pending: number; summary: string; duration: number; }

export const runAgent = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const { agentId } = await req.json() as Record<string, unknown>;
    if (!agentId) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'agentId is required' } }, 400);

    const { data: agentRow } = await supabase.from('agents').select('*').eq('id', String(agentId)).single();
    if (!agentRow) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);

    const agent = agentRow as Record<string, unknown>;
    const type = String(agent.type || '');
    const config = typeof agent.config === 'string' ? JSON.parse(agent.config) : (agent.config || {});
    const agentConfig = config as Record<string, unknown>;
    const aiConfig = await resolveAIConfig(supabase, agentConfig.aiModelConfigId as string | undefined);

    let result;
    switch (type) {
      case 'parser': result = await runParser(supabase, aiConfig, agent); break;
      case 'screener': result = await runScreener(supabase, aiConfig, agent); break;
      case 'matcher': result = await runMatcher(supabase, aiConfig, agent); break;
      default: return jsonRes({ error: { code: 'INVALID_TYPE', message: `Unknown agent type: ${type}` } }, 400);
    }

    const { data: updated } = await supabase.from('agents').select('*').eq('id', String(agentId)).single();
    return jsonRes({ ...updated, runResult: result });
  } catch (e) {
    console.error('[agent-executor]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// ─── Batch agents (manual trigger, backward-compatible) ──────────

async function runParser(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  aiConfig: Record<string, unknown>,
  agent: Record<string, unknown>,
): Promise<RunResult> {
  const start = Date.now();
  const { data: candidates } = await supabase.from('candidates')
    .select('id, parsed_info')
    .not('parsed_info', 'is', null)
    .order('created_at', { ascending: false }).limit(20);

  let parsed = 0, failed = 0;
  for (const c of (candidates ?? []) as Record<string, unknown>[]) {
    try {
      const pInfo = typeof c.parsed_info === 'string' ? JSON.parse(String(c.parsed_info)) : c.parsed_info as Record<string, unknown>;
      const rawText = String(pInfo?.rawText || pInfo?.raw_text || '');
      if (!rawText || rawText.length < 20) { failed++; continue; }

      await parseOneCandidate(supabase, aiConfig, String(c.id), rawText);
      parsed++;
    } catch (e) { console.error('[agent-executor] parse candidate failed:', e); failed++; }
  }

  const summary = `解析 ${parsed} 份简历成功，${failed} 份失败`;
  await updateAgentStats(supabase, String(agent.id), agent, parsed, parsed, failed, 0, summary);
  return { processed: parsed, approved: parsed, rejected: failed, pending: 0, summary, duration: Date.now() - start };
}

async function runScreener(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  aiConfig: Record<string, unknown>,
  agent: Record<string, unknown>,
): Promise<RunResult> {
  const config = typeof agent.config === 'string' ? JSON.parse(agent.config) : (agent.config || {}) as Record<string, unknown>;
  if (!config.positionId) throw new Error('请先绑定岗位');

  const position = await getPositionDetail(supabase, String(config.positionId));
  const positionId = String(config.positionId);
  const start = Date.now();

  const { data: candidates } = await supabase.from('candidates')
    .select('id, parsed_info')
    .eq('position_id', positionId)
    .not('parsed_info', 'is', null)
    .or('grade.is.null,grade.eq.,score_total.is.null,score_total.eq.0')
    .order('created_at', { ascending: false }).limit(20);

  if (!candidates || candidates.length === 0) {
    return { processed: 0, approved: 0, rejected: 0, pending: 0, summary: '没有需要评分的候选人', duration: Date.now() - start };
  }

  let approved = 0, rejected = 0, pending = 0;
  for (const c of candidates as Record<string, unknown>[]) {
    try {
      const pInfo = typeof c.parsed_info === 'string' ? JSON.parse(String(c.parsed_info)) : c.parsed_info as Record<string, unknown>;
      const rawText = String(pInfo?.rawText || pInfo?.raw_text || '');
      if (!rawText || rawText.length < 20) { rejected++; continue; }

      const result = await screenOneCandidate(supabase, aiConfig, position, String(c.id), rawText);

      if (['A', 'B+'].includes(result.grade)) approved++;
      else if (result.grade === 'C') rejected++;
      else pending++;
    } catch (e) { console.error('[agent-executor] screen candidate failed:', e); rejected++; }
  }

  const processed = approved + rejected + pending;
  const summary = `评分 ${processed} 人，推荐 ${approved} 人，不推荐 ${rejected} 人，待定 ${pending} 人`;
  await updateAgentStats(supabase, String(agent.id), agent, processed, approved, rejected, pending, summary);
  return { processed, approved, rejected, pending, summary, duration: Date.now() - start };
}

async function runMatcher(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  aiConfig: Record<string, unknown>,
  agent: Record<string, unknown>,
): Promise<RunResult> {
  const config = typeof agent.config === 'string' ? JSON.parse(agent.config) : (agent.config || {}) as Record<string, unknown>;
  if (!config.positionId) throw new Error('请先绑定岗位');

  const position = await getPositionDetail(supabase, String(config.positionId));
  const positionId = String(config.positionId);
  const start = Date.now();

  const { data: candidates } = await supabase.from('candidates')
    .select('id, parsed_info, grade, score_total')
    .eq('position_id', positionId)
    .not('parsed_info', 'is', null)
    .not('grade', 'is', null)
    .order('score_total', { ascending: false, nullsFirst: false }).limit(20);

  if (!candidates || candidates.length < 2) {
    return { processed: 0, approved: 0, rejected: 0, pending: 0, summary: '至少需要 2 名已评分候选人才可排名', duration: Date.now() - start };
  }

  const indexed = (candidates as Record<string, unknown>[]).map((c, i) => {
    const pInfo = typeof c.parsed_info === 'string' ? JSON.parse(String(c.parsed_info)) : c.parsed_info as Record<string, unknown>;
    return { index: i, id: String(c.id), resumeText: String(pInfo?.rawText || pInfo?.raw_text || '') };
  }).filter(c => c.resumeText.length >= 20);

  if (indexed.length < 2) {
    return { processed: 0, approved: 0, rejected: 0, pending: 0, summary: '有效简历不足 2 份', duration: Date.now() - start };
  }

  const systemPrompt = buildRankingSystemPrompt(position.aiPrompt, position.scoringRules as Parameters<typeof buildRankingSystemPrompt>[1]);
  const userMsg = buildRankingUserMessage(indexed, position.name);
  const raw = await callLLM(aiConfig as Parameters<typeof callLLM>[0], systemPrompt, userMsg);
  const result = parseJSONResponse(raw);

  const ranking = (result.ranking || []) as Array<{ candidateIndex: number; totalScore: number }>;
  const topCount = Math.min(5, ranking.length);
  const summary = `排名 ${indexed.length} 人，前 ${topCount} 名推荐`;

  await updateAgentStats(supabase, String(agent.id), agent, indexed.length, topCount, 0, indexed.length - topCount, summary);
  return { processed: indexed.length, approved: topCount, rejected: 0, pending: indexed.length - topCount, summary, duration: Date.now() - start };
}
