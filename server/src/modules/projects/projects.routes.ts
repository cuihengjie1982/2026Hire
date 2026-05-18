import {Router} from 'express';
import {query, queryOne} from '../../config/database.js';

const router = Router();

// GET / — list all projects
router.get('/', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT * FROM projects ORDER BY created_at DESC`,
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /stats — aggregate project stats
router.get('/stats', async (req, res, next) => {
  try {
    const [activeResult, candidateResult, weeklyResult] = await Promise.all([
      query(`SELECT COUNT(*)::int AS "activeProjects" FROM projects WHERE status = '进行中'`),
      query(`SELECT COUNT(*)::int AS "candidateReserve" FROM candidates`),
      query(`
        SELECT COUNT(*)::int AS "weeklyInterviews"
        FROM interview_results
        WHERE created_at >= date_trunc('week', now())
      `),
    ]);

    const activeProjects = activeResult[0]?.activeProjects ?? 0;
    const candidateReserve = candidateResult[0]?.candidateReserve ?? 0;
    const weeklyInterviews = weeklyResult[0]?.weeklyInterviews ?? 0;

    res.json({activeProjects, candidateReserve, weeklyInterviews});
  } catch (e) { next(e); }
});

// POST / — create a project
router.post('/', async (req, res, next) => {
  try {
    const {name, city, manager, progress, startDate, endDate, status, description} = req.body;
    if (!name) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Project name is required'}});
      return;
    }
    const safeDescription = description && description.trim() ? description : null;
    const createdBy = req.user?.userId ?? null;
    const row = await queryOne(
      `INSERT INTO projects (name, city, manager, progress, start_date, end_date, status, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [name, city ?? null, manager ?? null, progress ?? 0, startDate ?? null, endDate ?? null, status ?? '筹备中', safeDescription, createdBy],
    );
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// PATCH /:id — update project fields
router.patch('/:id', async (req, res, next) => {
  try {
    const {id} = req.params;
    const {name, city, manager, progress, startDate, endDate, status, description} = req.body;
    const row = await queryOne(
      `UPDATE projects SET
        name = COALESCE($1, name),
        city = COALESCE($2, city),
        manager = COALESCE($3, manager),
        progress = COALESCE($4, progress),
        start_date = COALESCE($5, start_date),
        end_date = COALESCE($6, end_date),
        status = COALESCE($7, status),
        description = COALESCE($8, description)
       WHERE id = $9 RETURNING *`,
      [name ?? null, city ?? null, manager ?? null, progress ?? null, startDate ?? null, endDate ?? null, status ?? null, description ?? null, id],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Project (${id}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// PATCH /:id/status — update project status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const {id} = req.params;
    const {status} = req.body;
    if (!status) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Status is required'}});
      return;
    }
    const row = await queryOne(
      `UPDATE projects SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Project (${id}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// DELETE /:id — delete a project and clean up references
router.delete('/:id', async (req, res, next) => {
  try {
    const {id} = req.params;

    // Check project exists
    const existing = await queryOne('SELECT id FROM projects WHERE id = $1', [id]);
    if (!existing) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Project (${id}) not found`}});
      return;
    }

    // Nullify foreign keys that use ON DELETE SET NULL (positions, candidates, agents)
    await query('UPDATE positions SET project_id = NULL WHERE project_id = $1', [id]);
    await query('UPDATE candidates SET project_id = NULL WHERE project_id = $1', [id]);
    await query('UPDATE agents SET project_id = NULL WHERE project_id = $1', [id]);

    // Delete records from tables that reference projects without CASCADE
    await query('DELETE FROM shortlist_entries WHERE project_id = $1', [id]);
    await query('DELETE FROM contacts WHERE project_id = $1', [id]);

    // Now safe to delete the project
    await query('DELETE FROM projects WHERE id = $1', [id]);
    res.json({deleted: true});
  } catch (e) { next(e); }
});

export default router;
