import {Router} from 'express';
import {query, queryOne} from '../../config/database.js';

const router = Router();

// GET / — list positions, optionally filter by projectId, with pagination
router.get('/', async (req, res, next) => {
  try {
    const {projectId, page = '1', pageSize = '50'} = req.query as Record<string, string>;
    const limit = Math.min(parseInt(pageSize, 10) || 50, 200);
    const offset = (parseInt(page, 10) - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (projectId) {
      conditions.push(`p.project_id = $${params.length + 1}`);
      params.push(projectId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows, countResult] = await Promise.all([
      query(
        `SELECT p.*, pr.name AS "projectName"
         FROM positions p
         LEFT JOIN projects pr ON p.project_id = pr.id
         ${whereClause}
         ORDER BY p.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      queryOne(
        `SELECT COUNT(*)::int AS total FROM positions p ${whereClause}`,
        params,
      ),
    ]);

    res.json({items: rows, total: countResult?.total ?? 0, page: parseInt(page, 10), pageSize: limit});
  } catch (e) { next(e); }
});

// GET /:id — position detail + position_details
router.get('/:id', async (req, res, next) => {
  try {
    const {id} = req.params;
    const row = await queryOne(
      `SELECT p.*, pr.name AS "projectName", pd.profile, pd.scoring_rules, pd.grade_rules, pd.keyword_rules, pd.ai_prompt
       FROM positions p
       LEFT JOIN projects pr ON p.project_id = pr.id
       LEFT JOIN position_details pd ON p.id = pd.position_id
       WHERE p.id = $1`,
      [id],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Position (${id}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// POST / — create position
router.post('/', async (req, res, next) => {
  try {
    let {name, category, projectId, status, description, requiredCount, deliveryDays, createdBy} = req.body;
    if (!name || !category) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'name and category are required'}});
      return;
    }
    // Normalize empty strings to null for UUID and optional fields
    const safeProjectId = projectId && projectId.trim() ? projectId : null;
    const safeCreatedBy = createdBy && createdBy.trim() ? createdBy : null;
    const safeDescription = description && description.trim() ? description : null;
    const safeRequiredCount = typeof requiredCount === 'number' ? requiredCount : 0;
    const safeDeliveryDays = typeof deliveryDays === 'number' ? deliveryDays : 0;

    // Auto-generate a unique code if not provided (code is always auto-generated now)
    const codeInput = req.body.code;
    let code: string;
    if (!codeInput || !String(codeInput).trim()) {
      const result = await queryOne<{next_code: string}>(
        `SELECT 'POS-' || to_char(now(), 'YYYYMMDD') || '-' || LPAD(nextval('positions_code_seq')::text, 4, '0') AS next_code`,
      );
      code = result?.next_code ?? `POS-${Date.now()}`;
    } else {
      code = String(codeInput).trim();
    }

    // Check for duplicate by name (case-insensitive) to handle race conditions
    // where two requests get the same sequence value before insert
    const existing = await queryOne<{id: string; code: string}>(
      `SELECT id, code FROM positions WHERE UPPER(name) = UPPER($1) LIMIT 1`,
      [name],
    );
    if (existing) {
      res.status(409).json({error: {code: 'DUPLICATE', message: 'Record already exists'}});
      return;
    }

    const row = await queryOne(
      `INSERT INTO positions (code, name, category, project_id, status, description, required_count, delivery_days, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [code, name, category, safeProjectId, status ?? 'active', safeDescription, safeRequiredCount, safeDeliveryDays, safeCreatedBy],
    );
    res.status(201).json(row);
  } catch (e: unknown) {
    // If sequence doesn't exist, create it and retry
    if ((e as { code?: string })?.code === '42P01') {
      try {
        await query('CREATE SEQUENCE IF NOT EXISTS positions_code_seq START 1');
        const code = `POS-${Date.now()}`;
        const safeProjectId = req.body.projectId && req.body.projectId.trim() ? req.body.projectId : null;
        const safeRequiredCount = typeof req.body.requiredCount === 'number' ? req.body.requiredCount : 0;
        const safeDeliveryDays = typeof req.body.deliveryDays === 'number' ? req.body.deliveryDays : 0;
        const row = await queryOne(
          `INSERT INTO positions (code, name, category, project_id, status, description, required_count, delivery_days, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [code, req.body.name, req.body.category, safeProjectId, req.body.status ?? 'active', req.body.description || null, safeRequiredCount, safeDeliveryDays, req.body.createdBy || null],
        );
        res.status(201).json(row);
        return;
      } catch (e2) { next(e2); return; }
    }
    next(e);
  }
});

// PATCH /:id — update position fields
router.patch('/:id', async (req, res, next) => {
  try {
    const {id} = req.params;
    const allowed = ['name', 'category', 'status', 'description', 'requiredCount', 'deliveryDays'];
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    // Normalize projectId: treat empty string as null
    const projectId = req.body.projectId;
    const safeProjectId = projectId === '' ? null : projectId;

    // Map camelCase to snake_case for database columns
    const fieldMap: Record<string, string> = {
      requiredCount: 'required_count',
      deliveryDays: 'delivery_days',
    };

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        const col = fieldMap[key] || key;
        sets.push(`${col} = $${idx++}`);
        params.push(req.body[key]);
      }
    }

    // Handle projectId separately since it needs null normalization
    if (req.body.projectId !== undefined) {
      sets.push(`project_id = $${idx++}`);
      params.push(safeProjectId);
    }

    if (sets.length === 0) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'No fields to update'}});
      return;
    }

    sets.push(`updated_at = now()`);
    params.push(id);

    const row = await queryOne(
      `UPDATE positions SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Position (${id}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// PUT /:id/detail — upsert position_details
router.put('/:id/detail', async (req, res, next) => {
  try {
    const {id} = req.params;
    const {profile, scoring_rules, grade_rules, keyword_rules, ai_prompt} = req.body;

    const row = await queryOne(
      `INSERT INTO position_details (position_id, profile, scoring_rules, grade_rules, keyword_rules, ai_prompt)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (position_id) DO UPDATE
         SET profile       = EXCLUDED.profile,
             scoring_rules = EXCLUDED.scoring_rules,
             grade_rules   = EXCLUDED.grade_rules,
             keyword_rules = EXCLUDED.keyword_rules,
             ai_prompt     = EXCLUDED.ai_prompt
       RETURNING *`,
      [
        id,
        profile ? JSON.stringify(profile) : '{"mustHave":[],"niceToHave":[],"bonus":[]}',
        scoring_rules ? JSON.stringify(scoring_rules) : '[]',
        grade_rules ? JSON.stringify(grade_rules) : '[]',
        keyword_rules ?? '',
        ai_prompt ?? '',
      ],
    );
    res.json(row);
  } catch (e) { next(e); }
});

// DELETE /:id — delete position
router.delete('/:id', async (req, res, next) => {
  try {
    const {id} = req.params;

    // Check position exists
    const existing = await queryOne('SELECT id FROM positions WHERE id = $1', [id]);
    if (!existing) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Position (${id}) not found`}});
      return;
    }

    // Nullify foreign keys in tables that don't have ON DELETE CASCADE
    await query('UPDATE shortlist_entries SET position_id = NULL, position_name = NULL WHERE position_id = $1', [id]);
    await query('UPDATE outreach_records SET position_id = NULL WHERE position_id = $1', [id]);
    await query('UPDATE outreach_campaigns SET position_id = NULL WHERE position_id = $1', [id]);
    await query('UPDATE approval_requests SET position_id = NULL WHERE position_id = $1', [id]);
    await query('UPDATE contacts SET position_id = NULL, position_name = NULL WHERE position_id = $1', [id]);

    // Delete the position (position_details and interview_templates have ON DELETE CASCADE)
    await query('DELETE FROM positions WHERE id = $1', [id]);
    res.json({deleted: true});
  } catch (e) { next(e); }
});

export default router;
