import {Router} from 'express';
import {query, queryOne} from '../../config/database.js';

const router = Router();

// GET / — list contacts with pagination
router.get('/', async (req, res, next) => {
  try {
    const {page = '1', pageSize = '50'} = req.query as Record<string, string>;
    const limit = Math.min(parseInt(pageSize, 10) || 50, 200);
    const offset = (parseInt(page, 10) - 1) * limit;

    const [rows, countResult] = await Promise.all([
      query(`SELECT * FROM contacts ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]),
      queryOne(`SELECT COUNT(*)::int AS total FROM contacts`),
    ]);

    res.json({items: rows, total: countResult?.total ?? 0, page: parseInt(page, 10), pageSize: limit});
  } catch (e) { next(e); }
});

// POST / — create contact
router.post('/', async (req, res, next) => {
  try {
    const {
      candidateId, candidateName, positionId, positionName,
      projectId, projectName, outreachPerson, channel, reason, status,
    } = req.body;

    if (!candidateName) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'candidateName is required'}});
      return;
    }

    const row = await queryOne(
      `INSERT INTO contacts
         (candidate_id, candidate_name, position_id, position_name, project_id, project_name,
          outreach_person, channel, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        candidateId ?? null, candidateName,
        positionId ?? null, positionName ?? null,
        projectId ?? null, projectName ?? null,
        outreachPerson ?? null, channel ?? null,
        reason ?? null, status ?? 'pending',
      ],
    );
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// PATCH /:id/status — update contact status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const {id} = req.params;
    const {status} = req.body;
    if (!status) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'status is required'}});
      return;
    }
    const row = await queryOne(
      `UPDATE contacts SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [status, id],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Contact (${id}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

export default router;
