/**
 * Conversational AI Interview — Express dev server routes.
 * Mirrors Edge Function endpoints for local development.
 * In production, these routes are handled by the Edge Function (embox-api).
 */
import { Router } from 'express';
import { query, queryOne } from '../../config/database.js';
import { authMiddleware } from '../../middleware/auth.js';

const router = Router();

// All conversational interview routes require recruiter+
router.use(authMiddleware);
router.use((req, res, next) => {
  if (!req.user || !['recruiter', 'admin', 'hiring_manager'].includes(req.user.role)) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: '需要招聘或管理员权限' } });
  }
  next();
});

// POST /conversational-interview/sessions — create/resume conversation
router.post('/conversational-interview/sessions', async (req, res) => {
  try {
    const { sessionId, action } = req.body;

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
          messages: (messages || []).map(m => ({
            id: m.id, role: m.role, content: m.content,
            messageType: m.message_type, questionId: m.question_id,
            createdAt: m.created_at,
          })),
          isResumed: true,
        });
      }
    }

    // Verify interview session
    const session = await queryOne('SELECT id, template_id FROM interview_sessions WHERE id = $1', [sessionId]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Get template config
    const template = await queryOne('SELECT name, conversational_config FROM interview_templates WHERE id = $1', [session.template_id]);
    const convConfig = (template?.conversational_config && typeof template.conversational_config === 'object')
      ? template.conversational_config as Record<string, unknown> : {};

    // Get icebreaker question
    const icebreaker = await queryOne(
      `SELECT * FROM interview_questions WHERE template_id = $1 AND question_type = 'icebreaker' LIMIT 1`,
      [session.template_id],
    );
    const icebreakerMessage = icebreaker?.prompt
      || (convConfig.icebreakerMessage as string)
      || '你好！欢迎参加今天的面试。请先简单介绍一下你自己。';

    // Get first core question
    const firstCore = await queryOne(
      `SELECT * FROM interview_questions WHERE template_id = $1 AND question_type = 'core' ORDER BY sort_order LIMIT 1`,
      [session.template_id],
    );

    // Create conversational session
    const convSession = await queryOne(
      `INSERT INTO conversational_interview_sessions (session_id, status, current_topic, topics_covered, transcript_full, message_count, started_at)
       VALUES ($1, 'active', $2, '[]', $3, 1, NOW()) RETURNING *`,
      [sessionId, firstCore?.title || null, `面试官：${icebreakerMessage}`],
    );
    if (!convSession) return res.status(500).json({ error: 'Failed to create conversation session' });

    // Insert icebreaker message
    await query(
      `INSERT INTO conversational_interview_messages (conv_session_id, role, content, message_type, question_id)
       VALUES ($1, 'interviewer', $2, 'icebreaker', $3)`,
      [convSession.id, icebreakerMessage, icebreaker?.id || null],
    );

    // Update interview session
    await query(`UPDATE interview_sessions SET status = 'in_progress', started_at = NOW() WHERE id = $1`, [sessionId]);

    res.json({
      convSessionId: convSession.id,
      status: 'active',
      currentTopic: firstCore?.title || null,
      topicsCovered: [],
      messages: [{ id: null, role: 'interviewer', content: icebreakerMessage, messageType: 'icebreaker', questionId: icebreaker?.id || null }],
      config: {
        allowCandidateQuestions: Boolean(convConfig.allowCandidateQuestions ?? false),
        maxDurationMinutes: Number(convConfig.maxDurationMinutes ?? 30),
        maxFollowUpsPerTopic: Number(convConfig.maxFollowUpsPerTopic ?? 2),
      },
      isResumed: false,
    });
  } catch (e) {
    console.error('[conv-sessions]', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /conversational-interview/messages — send message
router.post('/conversational-interview/messages', async (req, res) => {
  try {
    const { convSessionId, content } = req.body;

    // Save candidate message
    await query(
      `INSERT INTO conversational_interview_messages (conv_session_id, role, content, message_type)
       VALUES ($1, 'candidate', $2, 'text')`,
      [convSessionId, content],
    );

    // Placeholder AI response (in dev, LLM calls are handled by the Edge Function)
    const aiResponse = '感谢你的回答。这是一个开发环境的模拟回复。在正式环境中，AI 会根据你的回答进行追问或过渡到下一个话题。';

    const aiMsg = await queryOne(
      `INSERT INTO conversational_interview_messages (conv_session_id, role, content, message_type)
       VALUES ($1, 'interviewer', $2, 'text') RETURNING *`,
      [convSessionId, aiResponse],
    );
    if (!aiMsg) return res.status(500).json({ error: 'Failed to save message' });

    // Update transcript
    await query(
      `UPDATE conversational_interview_sessions SET transcript_full = COALESCE(transcript_full, '') || $1, message_count = message_count + 2, updated_at = NOW() WHERE id = $2`,
      [`\n候选人：${content}\n面试官：${aiResponse}`, convSessionId],
    );

    res.json({
      message: { id: aiMsg.id, role: 'interviewer', content: aiResponse, messageType: 'text', questionId: null, createdAt: aiMsg.created_at },
      conversationState: { currentTopic: null, topicsCovered: 0, shouldClose: false },
    });
  } catch (e) {
    console.error('[conv-messages]', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /conversational-interview/complete — end conversation
router.post('/conversational-interview/complete', async (req, res) => {
  try {
    const { convSessionId } = req.body;

    const { count } = await queryOne(
      `SELECT COUNT(*) as count FROM conversational_interview_messages WHERE conv_session_id = $1`,
      [convSessionId],
    ) as { count: string };

    await query(
      `UPDATE conversational_interview_sessions SET status = 'completed', completed_at = NOW(), message_count = $1, updated_at = NOW() WHERE id = $2`,
      [parseInt(count), convSessionId],
    );

    const conv = await queryOne('SELECT * FROM conversational_interview_sessions WHERE id = $1', [convSessionId]);
    if (!conv) return res.status(404).json({ error: 'Conversation session not found' });

    await query(`UPDATE interview_sessions SET status = 'submitted', submitted_at = NOW() WHERE id = $1`, [conv.session_id]);

    res.json({ status: 'completed', messageCount: parseInt(count), durationMinutes: 0 });
  } catch (e) {
    console.error('[conv-complete]', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /conversational-interview/score — score conversation
router.post('/conversational-interview/score', async (req, res) => {
  try {
    const { convSessionId } = req.body;

    // Placeholder scoring (in dev, LLM scoring is handled by Edge Function)
    const score = {
      conv_session_id: convSessionId,
      dimension_scores: JSON.stringify([]),
      overall_score: 75,
      strengths: JSON.stringify([]),
      weaknesses: JSON.stringify([]),
      summary: '开发环境模拟评分',
      status: 'completed',
    };

    const scoreRow = await queryOne(
      `INSERT INTO conversational_interview_scores (conv_session_id, dimension_scores, overall_score, strengths, weaknesses, summary, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [score.conv_session_id, score.dimension_scores, score.overall_score, score.strengths, score.weaknesses, score.summary, score.status],
    );
    if (!scoreRow) return res.status(500).json({ error: 'Failed to create score record' });

    const conv = await queryOne('SELECT * FROM conversational_interview_sessions WHERE id = $1', [convSessionId]);
    if (!conv) return res.status(404).json({ error: 'Conversation session not found' });

    // Create interview_result
    const resultRow = await queryOne(
      `INSERT INTO interview_results (session_id, total_score, grade, grade_label, status, interview_mode, conversation_transcript, conversation_message_count, interview_date, candidate_name, template_name)
       VALUES ($1, 75, 'qualified', '合格', 'completed', 'text_chat_conversational', $2, $3, NOW(), '', '')
       RETURNING *`,
      [conv.session_id, conv.transcript_full, conv.message_count],
    );
    if (!resultRow) return res.status(500).json({ error: 'Failed to create interview result' });

    await query(`UPDATE interview_sessions SET status = 'scored' WHERE id = $1`, [conv.session_id]);

    res.json({
      scoreId: scoreRow.id, resultId: resultRow.id,
      overallScore: 75, grade: 'qualified', gradeLabel: '合格',
      dimensionScores: [], strengths: [], weaknesses: [],
      summary: '开发环境模拟评分', status: 'completed',
    });
  } catch (e) {
    console.error('[conv-score]', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /conversational-interview/candidate-question — candidate asks
router.post('/conversational-interview/candidate-question', async (req, res) => {
  try {
    const { convSessionId, question } = req.body;

    const qRow = await queryOne(
      `INSERT INTO candidate_questions_asked (conv_session_id, candidate_question) VALUES ($1, $2) RETURNING *`,
      [convSessionId, question],
    );
    if (!qRow) return res.status(500).json({ error: 'Failed to save question' });

    const aiResponse = '这是一个开发环境的模拟回复。关于这个问题，建议联系 HR 获取详细信息。';

    await query(
      `UPDATE candidate_questions_asked SET ai_response = $1, response_timestamp = NOW(), is_answered = true WHERE id = $2`,
      [aiResponse, qRow.id],
    );

    const aiMsg = await queryOne(
      `INSERT INTO conversational_interview_messages (conv_session_id, role, content, message_type)
       VALUES ($1, 'interviewer', $2, 'candidate_question') RETURNING *`,
      [convSessionId, aiResponse],
    );
    if (!aiMsg) return res.status(500).json({ error: 'Failed to save AI response message' });

    res.json({ questionId: qRow.id, message: { id: aiMsg.id, role: 'interviewer', content: aiResponse, messageType: 'candidate_question', createdAt: aiMsg.created_at } });
  } catch (e) {
    console.error('[conv-candidate-q]', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
