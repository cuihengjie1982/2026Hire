import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';
import { callLLM } from '../_shared/llmClient.ts';
import { transcribeAudio } from '../_shared/whisperClient.ts';
import { buildInterviewScoringSystemPrompt, buildInterviewScoringUserMessage } from '../_shared/promptBuilder.ts';
import { parseJSONResponse } from '../_shared/jsonParser.ts';
import { notifyByRole } from '../notifications/index.ts';

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function resolveConfig(supabase: ReturnType<typeof createSupabaseAdmin>, filter: Record<string, unknown>) {
  let q = supabase.from('ai_model_configs').select('*').eq('is_active', true);
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { data } = await q.order('is_default', { ascending: false }).order('created_at', { ascending: false }).limit(1).single();
  return data as Record<string, unknown> | null;
}

async function resolveLLMConfig(supabase: ReturnType<typeof createSupabaseAdmin>) {
  let row = await resolveConfig(supabase, { is_default: true });
  if (!row) {
    const { data } = await supabase.from('ai_model_configs').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1).single();
    row = data as Record<string, unknown> | null;
  }
  if (!row) return null;
  return {
    id: String(row.id), provider: String(row.provider), model_name: String(row.model_name),
    api_key: String(row.api_key), base_url: row.base_url ? String(row.base_url) : null,
    temperature: parseFloat(String(row.temperature ?? 0.7)),
    max_tokens: parseInt(String(row.max_tokens ?? 4096)),
  };
}

