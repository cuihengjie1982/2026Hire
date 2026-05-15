import {Router} from 'express';
import {query, queryOne} from '../../config/database.js';
import {validateUuidParams} from '../../middleware/validateParams.js';

const router = Router();

// ---------------------------------------------------------------------------
// Template routes (mounted at /api/interview-templates)
// ---------------------------------------------------------------------------

// GET / — list templates with position name
router.get('/', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT t.*, p.name AS "positionName"
       FROM interview_templates t
       LEFT JOIN positions p ON t.position_id = p.id
       ORDER BY t.created_at DESC`,
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /results — list results (MUST be before /:id)
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

// GET /:id — template + questions
router.get('/:id', validateUuidParams('id'), async (req, res, next) => {
  try {
    const {id} = req.params;
    const tmpl = await queryOne(
      `SELECT t.*, p.name AS "positionName"
       FROM interview_templates t
       LEFT JOIN positions p ON t.position_id = p.id
       WHERE t.id = $1`,
      [id],
    );
    if (!tmpl) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Interview template (${id}) not found`}});
      return;
    }
    const questions = await query(
      `SELECT * FROM interview_questions WHERE template_id = $1 ORDER BY sort_order`,
      [id],
    );
    res.json({...tmpl, questions});
  } catch (e) { next(e); }
});

