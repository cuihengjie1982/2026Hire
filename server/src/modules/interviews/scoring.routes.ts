import {Router} from 'express';
import multer from 'multer';
import {query, queryOne, transaction} from '../../config/database.js';
import {callLLM} from '../ai/llmClient.js';
import {transcribeAudio} from '../ai/whisperClient.js';
import {validateUuidParams} from '../../middleware/validateParams.js';
import {buildInterviewScoringSystemPrompt, buildInterviewScoringUserMessage} from '../ai/promptBuilder.js';

const router = Router();

// Multer: memory storage, audio only, 25 MB max
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize: 25 * 1024 * 1024},
  fileFilter: (_req, file, cb) => {
    // Accept audio/* and common fallback MIME types from browsers
    if (file.mimetype.startsWith('audio/') || file.mimetype === 'application/octet-stream') {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported format: ${file.mimetype}`));
    }
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the active OpenAI config (for Whisper). */
async function resolveOpenAIConfig() {
  let row = await queryOne(
    `SELECT * FROM ai_model_configs WHERE provider = 'openai' AND is_active = true ORDER BY is_default DESC, created_at DESC LIMIT 1`,
  );
  return row;
}

/** Resolve the active LLM config (any provider) — same pattern as aiProxy.routes.ts */
async function resolveLLMConfig(preferConfigId?: string) {
  let row: Record<string, unknown> | null = null;
  if (preferConfigId) {
    row = await queryOne(`SELECT * FROM ai_model_configs WHERE id = $1 AND is_active = true`, [preferConfigId]);
  }
  if (!row) {
    row = await queryOne(`SELECT * FROM ai_model_configs WHERE is_default = true AND is_active = true LIMIT 1`);
  }
  if (!row) {
    row = await queryOne(`SELECT * FROM ai_model_configs WHERE is_active = true ORDER BY created_at DESC LIMIT 1`);
  }
  return row;
}

function toConfig(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    provider: row.provider as string,
    model_name: row.model_name as string,
    api_key: row.api_key as string,
    base_url: row.base_url as string | null,
    temperature: parseFloat(String(row.temperature ?? 0.7)),
    max_tokens: parseInt(String(row.max_tokens ?? 4096), 10),
  };
}

/** Parse JSON from LLM response (handles code fences, etc.) */
function parseJSONResponse(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw); } catch { /* */ }
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) { try { return JSON.parse(jsonMatch[1].trim()); } catch { /* */ } }
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch { /* */ } }
  return {score: 0, error: 'Failed to parse structured response', rawResponse: raw.slice(0, 1000)};
}

// ---------------------------------------------------------------------------
// POST /transcribe-and-score — primary per-question endpoint
// ---------------------------------------------------------------------------

router.post('/transcribe-and-score', upload.single('audio'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Audio file is required'}});
      return;
    }

    const sessionId = req.body.sessionId as string;
    const questionId = (req.body.questionId as string) || null;
    const questionTitle = (req.body.questionTitle as string) || '';
    const questionPrompt = (req.body.questionPrompt as string) || '';
    const audioDuration = parseInt(req.body.audioDuration as string) || 0;
    const frontendTranscript = (req.body.transcript as string) || '';

    if (!sessionId) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'sessionId is required'}});
      return;
    }

    // Parse optional JSON fields
    let scoringGuide: Record<string, unknown> = {};
    let linkedDimensions: string[] = [];
    try { scoringGuide = JSON.parse(req.body.scoringGuide || '{}'); } catch { /* keep default */ }
    try { linkedDimensions = JSON.parse(req.body.linkedDimensions || '[]'); } catch { /* keep default */ }

    // Create pending row
    const answerRow = await queryOne(
      `INSERT INTO interview_answer_scores
         (session_id, question_id, question_title, question_prompt, audio_duration, scoring_guide_used, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [sessionId, questionId, questionTitle, questionPrompt, audioDuration, JSON.stringify(scoringGuide)],
    );
    const answerId = (answerRow as Record<string, unknown>).id as string;

    // ---- Step 1: Get transcript ----
    // Priority: frontend Web Speech API transcript > OpenAI Whisper > fallback
    let transcript = '';

    if (frontendTranscript.trim().length > 0) {
      // Frontend already transcribed via Web Speech API (free, real-time)
      transcript = frontendTranscript.trim();
      await query(`UPDATE interview_answer_scores SET status = 'transcribing', transcript = $2 WHERE id = $1`, [answerId, transcript]);
    } else {
      // Fallback: try server-side Whisper
      const openaiRow = await resolveOpenAIConfig();
      if (!openaiRow) {
        await query(`UPDATE interview_answer_scores SET status = 'failed', error_message = '未找到 OpenAI API 配置，且浏览器语音识别未提供文本' WHERE id = $1`, [answerId]);
        const updated = await queryOne(`SELECT * FROM interview_answer_scores WHERE id = $1`, [answerId]);
        res.status(200).json(updated);
        return;
      }

      const openaiConfig = toConfig(openaiRow);
      await query(`UPDATE interview_answer_scores SET status = 'transcribing' WHERE id = $1`, [answerId]);

      try {
        const whisperResult = await transcribeAudio(file.buffer, file.mimetype, openaiConfig.api_key, openaiConfig.base_url || undefined);
        transcript = whisperResult.text || '';
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Whisper transcription failed';
        await query(`UPDATE interview_answer_scores SET status = 'failed', error_message = $2, transcript = '' WHERE id = $1`, [answerId, msg]);
        const updated = await queryOne(`SELECT * FROM interview_answer_scores WHERE id = $1`, [answerId]);
        res.status(200).json(updated);
        return;
      }
    }

    // ---- Step 2: Score with LLM ----
    await query(`UPDATE interview_answer_scores SET status = 'scoring', transcript = $2 WHERE id = $1`, [answerId, transcript]);

    const llmRow = await resolveLLMConfig();
    if (!llmRow) {
      await query(`UPDATE interview_answer_scores SET status = 'failed', error_message = '未找到可用的 AI 模型配置' WHERE id = $1`, [answerId]);
      const updated = await queryOne(`SELECT * FROM interview_answer_scores WHERE id = $1`, [answerId]);
      res.status(200).json(updated);
      return;
    }

    const llmConfig = toConfig(llmRow);

    // Build scoring dimensions from linked dimensions + template config
    const scoringDimensions = linkedDimensions.length > 0
      ? linkedDimensions.map(name => ({name, maxScore: 100}))
      : [{name: '综合评估', maxScore: 100}];

    const systemPrompt = buildInterviewScoringSystemPrompt(scoringDimensions, scoringGuide as {standard?: string; rubric?: Array<{label: string; score: string}>});
    const userMessage = buildInterviewScoringUserMessage(questionTitle, questionPrompt, transcript);

    try {
      const rawResponse = await callLLM(llmConfig, systemPrompt, userMessage);
      const parsed = parseJSONResponse(rawResponse);

      const score = typeof parsed.score === 'number' ? parsed.score : 0;
      const maxScore = 100;
      const scoreReasoning = typeof parsed.overallAssessment === 'string' ? parsed.overallAssessment : '';
      const dimensionScores = Array.isArray(parsed.dimensionScores) ? parsed.dimensionScores : [];

      await query(
        `UPDATE interview_answer_scores
           SET status = 'completed', score = $2, max_score = $3, score_reasoning = $4,
               dimension_scores = $5, llm_model = $6, llm_provider = $7
         WHERE id = $1`,
        [answerId, score, maxScore, scoreReasoning,
         JSON.stringify(dimensionScores), llmConfig.model_name, llmConfig.provider],
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'LLM scoring failed';
      await query(`UPDATE interview_answer_scores SET status = 'failed', error_message = $2 WHERE id = $1`, [answerId, msg]);
    }

    const updated = await queryOne(`SELECT * FROM interview_answer_scores WHERE id = $1`, [answerId]);
    res.status(200).json(updated);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// GET /session/:sessionId — list all answer scores for a session
// ---------------------------------------------------------------------------

router.get('/session/:sessionId', validateUuidParams('sessionId'), async (req, res, next) => {
  try {
    const {sessionId} = req.params;
    const rows = await query(
      `SELECT * FROM interview_answer_scores WHERE session_id = $1 ORDER BY created_at`,
      [sessionId],
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// POST /aggregate/:sessionId — aggregate per-question scores into final result
// ---------------------------------------------------------------------------

router.post('/aggregate/:sessionId', validateUuidParams('sessionId'), async (req, res, next) => {
  try {
    const {sessionId} = req.params;

    // Get session info with position data
    const session = await queryOne(
      `SELECT s.*, c.name AS "candidateName", c.email AS "candidateEmail",
              t.name AS "templateName", t.scoring_config, t.grade_rules, t.position_id,
              p.name AS "positionName"
       FROM interview_sessions s
       LEFT JOIN candidates c ON s.candidate_id = c.id
       LEFT JOIN interview_templates t ON s.template_id = t.id
       LEFT JOIN positions p ON t.position_id = p.id
       WHERE s.id = $1`,
      [sessionId],
    );

    if (!session) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Session (${sessionId}) not found`}});
      return;
    }

    // Get all answer scores
    const answers = await query(
      `SELECT * FROM interview_answer_scores WHERE session_id = $1 ORDER BY created_at`,
      [sessionId],
    );

    const completedAnswers = answers.filter((a: Record<string, unknown>) => a.status === 'completed');
    const failedAnswers = answers.filter((a: Record<string, unknown>) => a.status === 'failed');

    // Parse scoring config
    let scoringConfig: {dimensions?: Array<{name: string; maxScore: number}>; baseScore?: number} = {};
    try {
      const raw = session.scoring_config;
      scoringConfig = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>) as typeof scoringConfig;
    } catch { /* keep default */ }

    // Aggregate dimension scores from all completed answers
    const dimMap = new Map<string, {total: number; count: number; maxScore: number}>();

    for (const answer of completedAnswers) {
      const a = answer as Record<string, unknown>;
      let dims: Array<{dimension: string; score: number; maxScore: number}> = [];
      try {
        const raw = a.dimension_scores;
        dims = typeof raw === 'string' ? JSON.parse(raw) : (raw as Array<unknown>) as typeof dims;
      } catch { /* */ }

      for (const d of dims) {
        const existing = dimMap.get(d.dimension);
        if (existing) {
          existing.total += d.score;
          existing.count += 1;
        } else {
          dimMap.set(d.dimension, {total: d.score, count: 1, maxScore: d.maxScore || 100});
        }
      }
    }

    // If no dimension scores from answers, use template dimensions
    let dimensions: Array<{name: string; score: number; weight: number}>;
    if (dimMap.size > 0) {
      dimensions = Array.from(dimMap.entries()).map(([name, data]) => ({
        name,
        score: Math.round(data.total / data.count),
        weight: data.maxScore,
      }));
    } else if (scoringConfig.dimensions?.length) {
      // Fallback: use template dimensions, distribute average score proportionally
      const avgScore = completedAnswers.length > 0
        ? completedAnswers.reduce((sum: number, a: Record<string, unknown>) => sum + (Number(a.score) || 0), 0) / completedAnswers.length
        : 0;
      dimensions = scoringConfig.dimensions.map(d => ({
        name: d.name,
        score: Math.round(avgScore * d.maxScore / 100),
        weight: d.maxScore,
      }));
    } else {
      // Ultimate fallback
      const avgScore = completedAnswers.length > 0
        ? completedAnswers.reduce((sum: number, a: Record<string, unknown>) => sum + (Number(a.score) || 0), 0) / completedAnswers.length
        : 0;
      dimensions = [
        {name: '专业能力', score: Math.round(avgScore), weight: 30},
        {name: '沟通表达', score: Math.round(avgScore * 0.95), weight: 25},
        {name: '应变能力', score: Math.round(avgScore * 0.9), weight: 25},
        {name: '综合素质', score: Math.round(avgScore * 0.92), weight: 20},
      ];
    }

    const baseScore = scoringConfig.baseScore || 0;
    const totalScore = Math.min(100, Math.round(
      baseScore + dimensions.reduce((sum, d) => sum + d.score * (d.weight / 100), 0),
    ));

    // Compute grade from template grade rules
    let gradeRules: Array<{grade: string; minScore: number; maxScore: number; label: string}> = [];
    try {
      const raw = session.grade_rules;
      gradeRules = typeof raw === 'string' ? JSON.parse(raw) : (raw as Array<unknown>) as typeof gradeRules;
    } catch { /* */ }

    let grade: string;
    let gradeLabel: string;
    if (gradeRules.length > 0) {
      const matched = gradeRules.find(r => totalScore >= r.minScore && totalScore <= r.maxScore);
      if (matched) {
        grade = matched.grade.toLowerCase();
        // Use template label if available, otherwise generate from grade
        if (matched.label) {
          gradeLabel = matched.label;
        } else {
          const g = matched.grade.toUpperCase().trim();
          if (g === 'S') gradeLabel = '卓越表现，强烈推荐';
          else if (g === 'A+' || g === 'A') gradeLabel = '表现优秀，推荐录用';
          else if (g === 'B+') gradeLabel = '表现良好，建议考虑';
          else if (g === 'B') gradeLabel = '基本合格，可以录用';
          else gradeLabel = '未达到推荐标准';
        }
      } else {
        grade = totalScore >= 60 ? 'qualified' : 'rejected';
        gradeLabel = totalScore >= 60 ? '基本合格' : '未达标';
      }
    } else {
      if (totalScore >= 80) { grade = 'excellent'; gradeLabel = '表现优秀，强烈推荐录用'; }
      else if (totalScore >= 70) { grade = 'good'; gradeLabel = '表现良好，建议进入下一轮'; }
      else if (totalScore >= 60) { grade = 'qualified'; gradeLabel = '基本合格，可考虑录用'; }
      else { grade = 'pending'; gradeLabel = '未达到录用标准'; }
    }

    // Build question_answers summary
    const questionAnswers = answers.map((a: Record<string, unknown>) => ({
      questionTitle: a.question_title,
      questionPrompt: a.question_prompt,
      audioDuration: a.audio_duration,
      transcript: a.transcript,
      score: a.score != null ? Number(a.score) : null,
      maxScore: a.max_score != null ? Number(a.max_score) : null,
      scoreReasoning: a.score_reasoning,
      status: a.status,
      errorMessage: a.error_message,
    }));

    const candidateId = session.candidate_id as string;
    const candidateName = (session.candidateName || session.candidate_name || '未知') as string;
    const candidateEmail = (session.candidateEmail || session.candidate_email || '') as string;
    const templateName = (session.templateName || session.template_name || 'AI面试') as string;
    const positionId = (session.position_id || null) as string | null;
    const positionName = (session.positionName || session.position_name || null) as string | null;

    // Compute total duration from answers
    const totalDuration = answers.reduce(
      (sum: number, a: Record<string, unknown>) => sum + (Number(a.audio_duration) || 0), 0,
    );
    const durationMinutes = Math.max(1, Math.round(totalDuration / 60));

    // Insert interview result + update session + create approval request in a single transaction
    const result = await transaction(async (client) => {
      // Insert interview result
      const row = await client.query(
        `INSERT INTO interview_results
           (session_id, candidate_id, candidate_name, candidate_email, position, template_name,
            interview_date, total_score, grade, grade_label, dimensions, duration, status, question_answers)
         VALUES ($1, $2, $3, $4, $5, $6, now(), $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          sessionId, candidateId, candidateName, candidateEmail,
          positionName, templateName, totalScore, grade, gradeLabel,
          JSON.stringify(dimensions), durationMinutes, 'completed',
          JSON.stringify(questionAnswers),
        ],
      );

      // Update session status to scored
      await client.query(`UPDATE interview_sessions SET status = 'scored', submitted_at = now() WHERE id = $1`, [sessionId]);

      // Auto-create approval request
      await client.query(
        `INSERT INTO approval_requests
           (type, candidate_id, candidate_name, candidate_email, position_id, position_name,
            interview_score, interview_grade, interview_grade_label, interview_date, interview_duration,
            dimension_scores, status)
         VALUES ('interview_result', $1, $2, $3, $4, $5, $6, $7, $8, now(), $9, $10, 'pending')`,
        [
          candidateId, candidateName, candidateEmail,
          positionId, positionName, totalScore, grade, gradeLabel,
          durationMinutes, JSON.stringify(dimensions),
        ],
      );

      return row.rows[0];
    });

    res.status(201).json(result);
  } catch (e) { next(e); }
});

export default router;
