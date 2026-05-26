import {Router} from 'express';
import {query, queryOne} from '../../config/database.js';

const router = Router();

// ---------------------------------------------------------------------------
// Result routes
// ---------------------------------------------------------------------------

// GET /results — list results (MUST be before /:id-style routes)
router.get('/results', async (req, res, next) => {
  try {
    const {page = '1', pageSize = '50'} = req.query as Record<string, string>;
    const limit = Math.min(parseInt(pageSize, 10) || 50, 200);
    const offset = (parseInt(page, 10) - 1) * limit;

    const [rows, countResult] = await Promise.all([
      query(
        `SELECT * FROM interview_results ORDER BY interview_date DESC LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      queryOne(`SELECT COUNT(*)::int AS total FROM interview_results`),
    ]);

    res.json({items: rows, total: countResult?.total ?? 0, page: parseInt(page, 10), pageSize: limit});
  } catch (e) { next(e); }
});

// GET /results/export/csv — export interview results as CSV
router.get('/results/export/csv', async (_req, res, next) => {
  try {
    const rows = await query(
      `SELECT candidate_name, candidate_email, position, template_name,
              interview_date, total_score, grade, grade_label, duration, status
       FROM interview_results ORDER BY interview_date DESC`,
    );

    const escCsv = (v: unknown): string => {
      const s = v == null ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const header = ['候选人', '邮箱', '岗位', '模板', '面试日期', '总分', '等级', '等级标签', '时长(分钟)', '状态'];
    const lines = rows.map((r: Record<string, unknown>) =>
      [r.candidate_name, r.candidate_email, r.position, r.template_name,
       r.interview_date ? new Date(r.interview_date as string).toLocaleDateString('zh-CN') : '',
       r.total_score, r.grade, r.grade_label, r.duration, r.status
      ].map(escCsv).join(','),
    );

    const csv = '\uFEFF' + [header.map(escCsv).join(','), ...lines].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=interview_results.csv');
    res.send(csv);
  } catch (e) { next(e); }
});

// POST /results — create result + auto-create approval request
router.post('/results', async (req, res, next) => {
  try {
    const {
      sessionId, candidateId, candidateName, candidateEmail,
      position, templateName, total_score, grade, grade_label,
      dimensions, duration, status,
    } = req.body;

    if (!candidateId || !total_score || !grade) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'candidateId, total_score, and grade are required'}});
      return;
    }

    const result = await queryOne(
      `INSERT INTO interview_results
         (session_id, candidate_id, candidate_name, candidate_email, position, template_name,
          interview_date, total_score, grade, grade_label, dimensions, duration, status)
       VALUES ($1, $2, $3, $4, $5, $6, now(), $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        sessionId ?? null, candidateId, candidateName ?? null, candidateEmail ?? null,
        position ?? null, templateName ?? null, total_score, grade, grade_label ?? null,
        dimensions ? JSON.stringify(dimensions) : '[]', duration ?? 0, status ?? 'completed',
      ],
    );

    // Auto-create approval request
    await query(
      `INSERT INTO approval_requests
         (type, candidate_id, candidate_name, candidate_email, position_id, position_name,
          interview_score, interview_grade, interview_grade_label, interview_date, interview_duration, dimension_scores, status)
       VALUES ('interview_result', $1, $2, $3, NULL, $4, $5, $6, $7, now(), $8, $9, 'pending')`,
      [
        candidateId, candidateName ?? null, candidateEmail ?? null,
        position ?? null, total_score, grade, grade_label ?? null,
        duration ?? 0, dimensions ? JSON.stringify(dimensions) : '[]',
      ],
    );

    res.status(201).json(result);
  } catch (e) { next(e); }
});

// PATCH /results/:resultId — update result status (review)
router.patch('/results/:resultId', async (req, res, next) => {
  try {
    const {resultId} = req.params;
    const {status} = req.body;
    if (!status || !['completed', 'reviewed'].includes(status)) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'status must be completed or reviewed'}});
      return;
    }
    const row = await queryOne(
      `UPDATE interview_results SET status = $1 WHERE id = $2 RETURNING *`,
      [status, resultId],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Result (${resultId}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Session routes
// ---------------------------------------------------------------------------

// GET /sessions/management — list sessions with candidate + template info
router.get('/sessions/management', async (req, res, next) => {
  try {
    const {page = '1', pageSize = '50'} = req.query as Record<string, string>;
    const limit = Math.min(parseInt(pageSize, 10) || 50, 200);
    const offset = (parseInt(page, 10) - 1) * limit;

    const [rows, countResult] = await Promise.all([
      query(
        `SELECT s.*,
                c.name AS "candidateName", c.email AS "candidateEmail",
                t.name AS "templateName"
         FROM interview_sessions s
         LEFT JOIN candidates c ON s.candidate_id = c.id
         LEFT JOIN interview_templates t ON s.template_id = t.id
         ORDER BY s.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      queryOne(`SELECT COUNT(*)::int AS total FROM interview_sessions`),
    ]);

    res.json({items: rows, total: countResult?.total ?? 0, page: parseInt(page, 10), pageSize: limit});
  } catch (e) { next(e); }
});

// GET /sessions/:sessionId — get single session
router.get('/sessions/:sessionId', async (req, res, next) => {
  try {
    const {sessionId} = req.params;
    const row = await queryOne(
      `SELECT s.*,
              c.name AS "candidateName", c.email AS "candidateEmail",
              t.name AS "templateName"
       FROM interview_sessions s
       LEFT JOIN candidates c ON s.candidate_id = c.id
       LEFT JOIN interview_templates t ON s.template_id = t.id
       WHERE s.id = $1`,
      [sessionId],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Interview session (${sessionId}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// POST /sessions — create session
router.post('/sessions', async (req, res, next) => {
  try {
    const {candidateId, templateId} = req.body;
    if (!candidateId || !templateId) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'candidateId and templateId are required'}});
      return;
    }
    const row = await queryOne(
      `INSERT INTO interview_sessions (candidate_id, template_id, status)
       VALUES ($1, $2, 'created')
       RETURNING *`,
      [candidateId, templateId],
    );
    // Auto-create outreach record for interview invite
    try {
      const candidate = await queryOne(
        `SELECT name FROM candidates WHERE id = $1`,
        [candidateId],
      );
      if (candidate) {
        await query(
          `INSERT INTO outreach_records (candidate_id, candidate_name, channel, status, content)
           VALUES ($1, $2, 'interview', 'contacted', '面试邀请已发送')`,
          [candidateId, candidate.name],
        );
      }
    } catch {
      // Don't fail session creation if outreach record fails
    }
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// PATCH /sessions/:sessionId — update session status
router.patch('/sessions/:sessionId', async (req, res, next) => {
  try {
    const {sessionId} = req.params;
    const {status} = req.body;
    const validStatuses = ['created', 'in_progress', 'submitted', 'scored', 'closed'];
    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: `status must be one of: ${validStatuses.join(', ')}`}});
      return;
    }
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    sets.push(`status = $${idx++}`);
    params.push(status);

    if (status === 'in_progress') {
      sets.push(`started_at = now()`);
    } else if (status === 'submitted' || status === 'closed') {
      sets.push(`submitted_at = now()`);
    }

    params.push(sessionId);
    const row = await queryOne(
      `UPDATE interview_sessions SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Session (${sessionId}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// DELETE /sessions/:sessionId — delete session
router.delete('/sessions/:sessionId', async (req, res, next) => {
  try {
    const {sessionId} = req.params;
    const row = await queryOne(
      `DELETE FROM interview_sessions WHERE id = $1 RETURNING id`,
      [sessionId],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Session (${sessionId}) not found`}});
      return;
    }
    res.json({deleted: true, id: row.id});
  } catch (e) { next(e); }
});

export default router;
