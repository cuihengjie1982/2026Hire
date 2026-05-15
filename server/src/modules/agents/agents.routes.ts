import {Router} from 'express';
import {query, queryOne} from '../../config/database.js';
import {runParser, runScreener, runMatcher} from './agentExecutor.js';

const router = Router();

// GET / — list agents, optional projectId filter
router.get('/', async (req, res, next) => {
  try {
    const {projectId} = req.query;
    let sql = `SELECT * FROM agents ORDER BY created_at DESC`;
    const params: unknown[] = [];

    if (projectId) {
      sql = `SELECT * FROM agents WHERE project_id = $1 ORDER BY created_at DESC`;
      params.push(projectId);
    }

    const rows = await query(sql, params);
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /stats — aggregate agent stats
router.get('/stats', async (req, res, next) => {
  try {
    const [totalResult, runningResult, pausedResult, pendingResult] = await Promise.all([
      queryOne(`SELECT COUNT(*)::int AS "totalAgents" FROM agents`),
      queryOne(`SELECT COUNT(*)::int AS "runningAgents" FROM agents WHERE status = 'running'`),
      queryOne(`SELECT COUNT(*)::int AS "pausedAgents" FROM agents WHERE status = 'paused'`),
      queryOne(`SELECT COUNT(*)::int AS "pendingAgents" FROM agents WHERE status = 'pending'`),
    ]);

    const aggregate = await queryOne(
      `SELECT
         SUM(approved)::int AS "totalApproved",
         SUM(rejected)::int AS "totalRejected",
         SUM(pending_count)::int AS "totalPending",
         CASE WHEN COUNT(*) = 0 THEN 0
              ELSE ROUND(AVG(adoption_rate), 2)
         END AS "avgAdoptionRate"
       FROM agents`,
    );

    res.json({
      totalAgents: totalResult?.totalAgents ?? 0,
      runningAgents: runningResult?.runningAgents ?? 0,
      pausedAgents: pausedResult?.pausedAgents ?? 0,
      pendingAgents: pendingResult?.pendingAgents ?? 0,
      totalApproved: aggregate?.totalApproved ?? 0,
      totalRejected: aggregate?.totalRejected ?? 0,
      totalPending: aggregate?.totalPending ?? 0,
      avgAdoptionRate: parseFloat(String(aggregate?.avgAdoptionRate ?? 0)),
    });
  } catch (e) { next(e); }
});

// POST / — create agent
router.post('/', async (req, res, next) => {
  try {
    const {name, description, projectId, projectName, roleType, type, status, config} = req.body;
    if (!name) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Agent name is required'}});
      return;
    }
    const row = await queryOne(
      `INSERT INTO agents (name, description, project_id, project_name, role_type, type, status, config)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        name, description ?? null,
        projectId ?? null, projectName ?? null,
        roleType ?? null, type ?? null,
        status ?? 'pending',
        config ? JSON.stringify(config) : '{}',
      ],
    );
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// PATCH /:id — update agent properties
router.patch('/:id', async (req, res, next) => {
  try {
    const {id} = req.params;
    const {name, description, type, config} = req.body;

    const existing = await queryOne(`SELECT * FROM agents WHERE id = $1`, [id]);
    if (!existing) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Agent (${id}) not found`}});
      return;
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name); }
    if (description !== undefined) { sets.push(`description = $${idx++}`); params.push(description); }
    if (type !== undefined) { sets.push(`type = $${idx++}`); params.push(type); }
    if (config !== undefined) { sets.push(`config = $${idx++}`); params.push(JSON.stringify(config)); }

    if (sets.length === 0) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'No fields to update'}});
      return;
    }

    sets.push(`updated_at = now()`);
    params.push(id);

    const row = await queryOne(
      `UPDATE agents SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );
    res.json(row);
  } catch (e) { next(e); }
});

// POST /:id/pause — update status to paused
router.post('/:id/pause', async (req, res, next) => {
  try {
    const {id} = req.params;
    const row = await queryOne(
      `UPDATE agents SET status = 'paused', updated_at = now() WHERE id = $1 RETURNING *`,
      [id],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Agent (${id}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// POST /:id/resume — update status to running
router.post('/:id/resume', async (req, res, next) => {
  try {
    const {id} = req.params;
    const row = await queryOne(
      `UPDATE agents SET status = 'running', updated_at = now() WHERE id = $1 RETURNING *`,
      [id],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Agent (${id}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// POST /:id/run — execute agent
router.post('/:id/run', async (req, res, next) => {
  try {
    const {id} = req.params;
    const agent = await queryOne(`SELECT * FROM agents WHERE id = $1`, [id]);
    if (!agent) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: 'Agent not found'}});
      return;
    }

    const type = String(agent.type || '');
    let result;
    switch (type) {
      case 'parser':
        result = await runParser(agent);
        break;
      case 'screener':
        result = await runScreener(agent);
        break;
      case 'matcher':
        result = await runMatcher(agent);
        break;
      default:
        res.status(400).json({error: {code: 'INVALID_TYPE', message: `Unknown agent type: ${type}`}});
        return;
    }

    // Return updated agent + run result
    const updated = await queryOne(`SELECT * FROM agents WHERE id = $1`, [id]);
    res.json({...updated, runResult: result});
  } catch (e) {
    next(e);
  }
});

// DELETE /:id — delete agent
router.delete('/:id', async (req, res, next) => {
  try {
    const {id} = req.params;
    const row = await queryOne(
      `DELETE FROM agents WHERE id = $1 RETURNING id`,
      [id],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Agent (${id}) not found`}});
      return;
    }
    res.json({deleted: true, id: row.id});
  } catch (e) { next(e); }
});

export default router;
