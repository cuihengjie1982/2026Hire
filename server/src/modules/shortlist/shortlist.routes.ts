import {Router} from 'express';
import {query, queryOne} from '../../config/database.js';

const router = Router();

// GET / — list shortlist entries, optional projectId/positionId filter
router.get('/', async (req, res, next) => {
  try {
    const {projectId, positionId} = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (projectId) {
      conditions.push(`se.project_id = $${params.length + 1}`);
      params.push(projectId);
    }
    if (positionId) {
      conditions.push(`se.position_id = $${params.length + 1}`);
      params.push(positionId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await query(
      `SELECT se.*
       FROM shortlist_entries se
       ${whereClause}
       ORDER BY se.created_at DESC`,
      params,
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// POST / — add to shortlist
router.post('/', async (req, res, next) => {
  try {
    const {
      candidateId, candidateName, role, positionId, positionName,
      projectId, projectName, fitScore, grade, nextStep,
    } = req.body;

    if (!candidateId || !candidateName) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'candidateId and candidateName are required'}});
      return;
    }

    const row = await queryOne(
      `INSERT INTO shortlist_entries
         (candidate_id, candidate_name, role, position_id, position_name, project_id, project_name, fit_score, grade, next_step)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        candidateId, candidateName, role ?? null,
        positionId ?? null, positionName ?? null,
        projectId ?? null, projectName ?? null,
        fitScore ?? 0, grade ?? null, nextStep ?? '待处理',
      ],
    );
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// POST /:id/promote — update next_step
router.post('/:id/promote', async (req, res, next) => {
  try {
    const {id} = req.params;
    const {nextStep} = req.body;
    if (!nextStep) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'nextStep is required'}});
      return;
    }
    const row = await queryOne(
      `UPDATE shortlist_entries SET next_step = $1 WHERE id = $2 RETURNING *`,
      [nextStep, id],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Shortlist entry (${id}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// POST /:id/interview-invite — create outreach record + update next_step
router.post('/:id/interview-invite', async (req, res, next) => {
  try {
    const {id} = req.params;
    const {type, subject, content, candidateEmail} = req.body;

    const entry = await queryOne(
      `SELECT * FROM shortlist_entries WHERE id = $1`,
      [id],
    );
    if (!entry) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Shortlist entry (${id}) not found`}});
      return;
    }

    // Create outreach record
    await query(
      `INSERT INTO outreach_records (candidate_id, candidate_name, candidate_email, position_id, position_name, type, subject, content, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'sent')`,
      [
        entry.candidate_id, entry.candidate_name, candidateEmail ?? null,
        entry.position_id, entry.position_name,
        type ?? 'interview_invite', subject ?? null, content ?? null,
      ],
    );

    // Update shortlist next_step
    const updated = await queryOne(
      `UPDATE shortlist_entries SET next_step = '已发面试邀请' WHERE id = $1 RETURNING *`,
      [id],
    );

    res.json(updated);
  } catch (e) { next(e); }
});

export default router;
