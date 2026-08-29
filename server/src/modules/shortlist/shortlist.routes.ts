import {Router} from 'express';
import {query, queryOne, transaction} from '../../config/database.js';

const ALLOWED_CONTACT_CHANNELS = new Set(['wechat', 'email', 'phone']);

const isOutreachPromote = (body: Record<string, unknown>): boolean => {
  const {outreachPerson, channel, reason} = body;
  return (
    typeof outreachPerson === 'string' &&
    outreachPerson.trim().length > 0 &&
    typeof channel === 'string' &&
    ALLOWED_CONTACT_CHANNELS.has(channel) &&
    typeof reason === 'string' &&
    reason.trim().length > 0
  );
};

const router = Router();

// GET / — list shortlist entries, optional projectId/positionId filter
router.get('/', async (req, res, next) => {
  try {
    const {projectId, positionId, page = '1', pageSize = '50'} = req.query as Record<string, string>;
    const limit = Math.min(parseInt(pageSize, 10) || 50, 200);
    const offset = (parseInt(page, 10) - 1) * limit;
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

    const [rows, countResult] = await Promise.all([
      query(
        `SELECT se.*
         FROM shortlist_entries se
         ${whereClause}
         ORDER BY se.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      queryOne(`SELECT COUNT(*)::int AS total FROM shortlist_entries se ${whereClause}`, params),
    ]);

    res.json({items: rows, total: countResult?.total ?? 0, page: parseInt(page, 10), pageSize: limit});
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
         (candidate_id, candidate_name, role, position_id, position_name, project_id, project_name, fit_score, grade, next_step, status_log)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (candidate_id, position_id) DO NOTHING
       RETURNING *`,
      [
        candidateId, candidateName, role ?? null,
        positionId ?? null, positionName ?? null,
        projectId ?? null, projectName ?? null,
        fitScore ?? 0, grade ?? null, nextStep ?? '待处理',
        JSON.stringify([{status: nextStep ?? '待处理', at: new Date().toISOString()}]),
      ],
    );
    if (!row) {
      res.status(409).json({error: {code: 'DUPLICATE', message: '该候选人已在此岗位的入围名单中'}});
      return;
    }
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// POST /batch — batch add candidates to shortlist
router.post('/batch', async (req, res, next) => {
  try {
    const {entries} = req.body;
    if (!Array.isArray(entries) || entries.length === 0) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'entries must be a non-empty array'}});
      return;
    }

    const added: Record<string, unknown>[] = [];
    const skipped: {candidateId: string; reason: string}[] = [];

    for (const entry of entries) {
      const {candidateId, candidateName, role, positionId, positionName, projectId, projectName, fitScore, grade, nextStep} = entry;
      if (!candidateId || !candidateName) {
        skipped.push({candidateId: candidateId ?? '', reason: 'candidateId and candidateName are required'});
        continue;
      }
      try {
        const row = await queryOne(
          `INSERT INTO shortlist_entries
             (candidate_id, candidate_name, role, position_id, position_name, project_id, project_name, fit_score, grade, next_step, status_log)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (candidate_id, position_id) DO NOTHING
           RETURNING *`,
          [
            candidateId, candidateName, role ?? null,
            positionId ?? null, positionName ?? null,
            projectId ?? null, projectName ?? null,
            fitScore ?? 0, grade ?? null, nextStep ?? '待处理',
            JSON.stringify([{status: nextStep ?? '待处理', at: new Date().toISOString()}]),
          ],
        );
        if (row) {
          added.push(row);
        } else {
          skipped.push({candidateId, reason: '已在此岗位的入围名单中'});
        }
      } catch (err) {
        const code = (err as Record<string, string>)?.code;
        if (code === '23505') {
          skipped.push({candidateId, reason: '已在此岗位的入围名单中'});
        } else {
          skipped.push({candidateId, reason: (err as Error).message});
        }
      }
    }

    res.status(201).json({added: added.length, skipped, entries: added});
  } catch (e) { next(e); }
});

// DELETE /batch — batch remove entries by ID
router.delete('/batch', async (req, res, next) => {
  try {
    const {ids} = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'ids must be a non-empty array'}});
      return;
    }

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const result = await query(
      `DELETE FROM shortlist_entries WHERE id IN (${placeholders}) RETURNING id`,
      ids,
    );

    res.json({removed: result.length, ids: result.map((r: Record<string, unknown>) => r.id)});
  } catch (e) { next(e); }
});

// PATCH /batch/status — batch update next_step with history tracking
router.patch('/batch/status', async (req, res, next) => {
  try {
    const {ids, nextStep} = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'ids must be a non-empty array'}});
      return;
    }
    if (!nextStep) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'nextStep is required'}});
      return;
    }

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const logEntry = JSON.stringify({status: nextStep, at: new Date().toISOString()});

    const rows = await query(
      `UPDATE shortlist_entries
       SET next_step = $${ids.length + 1},
           status_log = COALESCE(status_log, '[]'::jsonb) || $${ids.length + 2}::jsonb
       WHERE id IN (${placeholders})
       RETURNING *`,
      [...ids, nextStep, logEntry],
    );

    res.json({updated: rows.length, entries: rows});
  } catch (e) { next(e); }
});