// POST transcribe-and-score
export const transcribeAndScore = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const formData = await req.formData();
    const audioBlob = formData.get('audio') as Blob | null;
    if (!audioBlob) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Audio file is required' } }, 400);

    // Validate audio type
    const validAudioTypes = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/x-webm'];
    if (audioBlob.type && !validAudioTypes.some(t => audioBlob.type.startsWith(t.split('/')[0]))) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: `Unsupported audio format: ${audioBlob.type}` } }, 400);
    }

    const sessionId = (formData.get('sessionId') as string) || '';
    if (!sessionId) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'sessionId is required' } }, 400);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Invalid sessionId format' } }, 400);
    }

    const questionId = (formData.get('questionId') as string) || null;
    const questionTitle = (formData.get('questionTitle') as string) || '';
    const questionPrompt = (formData.get('questionPrompt') as string) || '';
    const audioDuration = parseInt((formData.get('audioDuration') as string) || '0') || 0;
    const frontendTranscript = (formData.get('transcript') as string) || '';

    let scoringGuide: Record<string, unknown> = {};
    let linkedDimensions: string[] = [];
    try { scoringGuide = JSON.parse((formData.get('scoringGuide') as string) || '{}'); } catch { /* */ }
    try { linkedDimensions = JSON.parse((formData.get('linkedDimensions') as string) || '[]'); } catch { /* */ }

    // Create pending answer_score row
    const { data: answerRow } = await supabase.from('interview_answer_scores').insert({
      session_id: sessionId, question_id: questionId, question_title: questionTitle,
      question_prompt: questionPrompt, audio_duration: audioDuration,
      scoring_guide_used: JSON.stringify(scoringGuide), status: 'pending',
    }).select('*').single();
    const answerId = String((answerRow as Record<string, unknown>)?.id ?? '');

    // Step 1: Get transcript
    let transcript = '';
    if (frontendTranscript.trim().length > 0) {
      transcript = frontendTranscript.trim();
      await supabase.from('interview_answer_scores').update({ status: 'transcribing', transcript }).eq('id', answerId);
    } else {
      const openaiRow = await resolveConfig(supabase, { provider: 'openai' });
      if (!openaiRow) {
        await supabase.from('interview_answer_scores').update({ status: 'failed', error_message: '未找到 OpenAI API 配置' }).eq('id', answerId);
        const { data } = await supabase.from('interview_answer_scores').select('*').eq('id', answerId).single();
        return jsonRes(data);
      }
      await supabase.from('interview_answer_scores').update({ status: 'transcribing' }).eq('id', answerId);
      try {
        const whisperResult = await transcribeAudio(audioBlob, audioBlob.type || 'audio/webm', String(openaiRow.api_key), openaiRow.base_url ? String(openaiRow.base_url) : undefined);
        transcript = whisperResult.text;
      } catch {
        await supabase.from('interview_answer_scores').update({ status: 'failed', error_message: 'Transcription failed', transcript: '' }).eq('id', answerId);
        const { data } = await supabase.from('interview_answer_scores').select('*').eq('id', answerId).single();
        return jsonRes(data);
      }
    }

    // Step 2: Score with LLM
    await supabase.from('interview_answer_scores').update({ status: 'scoring', transcript }).eq('id', answerId);
    const llmConfig = await resolveLLMConfig(supabase);
    if (!llmConfig) {
      await supabase.from('interview_answer_scores').update({ status: 'failed', error_message: '未找到可用的 AI 模型配置' }).eq('id', answerId);
      const { data } = await supabase.from('interview_answer_scores').select('*').eq('id', answerId).single();
      return jsonRes(data);
    }

    const scoringDimensions = linkedDimensions.length > 0
      ? linkedDimensions.map(name => ({ name, maxScore: 100 }))
      : [{ name: '综合评估', maxScore: 100 }];

    const systemPrompt = buildInterviewScoringSystemPrompt(scoringDimensions, scoringGuide as { standard?: string; rubric?: Array<{ label: string; score: string }> });
    const userMessage = buildInterviewScoringUserMessage(questionTitle, questionPrompt, transcript);

    try {
      const raw = await callLLM(llmConfig, systemPrompt, userMessage);
      const parsed = parseJSONResponse(raw);
      const score = typeof parsed.score === 'number' ? parsed.score : 0;
      const scoreReasoning = typeof parsed.overallAssessment === 'string' ? parsed.overallAssessment : '';
      const dimensionScores = Array.isArray(parsed.dimensionScores) ? parsed.dimensionScores : [];

      await supabase.from('interview_answer_scores').update({
        status: 'completed', score, max_score: 100, score_reasoning: scoreReasoning,
        dimension_scores: JSON.stringify(dimensionScores), llm_model: llmConfig.model_name, llm_provider: llmConfig.provider,
      }).eq('id', answerId);
    } catch {
      await supabase.from('interview_answer_scores').update({ status: 'failed', error_message: 'Scoring failed' }).eq('id', answerId);
    }

    const { data: updated } = await supabase.from('interview_answer_scores').select('*').eq('id', answerId).single();
    return jsonRes(updated);
  } catch {
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// POST aggregate/:sessionId
export const aggregate = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const url = new URL(req.url);
    const match = url.pathname.match(/\/aggregate\/([^/]+)/);
    if (!match) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'sessionId required in URL' } }, 400);

    const sessionId = match[1];
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Invalid sessionId format' } }, 400);
    }

    const supabase = createSupabaseAdmin(req);

    const { data: session } = await supabase.from('interview_sessions').select('*, candidates(id,name,email), interview_templates(id,name,scoring_config,grade_rules,position_id,positions(id,name))').eq('id', sessionId).single();
    if (!session) return jsonRes({ error: { code: 'NOT_FOUND', message: `Session ${sessionId} not found` } }, 404);

    const s = session as Record<string, unknown>;
    const candidate = s.candidates as Record<string, unknown> | null;
    const template = s.interview_templates as Record<string, unknown> | null;
    const position = template?.positions as Record<string, unknown> | null;

    const { data: answers } = await supabase.from('interview_answer_scores').select('*').eq('session_id', sessionId).order('created_at');
    const allAnswers = (answers ?? []) as Record<string, unknown>[];
    const completed = allAnswers.filter(a => a.status === 'completed');

    let scoringConfig: { dimensions?: Array<{ name: string; maxScore: number }>; baseScore?: number } = {};
    try { scoringConfig = typeof template?.scoring_config === 'string' ? JSON.parse(template.scoring_config) : (template?.scoring_config as Record<string, unknown>) as typeof scoringConfig; } catch { /* */ }

    const dimMap = new Map<string, { total: number; count: number; maxScore: number }>();
    for (const answer of completed) {
      let dims: Array<{ dimension: string; score: number; maxScore: number }> = [];
      try { dims = typeof answer.dimension_scores === 'string' ? JSON.parse(answer.dimension_scores) : (answer.dimension_scores as Array<unknown>) as typeof dims; } catch { /* */ }
      for (const d of dims) {
        const existing = dimMap.get(d.dimension);
        if (existing) { existing.total += d.score; existing.count += 1; }
        else dimMap.set(d.dimension, { total: d.score, count: 1, maxScore: d.maxScore || 100 });
      }
    }

    let dimensions: Array<{ name: string; score: number; weight: number }>;
    if (dimMap.size > 0) {
      dimensions = Array.from(dimMap.entries()).map(([name, data]) => ({ name, score: Math.round(data.total / data.count), weight: data.maxScore }));
    } else {
      const avg = completed.length > 0 ? completed.reduce((sum, a) => sum + (Number(a.score) || 0), 0) / completed.length : 0;
      dimensions = [
        { name: '专业能力', score: Math.round(avg), weight: 30 },
        { name: '沟通表达', score: Math.round(avg * 0.95), weight: 25 },
        { name: '应变能力', score: Math.round(avg * 0.9), weight: 25 },
        { name: '综合素质', score: Math.round(avg * 0.92), weight: 20 },
      ];
    }

    const baseScore = scoringConfig.baseScore || 0;
    const totalScore = Math.min(100, Math.round(baseScore + dimensions.reduce((sum, d) => sum + d.score * (d.weight / 100), 0)));

    let gradeRules: Array<{ grade: string; minScore: number; maxScore: number; label: string }> = [];
    try { gradeRules = typeof template?.grade_rules === 'string' ? JSON.parse(template.grade_rules) : (template?.grade_rules as Array<unknown>) as typeof gradeRules; } catch { /* */ }

    let grade: string, gradeLabel: string;
    if (gradeRules.length > 0) {
      const matched = gradeRules.find(r => totalScore >= r.minScore && totalScore <= r.maxScore);
      grade = matched ? matched.grade.toLowerCase() : (totalScore >= 60 ? 'qualified' : 'rejected');
      gradeLabel = matched?.label ?? (totalScore >= 60 ? '基本合格' : '未达标');
    } else {
      if (totalScore >= 80) { grade = 'excellent'; gradeLabel = '表现优秀，强烈推荐录用'; }
      else if (totalScore >= 70) { grade = 'good'; gradeLabel = '表现良好，建议进入下一轮'; }
      else if (totalScore >= 60) { grade = 'qualified'; gradeLabel = '基本合格，可考虑录用'; }
      else { grade = 'pending'; gradeLabel = '未达到录用标准'; }
    }

    const questionAnswers = allAnswers.map(a => ({
      questionTitle: a.question_title, questionPrompt: a.question_prompt,
      audioDuration: a.audio_duration, transcript: a.transcript,
      score: a.score != null ? Number(a.score) : null, maxScore: a.max_score != null ? Number(a.max_score) : null,
      scoreReasoning: a.score_reasoning, status: a.status, errorMessage: a.error_message,
    }));

    const candidateId = String(s.candidate_id);
    const candidateName = String(candidate?.name ?? '未知');
    const candidateEmail = String(candidate?.email ?? '');
    const templateName = String(template?.name ?? 'AI面试');
    const positionId = position?.id ? String(position.id) : null;
    const positionName = position?.name ? String(position.name) : null;
    const totalDuration = allAnswers.reduce((sum, a) => sum + (Number(a.audio_duration) || 0), 0);
    const durationMinutes = Math.max(1, Math.round(totalDuration / 60));

    const { data: result } = await supabase.from('interview_results').insert({
      session_id: sessionId, candidate_id: candidateId, candidate_name: candidateName,
      candidate_email: candidateEmail, position: positionName, template_name: templateName,
      interview_date: new Date().toISOString(), total_score: totalScore, grade, grade_label: gradeLabel,
      dimensions: JSON.stringify(dimensions), duration: durationMinutes, status: 'completed',
      question_answers: JSON.stringify(questionAnswers),
    }).select('*').single();

    await supabase.from('interview_sessions').update({ status: 'scored', submitted_at: new Date().toISOString() }).eq('id', sessionId);

    await supabase.from('approval_requests').insert({
      type: 'interview_result', candidate_id: candidateId, candidate_name: candidateName,
      candidate_email: candidateEmail, position_id: positionId, position_name: positionName,
      interview_score: totalScore, interview_grade: grade, interview_grade_label: gradeLabel,
      interview_date: new Date().toISOString(), interview_duration: durationMinutes,
      dimension_scores: JSON.stringify(dimensions), status: 'pending',
    });

    // Notify hiring managers about the new approval request
    await notifyByRole(supabase, 'hiring_manager', 'approval',
      `面试评分完成：${candidateName}`,
      `${candidateName} 完成了${positionName ? `「${positionName}」` : ''}面试，得分 ${totalScore}，等级：${gradeLabel}`,
      `/approvals`,
    ).catch(() => {});

    return jsonRes(result, 201);
  } catch {
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};