// POST / — create template
router.post('/', async (req, res, next) => {
  try {
    const {positionId, name, version, status, duration_minutes, question_count, createdBy, scoring_config, grade_rules} = req.body;
    if (!name) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Template name is required'}});
      return;
    }
    const row = await queryOne(
      `INSERT INTO interview_templates (position_id, name, version, status, duration_minutes, question_count, created_by, scoring_config, grade_rules)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [positionId ?? null, name, version ?? 1, status ?? 'draft', duration_minutes ?? 0, question_count ?? 0, createdBy ?? null,
       JSON.stringify(scoring_config ?? {}), JSON.stringify(grade_rules ?? [])],
    );
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// PATCH /:id — update template
router.patch('/:id', validateUuidParams('id'), async (req, res, next) => {
  try {
    const {id} = req.params;
    const allowed = ['name', 'version', 'status', 'duration_minutes', 'question_count', 'positionId', 'scoring_config', 'grade_rules'];
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        const col = key === 'positionId' ? 'position_id' : key;
        sets.push(`${col} = $${idx++}`);
        const val = req.body[key];
        // JSONB fields need stringification
        if (['scoring_config', 'grade_rules'].includes(key)) {
          params.push(JSON.stringify(val));
        } else {
          params.push(val);
        }
      }
    }

    if (sets.length === 0) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'No fields to update'}});
      return;
    }

    params.push(id);
    const row = await queryOne(
      `UPDATE interview_templates SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Interview template (${id}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// DELETE /:id — delete template + cascade questions
router.delete('/:id', validateUuidParams('id'), async (req, res, next) => {
  try {
    const {id} = req.params;
    const row = await queryOne(
      `DELETE FROM interview_templates WHERE id = $1 RETURNING id`,
      [id],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Interview template (${id}) not found`}});
      return;
    }
    res.json({deleted: true, id: row.id});
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Question routes
// ---------------------------------------------------------------------------

// PUT /:templateId/questions — batch replace questions
router.put('/:templateId/questions', async (req, res, next) => {
  try {
    const {templateId} = req.params;
    const {questions} = req.body;
    if (!Array.isArray(questions)) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'questions must be an array'}});
      return;
    }

    await query(`DELETE FROM interview_questions WHERE template_id = $1`, [templateId]);

    if (questions.length > 0) {
      // 8 params per question: template_id + sort_order, title, prompt, time_limit_seconds, group_name, follow_ups, scoring_guide, linked_dimensions
      const values = questions
        .map((_q: Record<string, unknown>, i: number) => `($1, $${i * 8 + 2}, $${i * 8 + 3}, $${i * 8 + 4}, $${i * 8 + 5}, $${i * 8 + 6}, $${i * 8 + 7}, $${i * 8 + 8}, $${i * 8 + 9})`)
        .join(', ');
      const params: unknown[] = [templateId];
      for (const q of questions) {
        params.push(
          q.sort_order ?? questions.indexOf(q),
          q.title,
          q.prompt,
          q.time_limit_seconds ?? 120,
          q.group_name ?? '',
          JSON.stringify(q.follow_ups ?? []),
          JSON.stringify(q.scoring_guide ?? {}),
          JSON.stringify(q.linked_dimensions ?? []),
        );
      }
      await query(
        `INSERT INTO interview_questions (template_id, sort_order, title, prompt, time_limit_seconds, group_name, follow_ups, scoring_guide, linked_dimensions) VALUES ${values}`,
        params,
      );
    }

    const updated = await query(
      `SELECT * FROM interview_questions WHERE template_id = $1 ORDER BY sort_order`,
      [templateId],
    );
    res.json(updated);
  } catch (e) { next(e); }
});

// POST /:templateId/questions — add single question
router.post('/:templateId/questions', async (req, res, next) => {
  try {
    const {templateId} = req.params;
    const {sort_order, title, prompt, time_limit_seconds, group_name, follow_ups, scoring_guide, linked_dimensions} = req.body;
    if (!title || !prompt) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'title and prompt are required'}});
      return;
    }
    const row = await queryOne(
      `INSERT INTO interview_questions (template_id, sort_order, title, prompt, time_limit_seconds, group_name, follow_ups, scoring_guide, linked_dimensions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [templateId, sort_order ?? 0, title, prompt, time_limit_seconds ?? 120,
       group_name ?? '', JSON.stringify(follow_ups ?? []), JSON.stringify(scoring_guide ?? {}), JSON.stringify(linked_dimensions ?? [])],
    );
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// PATCH /:templateId/questions/:questionId — update question
router.patch('/:templateId/questions/:questionId', async (req, res, next) => {
  try {
    const {questionId} = req.params;
    const allowed = ['sort_order', 'title', 'prompt', 'time_limit_seconds', 'group_name', 'follow_ups', 'scoring_guide', 'linked_dimensions'];
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = $${idx++}`);
        const val = req.body[key];
        // JSONB fields need to be stringified
        if (['follow_ups', 'scoring_guide', 'linked_dimensions'].includes(key)) {
          params.push(JSON.stringify(val));
        } else {
          params.push(val);
        }
      }
    }

    if (sets.length === 0) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'No fields to update'}});
      return;
    }

    params.push(questionId);
    const row = await queryOne(
      `UPDATE interview_questions SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Question (${questionId}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// DELETE /:templateId/questions/:questionId — delete question
router.delete('/:templateId/questions/:questionId', async (req, res, next) => {
  try {
    const {questionId} = req.params;
    const row = await queryOne(
      `DELETE FROM interview_questions WHERE id = $1 RETURNING id`,
      [questionId],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Question (${questionId}) not found`}});
      return;
    }
    res.json({deleted: true, id: row.id});
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Session routes
// ---------------------------------------------------------------------------

// GET /sessions/management — list sessions with candidate + template info (MUST be before /:sessionId)
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
// Analytics routes (mounted at /api/interview-analytics)
// ---------------------------------------------------------------------------

const PASS_GRADES = `'A','B','S','A+','B+','a','b','s','excellent','good','qualified'`;

/** Build SQL WHERE clause for time range filtering on interview_date */
function getTimeRangeCondition(timeRange: string): string {
  switch (timeRange) {
    case 'thisWeek': return `interview_date >= date_trunc('week', now())`;
    case 'thisMonth': return `interview_date >= date_trunc('month', now())`;
    case 'thisQuarter': return `interview_date >= date_trunc('quarter', now())`;
    case 'thisYear': return `interview_date >= date_trunc('year', now())`;
    default: return 'TRUE'; // 'all' or unspecified
  }
}

/** Build the previous-period WHERE clause for period-over-period comparison */
function getPrevPeriodCondition(timeRange: string): string {
  switch (timeRange) {
    case 'thisWeek': return `interview_date >= date_trunc('week', now()) - INTERVAL '1 week' AND interview_date < date_trunc('week', now())`;
    case 'thisMonth': return `interview_date >= date_trunc('month', now()) - INTERVAL '1 month' AND interview_date < date_trunc('month', now())`;
    case 'thisQuarter': return `interview_date >= date_trunc('quarter', now()) - INTERVAL '3 months' AND interview_date < date_trunc('quarter', now())`;
    case 'thisYear': return `interview_date >= date_trunc('year', now()) - INTERVAL '1 year' AND interview_date < date_trunc('year', now())`;
    default: return `interview_date >= date_trunc('month', now()) - INTERVAL '1 month' AND interview_date < date_trunc('month', now())`;
  }
}

// GET /analytics/summary
router.get('/analytics/summary', async (req, res, next) => {
  try {
    const {timeRange = 'all'} = req.query as Record<string, string>;
    const trCond = getTimeRangeCondition(timeRange);
    const prevCond = getPrevPeriodCondition(timeRange);

    const [totalResult, completedResult, passResult, avgResult, weekResult, monthResult, prevTotal, prevCompleted, prevAvg] = await Promise.all([
      queryOne(`SELECT COUNT(*)::int AS "totalInterviews" FROM interview_results WHERE ${trCond}`),
      queryOne(`SELECT COUNT(*)::int AS "completedInterviews" FROM interview_results WHERE status = 'completed' AND ${trCond}`),
      queryOne(
        `SELECT
           CASE WHEN COUNT(*) = 0 THEN 0
                ELSE ROUND((COUNT(*) FILTER (WHERE grade IN (${PASS_GRADES}))::numeric / COUNT(*)::numeric) * 100, 2)
           END AS "passRate"
         FROM interview_results WHERE ${trCond}`,
      ),
      queryOne(`SELECT COALESCE(AVG(total_score), 0)::numeric(5,2) AS "averageScore" FROM interview_results WHERE ${trCond}`),
      queryOne(
        `SELECT COUNT(*)::int AS "thisWeekCount"
         FROM interview_results
         WHERE interview_date >= date_trunc('week', now())`,
      ),
      queryOne(
        `SELECT COUNT(*)::int AS "thisMonthCount"
         FROM interview_results
         WHERE interview_date >= date_trunc('month', now())`,
      ),
      queryOne(
        `SELECT COUNT(*)::int AS "prevTotal"
         FROM interview_results
         WHERE ${prevCond}`,
      ),
      queryOne(
        `SELECT COUNT(*)::int AS "prevCompleted"
         FROM interview_results
         WHERE status = 'completed' AND ${prevCond}`,
      ),
      queryOne(
        `SELECT COALESCE(AVG(total_score), 0)::numeric(5,2) AS "prevAvg"
         FROM interview_results
         WHERE ${prevCond}`,
      ),
    ]);

    const pTotal = prevTotal?.prevTotal ?? 0;
    const pCompleted = prevCompleted?.prevCompleted ?? 0;
    const pAvgScore = parseFloat(String(prevAvg?.prevAvg ?? 0));

    const computePctChange = (curr: number, prev: number): number => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100);
    };

    res.json({
      totalInterviews: totalResult?.totalInterviews ?? 0,
      completedInterviews: completedResult?.completedInterviews ?? 0,
      passRate: passResult?.passRate ?? 0,
      averageScore: parseFloat(String(avgResult?.averageScore ?? 0)),
      thisWeekCount: weekResult?.thisWeekCount ?? 0,
      thisMonthCount: monthResult?.thisMonthCount ?? 0,
      momTrend: {
        totalChange: computePctChange(totalResult?.totalInterviews ?? 0, pTotal),
        completedChange: computePctChange(completedResult?.completedInterviews ?? 0, pCompleted),
        avgScoreChange: computePctChange(parseFloat(String(avgResult?.averageScore ?? 0)), pAvgScore),
      },
    });
  } catch (e) { next(e); }
});

// GET /analytics/score-distribution
router.get('/analytics/score-distribution', async (req, res, next) => {
  try {
    const {timeRange = 'all'} = req.query as Record<string, string>;
    const trCond = getTimeRangeCondition(timeRange);
    const rows = await query(
      `SELECT
         CASE
           WHEN total_score >= 90 THEN '90-100'
           WHEN total_score >= 80 THEN '80-89'
           WHEN total_score >= 70 THEN '70-79'
           WHEN total_score >= 60 THEN '60-69'
           ELSE '0-59'
         END AS range,
         COUNT(*)::int AS count
       FROM interview_results
       WHERE ${trCond}
       GROUP BY range
       ORDER BY range DESC`,
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /analytics/pass-rate-trend — monthly pass rates
router.get('/analytics/pass-rate-trend', async (req, res, next) => {
  try {
    const {timeRange = 'all'} = req.query as Record<string, string>;
    // For trend data, always show monthly granularity but limit range
    const trCond = getTimeRangeCondition(timeRange);
    const rows = await query(
      `SELECT
         to_char(interview_date, 'YYYY-MM') AS month,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE grade IN (${PASS_GRADES}))::int AS passed,
         CASE WHEN COUNT(*) = 0 THEN 0
              ELSE ROUND((COUNT(*) FILTER (WHERE grade IN (${PASS_GRADES}))::numeric / COUNT(*)::numeric) * 100, 2)
         END AS "passRate"
       FROM interview_results
       WHERE ${trCond}
       GROUP BY month
       ORDER BY month`,
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /analytics/position-analytics — per-position stats
router.get('/analytics/position-analytics', async (req, res, next) => {
  try {
    const {timeRange = 'all'} = req.query as Record<string, string>;
    const trCond = getTimeRangeCondition(timeRange);
    const rows = await query(
      `SELECT
         position,
         COUNT(*)::int AS "totalInterviews",
         COUNT(*) FILTER (WHERE grade IN (${PASS_GRADES}))::int AS passed,
         CASE WHEN COUNT(*) = 0 THEN 0
              ELSE ROUND((COUNT(*) FILTER (WHERE grade IN (${PASS_GRADES}))::numeric / COUNT(*)::numeric) * 100, 2)
         END AS "passRate",
         COALESCE(AVG(total_score), 0)::numeric(5,2) AS "avgScore"
       FROM interview_results
       WHERE position IS NOT NULL AND ${trCond}
       GROUP BY position
       ORDER BY "totalInterviews" DESC`,
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /analytics/dimension-analysis — dimension & question difficulty analysis
router.get('/analytics/dimension-analysis', async (req, res, next) => {
  try {
    const {timeRange = 'all'} = req.query as Record<string, string>;
    const trCond = getTimeRangeCondition(timeRange);

    // Dimension analysis from interview_results.dimensions JSONB
    const dimensionRows = await query(
      `SELECT
         d->>'name' AS name,
         COUNT(*)::int AS count,
         ROUND(AVG((d->>'score')::numeric), 2) AS "avgScore",
         COALESCE(MAX((d->>'weight')::numeric), 100) AS "maxScore"
       FROM interview_results, jsonb_array_elements(dimensions) AS d
       WHERE ${trCond} AND jsonb_array_length(dimensions) > 0
       GROUP BY d->>'name'
       ORDER BY "avgScore" ASC`,
    );

    const dimensions = dimensionRows.map((r: Record<string, unknown>) => {
      const avg = parseFloat(String(r.avgScore ?? 0));
      const max = parseFloat(String(r.maxScore ?? 100));
      return {
        name: String(r.name ?? ''),
        avgScore: avg,
        maxScore: max,
        avgPercent: max > 0 ? Math.round((avg / max) * 1000) / 10 : 0,
        count: r.count as number,
      };
    });

    const weakestDimension = dimensions.length > 0 ? dimensions[0].name : '';

    // Question difficulty analysis from interview_answer_scores
    const questionRows = await query(
      `SELECT
         question_title,
         COUNT(*)::int AS "totalCount",
         ROUND(AVG(score), 2) AS "avgScore",
         MAX(max_score) AS "maxScore",
         COUNT(*) FILTER (WHERE score < max_score * 0.6)::int AS "belowThresholdCount"
       FROM interview_answer_scores
       WHERE status = 'completed' AND question_title IS NOT NULL
         AND session_id IN (SELECT session_id FROM interview_results WHERE ${trCond})
       GROUP BY question_title
       ORDER BY "belowThresholdCount" DESC NULLS LAST, "avgScore" ASC
       LIMIT 20`,
    );

    const questions = questionRows.map((r: Record<string, unknown>) => {
      const avg = parseFloat(String(r.avgScore ?? 0));
      const max = parseFloat(String(r.maxScore ?? 100));
      return {
        questionTitle: String(r.question_title ?? ''),
        avgScore: avg,
        maxScore: max,
        belowThresholdCount: r.belowThresholdCount as number,
        totalCount: r.totalCount as number,
      };
    });

    const hardestQuestion = questions.length > 0 ? questions[0].questionTitle : '';

    res.json({dimensions, questions, weakestDimension, hardestQuestion});
  } catch (e) { next(e); }
});

export default router;
