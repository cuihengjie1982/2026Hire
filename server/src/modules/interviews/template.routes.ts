import {Router} from 'express';
import {query, queryOne} from '../../config/database.js';
import {validateUuidParams} from '../../middleware/validateParams.js';

const router = Router();

// ---------------------------------------------------------------------------
// Template CRUD
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
// Question routes (nested under templates)
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

export default router;
