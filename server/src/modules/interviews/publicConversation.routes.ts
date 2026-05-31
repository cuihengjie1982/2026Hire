/**
 * Public Conversation Interview — Express dev server routes.
 * Mirrors Edge Function endpoints at /public/conversation/*
 * Candidates access these without JWT login, using access_token for auth.
 */
import { Router } from 'express';
import { query, queryOne } from '../../config/database.js';

const router = Router();

// All routes are public (no JWT auth) — validated via access_token query param
// Note: In the Edge Function, these are auth: 'none' routes

function parseJsonField<T>(raw: unknown, fallback: T): T {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  }
  if (typeof raw === 'object' && raw !== null) return raw as T;
  return fallback;
}

// --- Helpers (mirror Edge Function public-conversation/index.ts) ---

function mapQuestion(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    prompt: String(row.prompt ?? ''),
    followUps: parseJsonField<string[]>(row.follow_ups ?? row.followUps, []),
    questionType: String(row.question_type ?? 'core'),
    triggerCondition: parseJsonField<Record<string, unknown>>(row.trigger_condition ?? row.triggerCondition, {}),
  };
}

async function validateAccessToken(accessToken: string) {
  const session = await queryOne(
    `SELECT id, status, access_token, candidate_id, template_id FROM interview_sessions WHERE access_token = $1`,
    [accessToken],
  );
  if (!session) return { valid: false as const, error: 'Invalid or expired interview link' };
  const status = String(session.status ?? '');
  if (status === 'closed' || status === 'scored') {
    return { valid: false as const, error: 'This interview has already been completed' };
  }
  return { valid: true as const, session };
}

