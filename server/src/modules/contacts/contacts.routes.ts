import {Router} from 'express';
import {query, queryOne} from '../../config/database.js';

const router = Router();

// GET / — list contacts with pagination and optional filters
router.get('/', async (req, res, next) => {
  try {
    const {page = '1', pageSize = '50', project_id, candidate_id} = req.query as Record<string, string>;
    const limit = Math.min(parseInt(pageSize, 10) || 50, 200);
    const offset = (parseInt(page, 10) - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (project_id) {
      conditions.push(`project_id = $${params.length + 1}`);
      params.push(project_id);
    }
    if (candidate_id) {
      conditions.push(`candidate_id = $${params.length + 1}`);
      params.push(candidate_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows, countResult] = await Promise.all([
      query(
        `SELECT * FROM contacts ${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      queryOne(`SELECT COUNT(*)::int AS total FROM contacts ${whereClause}`, params),
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

    if (candidateId && positionId) {
      const existing = await queryOne(
        `SELECT id FROM contacts WHERE candidate_id = $1 AND position_id = $2 LIMIT 1`,
        [candidateId, positionId],
      );
      if (existing) {
        res.status(409).json({error: {code: 'DUPLICATE', message: '该候选人已在此岗位的联系人列表中'}});
        return;
      }
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

// PATCH / — update contact fields (flat body: {id, status?, outreachPerson?, channel?, reason?})
router.patch('/', async (req, res, next) => {
  try {
    const {id, status, outreachPerson, channel, reason} = req.body;
    // #region agent log
    fetch('http://127.0.0.1:7854/ingest/be9f27ce-5c59-41c9-a632-43d870814038',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a35f32'},body:JSON.stringify({sessionId:'a35f32',location:'contacts.routes.ts:PATCH',message:'Express PATCH contacts',data:{body:req.body},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    if (!id) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Contact id is required'}});
      return;
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (status !== undefined && status !== null) {
      const statusStr = String(status);
      const allowed = ['pending', 'contacted', 'responded', 'interview_scheduled', 'hired', 'rejected'];
      if (!allowed.includes(statusStr)) {
        res.status(400).json({error: {code: 'VALIDATION_ERROR', message: `Invalid status: ${statusStr}`}});
        return;
      }
      updates.push(`status = $${paramIndex++}`);
      params.push(statusStr);
    }
    if (outreachPerson !== undefined) {
      updates.push(`outreach_person = $${paramIndex++}`);
      params.push(outreachPerson);
    }
    if (channel !== undefined) {
      const allowedChannels = ['wechat', 'email', 'phone'];
      if (!allowedChannels.includes(String(channel))) {
        res.status(400).json({error: {code: 'VALIDATION_ERROR', message: `Invalid channel: ${channel}`}});
        return;
      }
      updates.push(`channel = $${paramIndex++}`);
      params.push(channel);
    }
    if (reason !== undefined) {
      updates.push(`reason = $${paramIndex++}`);
      params.push(reason);
    }

    if (updates.length === 0) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'No fields to update'}});
      return;
    }

    updates.push('updated_at = now()');
    params.push(id);

    const row = await queryOne(
      `UPDATE contacts SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params,
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Contact (${id}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// PATCH /:id/status — update contact status (path param)
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

// DELETE / — delete contact (flat body: {id})
router.delete('/', async (req, res, next) => {
  try {
    const {id} = req.body;
    if (!id) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Contact id is required'}});
      return;
    }
    const row = await queryOne(`DELETE FROM contacts WHERE id = $1 RETURNING id`, [id]);
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Contact (${id}) not found`}});
      return;
    }
    res.json({success: true, id: row.id});
  } catch (e) { next(e); }
});

// DELETE /:id — delete contact (path param)
router.delete('/:id', async (req, res, next) => {
  try {
    const {id} = req.params;
    const row = await queryOne(`DELETE FROM contacts WHERE id = $1 RETURNING id`, [id]);
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Contact (${id}) not found`}});
      return;
    }
    res.json({success: true, id: row.id});
  } catch (e) { next(e); }
});

export default router;
