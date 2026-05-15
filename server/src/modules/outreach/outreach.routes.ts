import {Router} from 'express';
import {query, queryOne} from '../../config/database.js';
import {validateUuidParams} from '../../middleware/validateParams.js';

const router = Router();

const VALID_STATUSES = new Set(['pending', 'contacted', 'responded', 'failed']);

// GET / — list all communication records
router.get('/', async (_req, res, next) => {
  try {
    const rows = await query(
      `SELECT * FROM outreach_records ORDER BY created_at DESC`,
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /by-candidate?candidateId=xxx
router.get('/by-candidate', async (req, res, next) => {
  try {
    const {candidateId} = req.query as {candidateId?: string};
    if (!candidateId) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'candidateId is required'}});
      return;
    }
    const rows = await query(
      `SELECT * FROM outreach_records WHERE candidate_id = $1 ORDER BY created_at DESC`,
      [candidateId],
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// POST / — create a communication record
router.post('/', async (req, res, next) => {
  try {
    const {candidateId, candidateName, positionId, positionName, channel, content} = req.body;

    if (!candidateId || !channel) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'candidateId and channel are required'}});
      return;
    }

    const row = await query(
      `INSERT INTO outreach_records
         (candidate_id, candidate_name, position_id, position_name, channel, content, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [candidateId, candidateName ?? null, positionId ?? null, positionName ?? null, channel, content ?? null],
    );
    res.status(201).json(row[0]);
  } catch (e) { next(e); }
});

// PATCH /:id/status — update record status
router.patch('/:id/status', validateUuidParams('id'), async (req, res, next) => {
  try {
    const {id} = req.params;
    const {status} = req.body;

    if (!status || !VALID_STATUSES.has(status)) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: `Invalid status. Must be one of: pending, contacted, responded, failed`}});
      return;
    }

    const row = await queryOne(
      `UPDATE outreach_records SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Record (${id}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// PATCH /:id — update record
router.patch('/:id', validateUuidParams('id'), async (req, res, next) => {
  try {
    const {id} = req.params;
    const {channel, content, status} = req.body;

    const sets: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (channel !== undefined) {
      sets.push(`channel = $${paramIndex++}`);
      values.push(channel);
    }
    if (content !== undefined) {
      sets.push(`content = $${paramIndex++}`);
      values.push(content);
    }
    if (status !== undefined) {
      if (!VALID_STATUSES.has(status)) {
        res.status(400).json({error: {code: 'VALIDATION_ERROR', message: `Invalid status. Must be one of: pending, contacted, responded, failed`}});
        return;
      }
      sets.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (sets.length === 0) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'At least one field to update is required'}});
      return;
    }

    const sql = `UPDATE outreach_records SET ${sets.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    values.push(id);

    const row = await queryOne(sql, values);
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Record (${id}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// DELETE /:id — delete record
router.delete('/:id', validateUuidParams('id'), async (req, res, next) => {
  try {
    const {id} = req.params;
    const row = await queryOne(`DELETE FROM outreach_records WHERE id = $1 RETURNING id`, [id]);
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Record (${id}) not found`}});
      return;
    }
    res.json({success: true, id: row.id});
  } catch (e) { next(e); }
});

export default router;
