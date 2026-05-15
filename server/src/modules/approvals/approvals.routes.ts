import {Router} from 'express';
import {query, queryOne} from '../../config/database.js';
import {validateUuidParams} from '../../middleware/validateParams.js';

const router = Router();

// GET / — list pending approval requests
// Mounted at /api/interview-approvals and /api/approval-requests
router.get('/', async (req, res, next) => {
  try {
    const {page = '1', pageSize = '50'} = req.query as Record<string, string>;
    const limit = Math.min(parseInt(pageSize, 10) || 50, 200);
    const offset = (parseInt(page, 10) - 1) * limit;

    const [rows, countResult] = await Promise.all([
      query(
        `SELECT * FROM approval_requests WHERE status = 'pending' ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      queryOne(`SELECT COUNT(*)::int AS total FROM approval_requests WHERE status = 'pending'`),
    ]);

    res.json({items: rows, total: countResult?.total ?? 0, page: parseInt(page, 10), pageSize: limit});
  } catch (e) { next(e); }
});

// POST / — create approval request
router.post('/', async (req, res, next) => {
  try {
    const {
      type, candidateId, candidateName, candidateEmail,
      positionId, positionName, interviewScore, interviewGrade,
      interviewGradeLabel, interviewDate, interviewDuration,
      dimensionScores, reason, requesterName,
    } = req.body;

    const row = await queryOne(
      `INSERT INTO approval_requests
         (type, candidate_id, candidate_name, candidate_email, position_id, position_name,
          interview_score, interview_grade, interview_grade_label, interview_date,
          interview_duration, dimension_scores, reason, requester_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        type ?? 'interview_result',
        candidateId ?? null, candidateName ?? null, candidateEmail ?? null,
        positionId ?? null, positionName ?? null,
        interviewScore ?? null, interviewGrade ?? null, interviewGradeLabel ?? null,
        interviewDate ?? null, interviewDuration ?? null,
        dimensionScores ? JSON.stringify(dimensionScores) : '[]',
        reason ?? null, requesterName ?? null,
      ],
    );
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// POST /:id/decide — approve or reject
router.post('/:id/decide', validateUuidParams('id'), async (req, res, next) => {
  try {
    const {id} = req.params;
    const {status, comment, approverName} = req.body;
    if (!status || !['approved', 'rejected'].includes(status)) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'status must be "approved" or "rejected"'}});
      return;
    }
    const row = await queryOne(
      `UPDATE approval_requests
       SET status = $1, decided_at = now(), decided_comment = $2, approver_name = $3
       WHERE id = $4 AND status = 'pending'
       RETURNING *`,
      [status, comment ?? null, approverName ?? null, id],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Approval request (${id}) not found or not pending`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// GET /history — list non-pending approvals
// Mounted at /api/interview-approval-history
router.get('/history', async (req, res, next) => {
  try {
    const {page = '1', pageSize = '50'} = req.query as Record<string, string>;
    const limit = Math.min(parseInt(pageSize, 10) || 50, 200);
    const offset = (parseInt(page, 10) - 1) * limit;

    const [rows, countResult] = await Promise.all([
      query(
        `SELECT * FROM approval_requests WHERE status != 'pending' ORDER BY decided_at DESC NULLS LAST LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      queryOne(`SELECT COUNT(*)::int AS total FROM approval_requests WHERE status != 'pending'`),
    ]);

    res.json({items: rows, total: countResult?.total ?? 0, page: parseInt(page, 10), pageSize: limit});
  } catch (e) { next(e); }
});

export default router;
