import {Router} from 'express';
import {query, queryOne, transaction} from '../../config/database.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════
// Employee Profiles
// ═══════════════════════════════════════════════════════════════════

// GET / — list employee profiles with pagination + filters
router.get('/', async (req, res, next) => {
  try {
    const {
      status, projectId, positionId, page = '1', pageSize = '50',
    } = req.query as Record<string, string>;
    const limit = Math.min(parseInt(pageSize, 10) || 50, 200);
    const offset = (parseInt(page, 10) - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) {
      conditions.push(`ep.status = $${params.length + 1}`);
      params.push(status);
    }
    if (projectId) {
      conditions.push(`ep.project_id = $${params.length + 1}`);
      params.push(projectId);
    }
    if (positionId) {
      conditions.push(`ep.position_id = $${params.length + 1}`);
      params.push(positionId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows, countResult] = await Promise.all([
      query(
        `SELECT ep.* FROM employee_profiles ep ${where}
         ORDER BY ep.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      queryOne(`SELECT COUNT(*)::int AS total FROM employee_profiles ep ${where}`, params),
    ]);

    // Compute retention_days for active employees
    const mapped = rows.map((r: Record<string, unknown>) => {
      if (r.status === 'active' && r.hire_date) {
        const hire = new Date(r.hire_date as string);
        r.retention_days = Math.floor((Date.now() - hire.getTime()) / 86400000);
      }
      return r;
    });

    res.json({items: mapped, total: countResult?.total ?? 0, page: parseInt(page, 10), pageSize: limit});
  } catch (e) { next(e); }
});

// GET /stats — aggregated employee statistics
router.get('/stats', async (_req, res, next) => {
  try {
    const [
      totalActive,
      avgPerformance,
      avgRetention,
      statusBreakdown,
      gradeDistribution,
    ] = await Promise.all([
      queryOne(`SELECT COUNT(*)::int AS total FROM employee_profiles WHERE status = 'active'`),
      queryOne(`SELECT AVG(avg_performance)::numeric(5,2) AS avg FROM employee_profiles WHERE status = 'active' AND avg_performance IS NOT NULL`),
      queryOne(`SELECT AVG(retention_days)::int AS avg FROM employee_profiles WHERE status = 'active' AND retention_days IS NOT NULL`),
      query(`SELECT status, COUNT(*)::int AS count FROM employee_profiles GROUP BY status`),
      query(`SELECT interview_grade, COUNT(*)::int AS count FROM employee_profiles WHERE interview_grade IS NOT NULL GROUP BY interview_grade`),
    ]);

    const statusMap: Record<string, number> = {};
    for (const r of statusBreakdown as Record<string, unknown>[]) {
      statusMap[r.status as string] = r.count as number;
    }
    const gradeMap: Record<string, number> = {};
    for (const r of gradeDistribution as Record<string, unknown>[]) {
      gradeMap[r.interview_grade as string] = r.count as number;
    }

    res.json({
      totalActive: totalActive?.total ?? 0,
      avgPerformance: avgPerformance?.avg ?? 0,
      avgRetentionDays: avgRetention?.avg ?? 0,
      statusBreakdown: statusMap,
      gradeDistribution: gradeMap,
    });
  } catch (e) { next(e); }
});

// GET /:id — single employee profile
router.get('/:id', async (req, res, next) => {
  try {
    const row = await queryOne(
      `SELECT ep.*,
              c.parsed_info,
              c.raw_resume_md,
              c.score_total AS resume_score,
              c.grade AS resume_grade
       FROM employee_profiles ep
       LEFT JOIN candidates c ON c.id = ep.candidate_id
       WHERE ep.id = $1`,
      [req.params.id],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Employee profile (${req.params.id}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// POST / — create employee profile (typically from a hired candidate)
router.post('/', async (req, res, next) => {
  try {
    const {
      candidateId, name, email, phone,
      status, hireDate, projectId, positionId,
      department, manager,
      education, major, certifications, skills, personality,
      commuteDistance, familyStatus,
      interviewScore, interviewGrade, interviewWeaknesses,
    } = req.body;

    if (!candidateId || !name) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'candidateId and name are required'}});
      return;
    }

    // Check candidate exists
    const candidate = await queryOne(`SELECT id, email, phone FROM candidates WHERE id = $1`, [candidateId]);
    if (!candidate) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Candidate (${candidateId}) not found`}});
      return;
    }

    // Check for duplicate employee profile
    const existing = await queryOne(`SELECT id FROM employee_profiles WHERE candidate_id = $1`, [candidateId]);
    if (existing) {
      res.status(409).json({error: {code: 'DUPLICATE', message: `Employee profile already exists for candidate ${candidateId}`}});
      return;
    }

    const row = await queryOne(
      `INSERT INTO employee_profiles
        (candidate_id, name, email, phone, status, hire_date,
         project_id, position_id, department, manager,
         education, major, certifications, skills, personality,
         commute_distance, family_status,
         interview_score, interview_grade, interview_weaknesses)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        candidateId, name, email ?? candidate.email, phone ?? candidate.phone,
        status ?? 'active', hireDate ?? new Date().toISOString().slice(0, 10),
        projectId ?? null, positionId ?? null,
        department ?? null, manager ?? null,
        education ?? null, major ?? null,
        certifications ? JSON.stringify(certifications) : null,
        skills ? JSON.stringify(skills) : null,
        personality ? JSON.stringify(personality) : null,
        commuteDistance ?? null, familyStatus ?? null,
        interviewScore ?? null, interviewGrade ?? null,
        interviewWeaknesses ? JSON.stringify(interviewWeaknesses) : null,
      ],
    );
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// PATCH /:id — update employee profile
router.patch('/:id', async (req, res, next) => {
  try {
    const {id} = req.params;
    const updates = req.body;

    // Build dynamic SET clause
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const allowedFields: Record<string, string> = {
      name: 'name', email: 'email', phone: 'phone',
      status: 'status', hireDate: 'hire_date', terminationDate: 'termination_date',
      terminationReason: 'termination_reason',
      projectId: 'project_id', positionId: 'position_id',
      department: 'department', manager: 'manager',
      education: 'education', major: 'major',
      certifications: 'certifications', skills: 'skills', personality: 'personality',
      commuteDistance: 'commute_distance', familyStatus: 'family_status',
      interviewScore: 'interview_score', interviewGrade: 'interview_grade',
      interviewWeaknesses: 'interview_weaknesses',
      avgPerformance: 'avg_performance', trainingScore: 'training_score',
    };

    for (const [bodyKey, colName] of Object.entries(allowedFields)) {
      if (updates[bodyKey] !== undefined) {
        let val = updates[bodyKey];
        // JSONB fields need stringify
        if (['certifications', 'skills', 'personality', 'interview_weaknesses'].includes(bodyKey)) {
          val = JSON.stringify(val);
        }
        fields.push(`${colName} = $${idx++}`);
        values.push(val);
      }
    }

    if (fields.length === 0) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'No valid fields to update'}});
      return;
    }

    fields.push(`updated_at = now()`);
    values.push(id);

    const row = await queryOne(
      `UPDATE employee_profiles SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Employee profile (${id}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// DELETE /:id — delete employee profile
router.delete('/:id', async (req, res, next) => {
  try {
    const row = await queryOne(`DELETE FROM employee_profiles WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Employee profile (${req.params.id}) not found`}});
      return;
    }
    res.json({deleted: true, id: row.id});
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════
// Performance Records (nested under employee)
// ═══════════════════════════════════════════════════════════════════

// GET /:id/performance — list performance records for an employee
router.get('/:id/performance', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT * FROM employee_performance WHERE employee_id = $1 ORDER BY period DESC`,
      [req.params.id],
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /:id/performance — add performance record
router.post('/:id/performance', async (req, res, next) => {
  try {
    const {id} = req.params;
    const {period, score, rating, dimensions, strengths, weaknesses, notes, reviewer} = req.body;

    if (!period || score === undefined) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'period and score are required'}});
      return;
    }

    // Verify employee exists
    const emp = await queryOne(`SELECT id FROM employee_profiles WHERE id = $1`, [id]);
    if (!emp) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Employee (${id}) not found`}});
      return;
    }

    const row = await queryOne(
      `INSERT INTO employee_performance
        (employee_id, period, score, rating, dimensions, strengths, weaknesses, notes, reviewer)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (employee_id, period) DO UPDATE SET
         score = EXCLUDED.score, rating = EXCLUDED.rating,
         dimensions = EXCLUDED.dimensions, strengths = EXCLUDED.strengths,
         weaknesses = EXCLUDED.weaknesses, notes = EXCLUDED.notes,
         reviewer = EXCLUDED.reviewer
       RETURNING *`,
      [
        id, period, score, rating ?? null,
        dimensions ? JSON.stringify(dimensions) : '[]',
        strengths ? JSON.stringify(strengths) : '[]',
        weaknesses ? JSON.stringify(weaknesses) : '[]',
        notes ?? null, reviewer ?? null,
      ],
    );

    // Update employee's avg_performance
    await queryOne(
      `UPDATE employee_profiles SET avg_performance = (
         SELECT AVG(score) FROM employee_performance WHERE employee_id = $1
       ), updated_at = now() WHERE id = $1`,
      [id],
    );

    res.status(201).json(row);
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════
// Competency Models (standalone, keyed by position)
// ═══════════════════════════════════════════════════════════════════

// GET /competency-models — list competency models (optionally filter by positionId)
router.get('/competency-models', async (req, res, next) => {
  try {
    const {positionId} = req.query as Record<string, string>;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (positionId) {
      conditions.push(`cm.position_id = $${params.length + 1}`);
      params.push(positionId);
    }
    // Default to active only
    conditions.push(`cm.is_active = true`);

    const where = `WHERE ${conditions.join(' AND ')}`;
    const rows = await query(
      `SELECT cm.*, p.name AS position_name
       FROM competency_models cm
       LEFT JOIN positions p ON p.id = cm.position_id
       ${where}
       ORDER BY cm.created_at DESC`,
      params,
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /competency-models/:id — single competency model
router.get('/competency-models/:id', async (req, res, next) => {
  try {
    const row = await queryOne(
      `SELECT cm.*, p.name AS position_name
       FROM competency_models cm
       LEFT JOIN positions p ON p.id = cm.position_id
       WHERE cm.id = $1`,
      [req.params.id],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Competency model (${req.params.id}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// POST /competency-models — create competency model
router.post('/competency-models', async (req, res, next) => {
  try {
    const {positionId, name, dimensions, sourceType, derivedFrom} = req.body;

    if (!positionId || !name) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'positionId and name are required'}});
      return;
    }

    // Deactivate previous active models for this position
    await query(
      `UPDATE competency_models SET is_active = false, updated_at = now() WHERE position_id = $1 AND is_active = true`,
      [positionId],
    );

    const row = await queryOne(
      `INSERT INTO competency_models
        (position_id, name, dimensions, source_type, derived_from)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [
        positionId, name,
        dimensions ? JSON.stringify(dimensions) : '[]',
        sourceType ?? 'manual',
        derivedFrom ? JSON.stringify(derivedFrom) : '{}',
      ],
    );
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// POST /competency-models/derive/:positionId — auto-derive from top performers
router.post('/competency-models/derive/:positionId', async (req, res, next) => {
  try {
    const {positionId} = req.params;
    const {topN = 5} = req.body;

    // Find top performers for this position
    const topEmployees = await query(
      `SELECT id, name, avg_performance, interview_score, interview_grade,
              skills, interview_weaknesses
       FROM employee_profiles
       WHERE position_id = $1 AND status = 'active' AND avg_performance IS NOT NULL
       ORDER BY avg_performance DESC
       LIMIT $2`,
      [positionId, topN],
    );

    if (topEmployees.length === 0) {
      res.status(400).json({error: {code: 'NO_DATA', message: 'No employees with performance data found for this position'}});
      return;
    }

    // Aggregate dimensions from top performers
    const allSkills: Record<string, {count: number; total: number}> = {};
    const allWeaknesses: Record<string, number> = {};
    let totalPerf = 0;
    const employeeIds: string[] = [];

    for (const emp of topEmployees as Record<string, unknown>[]) {
      employeeIds.push(emp.id as string);
      totalPerf += Number(emp.avg_performance ?? 0);

      const skills = (emp.skills ?? []) as {name: string; level: number}[];
      for (const s of skills) {
        if (!allSkills[s.name]) allSkills[s.name] = {count: 0, total: 0};
        allSkills[s.name].count++;
        allSkills[s.name].total += s.level;
      }

      const weaknesses = (emp.interview_weaknesses ?? []) as string[];
      for (const w of weaknesses) {
        allWeaknesses[w] = (allWeaknesses[w] ?? 0) + 1;
      }
    }

    // Build dimension weights (normalized to sum=100)
    const dimEntries = Object.entries(allSkills).sort((a, b) => b[1].count - a[1].count);
    const totalWeight = dimEntries.reduce((sum, [, v]) => sum + v.count, 0);
    const dimensions = dimEntries.slice(0, 10).map(([name, v]) => ({
      name,
      weight: Math.round((v.count / totalWeight) * 100),
      description: `Top performers avg level: ${(v.total / v.count).toFixed(1)}`,
    }));

    // Deactivate previous models
    await query(
      `UPDATE competency_models SET is_active = false, updated_at = now() WHERE position_id = $1 AND is_active = true`,
      [positionId],
    );

    const position = await queryOne(`SELECT name FROM positions WHERE id = $1`, [positionId]);
    const modelName = `${position?.name ?? '岗位'}胜任力模型 v${new Date().toISOString().slice(0, 10)}`;

    const row = await queryOne(
      `INSERT INTO competency_models
        (position_id, name, dimensions, source_type, derived_from)
       VALUES ($1,$2,$3,'ai_derived',$4)
       RETURNING *`,
      [
        positionId, modelName,
        JSON.stringify(dimensions),
        JSON.stringify({
          employee_ids: employeeIds,
          sample_size: employeeIds.length,
          avg_score: (totalPerf / employeeIds.length).toFixed(2),
          common_weaknesses: Object.entries(allWeaknesses)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({name, count})),
        }),
      ],
    );
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// PATCH /competency-models/:id — update competency model
router.patch('/competency-models/:id', async (req, res, next) => {
  try {
    const {id} = req.params;
    const {name, dimensions, isActive} = req.body;

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (dimensions !== undefined) { fields.push(`dimensions = $${idx++}`); values.push(JSON.stringify(dimensions)); }
    if (isActive !== undefined) { fields.push(`is_active = $${idx++}`); values.push(isActive); }
    fields.push(`updated_at = now()`);

    values.push(id);
    const row = await queryOne(
      `UPDATE competency_models SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Competency model (${id}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// DELETE /competency-models/:id
router.delete('/competency-models/:id', async (req, res, next) => {
  try {
    const row = await queryOne(`DELETE FROM competency_models WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Competency model (${req.params.id}) not found`}});
      return;
    }
    res.json({deleted: true, id: row.id});
  } catch (e) { next(e); }
});

export default router;