// GET /:id/history — get status change history for an entry
router.get('/:id/history', async (req, res, next) => {
  try {
    const {id} = req.params;
    const row = await queryOne(
      `SELECT id, candidate_name, next_step, status_log FROM shortlist_entries WHERE id = $1`,
      [id],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Shortlist entry (${id}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// POST /:id/promote — update next_step; optional atomic outreach → contact
router.post('/:id/promote', async (req, res, next) => {
  try {
    const {id} = req.params;
    const {nextStep, outreachPerson, channel, reason} = req.body as Record<string, unknown>;
    if (!nextStep) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'nextStep is required'}});
      return;
    }

    const entry = await queryOne(
      `SELECT * FROM shortlist_entries WHERE id = $1`,
      [id],
    );
    if (!entry) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Shortlist entry (${id}) not found`}});
      return;
    }

    const logEntry = JSON.stringify({status: nextStep, at: new Date().toISOString()});

    if (isOutreachPromote(req.body)) {
      const result = await transaction(async (client) => {
        if (entry.candidate_id && entry.position_id) {
          const dup = await client.query(
            `SELECT id FROM contacts WHERE candidate_id = $1 AND position_id = $2 LIMIT 1`,
            [entry.candidate_id, entry.position_id],
          );
          if (dup.rows.length > 0) {
            return {duplicate: true as const};
          }
        }

        const contactResult = await client.query(
          `INSERT INTO contacts
             (candidate_id, candidate_name, position_id, position_name, project_id, project_name,
              outreach_person, channel, reason, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
           RETURNING *`,
          [
            entry.candidate_id ?? null,
            entry.candidate_name,
            entry.position_id ?? null,
            entry.position_name ?? null,
            entry.project_id ?? null,
            entry.project_name ?? null,
            String(outreachPerson).trim(),
            channel,
            String(reason).trim(),
          ],
        );

        const updatedResult = await client.query(
          `UPDATE shortlist_entries
           SET next_step = $1,
               status_log = COALESCE(status_log, '[]'::jsonb) || $3::jsonb
           WHERE id = $2
           RETURNING *`,
          [nextStep, id, logEntry],
        );

        if (updatedResult.rows.length === 0) {
          throw new Error('Shortlist entry update failed');
        }

        return {
          duplicate: false as const,
          entry: updatedResult.rows[0],
          contact: contactResult.rows[0],
        };
      });

      if (result.duplicate) {
        res.status(409).json({error: {code: 'DUPLICATE', message: '该候选人已在此岗位的联系人列表中'}});
        return;
      }

      res.json({entry: result.entry, contact: result.contact});
      return;
    }

    const row = await queryOne(
      `UPDATE shortlist_entries
       SET next_step = $1,
           status_log = COALESCE(status_log, '[]'::jsonb) || $3::jsonb
       WHERE id = $2
       RETURNING *`,
      [nextStep, id, logEntry],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Shortlist entry (${id}) not found`}});
      return;
    }
    res.json({entry: row});
  } catch (e) { next(e); }
});

// POST /:id/interview-invite — create outreach record + update next_step + auto-create interview session
router.post('/:id/interview-invite', async (req, res, next) => {
  try {
    const {id} = req.params;
    const {type, subject, content, candidateEmail, templateId} = req.body;
    const crypto = await import('crypto');

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

    // Update shortlist next_step with history
    const logEntry = JSON.stringify({status: '已发面试邀请', at: new Date().toISOString()});
    const updated = await queryOne(
      `UPDATE shortlist_entries
       SET next_step = '已发面试邀请',
           status_log = COALESCE(status_log, '[]'::jsonb) || $2::jsonb
       WHERE id = $1
       RETURNING *`,
      [id, logEntry],
    );

    // Auto-create interview session when candidate_id and position_id are available
    let sessionCreated: Record<string, unknown> | null = null;
    const candidateId = entry.candidate_id ? String(entry.candidate_id) : null;
    const positionId = entry.position_id ? String(entry.position_id) : null;

    if (candidateId && positionId) {
      let resolvedTemplateId = templateId ? String(templateId) : null;
      if (!resolvedTemplateId) {
        const tpl = await queryOne(
          `SELECT id FROM interview_templates
           WHERE position_id = $1 AND status = 'active' AND interview_mode = 'text_chat_conversational'
           ORDER BY created_at DESC LIMIT 1`,
          [positionId],
        );
        resolvedTemplateId = tpl ? String(tpl.id) : null;
      }
      if (!resolvedTemplateId) {
        const tpl = await queryOne(
          `SELECT id FROM interview_templates
           WHERE position_id = $1 AND status = 'active'
           ORDER BY created_at DESC LIMIT 1`,
          [positionId],
        );
        resolvedTemplateId = tpl ? String(tpl.id) : null;
      }

      if (resolvedTemplateId) {
        const accessToken = crypto.randomUUID();
        const session = await queryOne(
          `INSERT INTO interview_sessions (candidate_id, template_id, status, access_token)
           VALUES ($1, $2, 'created', $3) RETURNING *`,
          [candidateId, resolvedTemplateId, accessToken],
        );
        if (session) {
          sessionCreated = {
            sessionId: session.id,
            accessToken,
            interviewUrl: `/interview/${accessToken}`,
          };
        }
      }
    }

    res.json({...updated, interviewSession: sessionCreated});
  } catch (e) { next(e); }
});

export default router;