// POST /public/conversation/sessions
router.post('/public/conversation/sessions', async (req, res) => {
  try {
    const { accessToken, action } = req.body;
    if (!accessToken) return res.status(400).json({ error: 'accessToken is required' });

    const validation = await validateAccessToken(String(accessToken));
    if (!validation.valid) return res.status(validation.error === 'Invalid or expired interview link' ? 404 : 410).json({ error: validation.error });

    const session = validation.session!;
    const sessionId = String(session.id);
    const templateId = String(session.template_id ?? '');
    const sessionCandidateId = String(session.candidate_id ?? '');

    // Fetch candidate name
    let candidateName = '';
    if (sessionCandidateId) {
      const c = await queryOne('SELECT name FROM candidates WHERE id = $1', [sessionCandidateId]);
      candidateName = String(c?.name ?? '');
    }

    // Resume existing session
    if (action === 'resume') {
      const existing = await queryOne(
        `SELECT * FROM conversational_interview_sessions WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [sessionId],
      );
      if (existing) {
        const messages = await query(
          `SELECT * FROM conversational_interview_messages WHERE conv_session_id = $1 ORDER BY created_at ASC LIMIT 100`,
          [existing.id],
        );
        return res.json({
          convSessionId: existing.id,
          status: existing.status,
          currentTopic: existing.current_topic,
          topicsCovered: existing.topics_covered || [],
          messages: (messages || []).map((m: Record<string, unknown>) => ({
            id: m.id, role: m.role, content: m.content,
            messageType: m.message_type, questionId: m.question_id,
            createdAt: m.created_at,
          })),
          config: {
            allowCandidateQuestions: false,
            maxDurationMinutes: 30,
            maxFollowUpsPerTopic: 2,
          },
          candidateName,
          interviewName: '',
          isResumed: true,
        });
      }
    }

    // Create new conversational session
    const template = await queryOne('SELECT name, conversational_config FROM interview_templates WHERE id = $1', [templateId]);
    const convConfig = parseJsonField<Record<string, unknown>>(template?.conversational_config, {});
    const interviewName = String(template?.name ?? '');

    const questions = await query(
      `SELECT * FROM interview_questions WHERE template_id = $1 ORDER BY sort_order ASC`,
      [templateId],
    );
    const mappedQuestions = (questions || []).map((q: Record<string, unknown>) => mapQuestion(q));

    // Get icebreaker
    const icebreakerQ = mappedQuestions.find(q => q.questionType === 'icebreaker');
    const icebreakerMessage = icebreakerQ?.prompt
      || String(convConfig.icebreakerMessage || '你好！欢迎参加今天的面试。我是 AI 面试官小e，很高兴认识你。请先简单介绍一下你自己。');

    const firstTopic = mappedQuestions.find(q => q.questionType === 'core');

    // Create conversational session
    const convSession = await queryOne(
      `INSERT INTO conversational_interview_sessions (session_id, status, current_topic, topics_covered, transcript_full, message_count, started_at)
       VALUES ($1, 'active', $2, '[]', $3, 1, NOW()) RETURNING *`,
      [sessionId, firstTopic?.title || null, `面试官：${icebreakerMessage}`],
    );
    if (!convSession) return res.status(500).json({ error: 'Failed to create conversation session' });

    // Insert icebreaker message
    await query(
      `INSERT INTO conversational_interview_messages (conv_session_id, role, content, message_type, question_id)
       VALUES ($1, 'interviewer', $2, 'icebreaker', $3)`,
      [convSession.id, icebreakerMessage, icebreakerQ?.id || null],
    );

    // Update interview session
    await query(`UPDATE interview_sessions SET status = 'in_progress', started_at = NOW() WHERE id = $1`, [sessionId]);

    res.json({
      convSessionId: convSession.id,
      status: 'active',
      currentTopic: firstTopic?.title || null,
      topicsCovered: [],
      messages: [{ id: null, role: 'interviewer', content: icebreakerMessage, messageType: 'icebreaker', questionId: icebreakerQ?.id || null }],
      config: {
        allowCandidateQuestions: Boolean(convConfig.allowCandidateQuestions ?? false),
        maxDurationMinutes: Number(convConfig.maxDurationMinutes ?? 30),
        maxFollowUpsPerTopic: Number(convConfig.maxFollowUpsPerTopic ?? 2),
      },
      candidateName,
      interviewName,
      isResumed: false,
    });
  } catch (e) {
    console.error('[public-conv-sessions]', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /public/conversation/messages
router.post('/public/conversation/messages', async (req, res) => {
  try {
    const { convSessionId, content } = req.body;
    if (!convSessionId || !content?.trim()) return res.status(400).json({ error: 'convSessionId and content required' });

    const convData = await queryOne('SELECT * FROM conversational_interview_sessions WHERE id = $1', [String(convSessionId)]);
    if (!convData) return res.status(404).json({ error: 'Conversation session not found' });
    if (convData.status !== 'active') return res.status(400).json({ error: 'Conversation is not active' });

    // Save candidate message
    await query(
      `INSERT INTO conversational_interview_messages (conv_session_id, role, content, message_type) VALUES ($1, 'candidate', $2, 'text')`,
      [String(convSessionId), String(content).trim()],
    );

    // Return placeholder AI response (dev server — real LLM call is in Edge Function)
    const aiResponse = '这是一个开发环境的模拟回复。在正式环境中，AI 会根据你的回答进行追问或过渡到下一个话题。';

    const aiMsg = await queryOne(
      `INSERT INTO conversational_interview_messages (conv_session_id, role, content, message_type) VALUES ($1, 'interviewer', $2, 'text') RETURNING *`,
      [String(convSessionId), aiResponse],
    );

    res.json({
      message: aiMsg ? {
        id: aiMsg.id, role: aiMsg.role, content: aiMsg.content,
        messageType: aiMsg.message_type, questionId: aiMsg.question_id,
        createdAt: aiMsg.created_at,
      } : null,
      conversationState: { currentTopic: convData.current_topic, shouldClose: false },
    });
  } catch (e) {
    console.error('[public-conv-messages]', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /public/conversation/messages/stream — SSE streaming endpoint
router.get('/public/conversation/messages/stream', async (req, res) => {
  try {
    const convSessionId = req.query.convSessionId as string;
    const content = req.query.content as string;

    if (!convSessionId || !content?.trim()) return res.status(400).json({ error: 'convSessionId and content required' });

    // Save candidate message
    await query(
      `INSERT INTO conversational_interview_messages (conv_session_id, role, content, message_type) VALUES ($1, 'candidate', $2, 'text')`,
      [convSessionId, content.trim()],
    );

    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const aiResponse = '这是一个开发环境的模拟流式回复。在正式环境中，AI 会根据你的回答进行追问或过渡到下一个话题。';

    // Simulate streaming: send one character at a time with 30ms delay
    let i = 0;
    const interval = setInterval(() => {
      if (i < aiResponse.length) {
        res.write(`data: ${JSON.stringify({ token: aiResponse[i] })}\n\n`);
        i++;
      } else {
        clearInterval(interval);
        const donePayload = {
          type: 'done',
          messageId: `msg-${Date.now()}`,
          conversationState: { currentTopic: null, shouldClose: false },
        };
        res.write(`data: ${JSON.stringify(donePayload)}\n\n`);
        res.end();
      }
    }, 30);

    req.on('close', () => {
      clearInterval(interval);
    });
  } catch (e) {
    console.error('[public-conv-stream]', e);
    if (!res.headersSent) res.status(500).json({ error: 'Internal error' });
  }
});

// POST /public/conversation/complete
router.post('/public/conversation/complete', async (req, res) => {
  try {
    const { convSessionId } = req.body;
    if (!convSessionId) return res.status(400).json({ error: 'convSessionId is required' });

    await query(
      `UPDATE conversational_interview_sessions SET status = 'completed', completed_at = NOW() WHERE id = $1`,
      [String(convSessionId)],
    );

    // Get session to find parent interview session
    const conv = await queryOne('SELECT session_id FROM conversational_interview_sessions WHERE id = $1', [String(convSessionId)]);
    if (conv) {
      await query(`UPDATE interview_sessions SET status = 'submitted', submitted_at = NOW() WHERE id = $1`, [String(conv.session_id)]);
    }

    res.json({ status: 'completed' });
  } catch (e) {
    console.error('[public-conv-complete]', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /public/conversation/score
router.post('/public/conversation/score', async (req, res) => {
  try {
    const { convSessionId } = req.body;
    if (!convSessionId) return res.status(400).json({ error: 'convSessionId is required' });

    // Dev server returns mock scoring data
    res.json({
      scoreId: `score-${Date.now()}`,
      overallScore: 85,
      grade: 'B',
      gradeLabel: '良好',
      dimensionScores: [
        { dimension: '专业技能', score: 85, maxScore: 100, reasoning: '开发环境模拟评分', evidence: [] },
        { dimension: '沟通表达', score: 82, maxScore: 100, reasoning: '开发环境模拟评分', evidence: [] },
        { dimension: '逻辑思维', score: 88, maxScore: 100, reasoning: '开发环境模拟评分', evidence: [] },
      ],
      strengths: [{ title: '综合能力', description: '开发环境模拟评估', evidence: [] }],
      weaknesses: [{ title: '待提升领域', description: '开发环境模拟评估', evidence: [] }],
      summary: '这是一个开发环境的模拟评分结果。在正式环境中，AI 会对完整对话进行多维度分析和评分。',
      status: 'completed',
    });
  } catch (e) {
    console.error('[public-conv-score]', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /public/conversation/candidate-question
router.post('/public/conversation/candidate-question', async (req, res) => {
  try {
    const { convSessionId, question } = req.body;
    if (!convSessionId || !question?.trim()) return res.status(400).json({ error: 'convSessionId and question required' });

    await query(
      `INSERT INTO candidate_questions_asked (conv_session_id, candidate_question, ai_response, response_timestamp, is_answered)
       VALUES ($1, $2, $3, NOW(), true)`,
      [String(convSessionId), String(question).trim(), '这是一个开发环境的模拟回复。在正式环境中，AI 会根据岗位信息回答你的问题。'],
    );

    res.json({
      question: String(question).trim(),
      aiResponse: '这是一个开发环境的模拟回复。在正式环境中，AI 会根据岗位信息回答你的问题。',
      isAnswered: true,
    });
  } catch (e) {
    console.error('[public-conv-candidate-question]', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
