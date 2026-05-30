import {Router} from 'express';
import {query, queryOne} from '../../config/database.js';
import {requireRole} from '../../middleware/requireRole.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const router = Router();

// File upload config (dev-only; production uses Supabase Storage via Edge Functions)
const uploadsDir = path.resolve('server/uploads/training-materials');
fs.mkdirSync(uploadsDir, {recursive: true});
const upload = multer({
  dest: uploadsDir,
  limits: {fileSize: 500 * 1024 * 1024}, // 500MB
});

// ═══════════════════════════════════════════════════════════════════
// Courses (admin + recruiter 可管理, viewer 只读)
// ═══════════════════════════════════════════════════════════════════

// GET /courses — list courses with filters (all authenticated users)
router.get('/courses', async (req, res, next) => {
  try {
    const {category, positionId, difficulty, page = '1', pageSize = '50'} = req.query as Record<string, string>;
    const limit = Math.min(parseInt(pageSize, 10) || 50, 200);
    const offset = (parseInt(page, 10) - 1) * limit;

    const conditions: string[] = ['tc.is_active = true'];
    const params: unknown[] = [];

    if (category) { conditions.push(`tc.category = $${params.length + 1}`); params.push(category); }
    if (positionId) { conditions.push(`tc.position_id = $${params.length + 1}`); params.push(positionId); }
    if (difficulty) { conditions.push(`tc.difficulty = $${params.length + 1}`); params.push(difficulty); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [rows, countResult] = await Promise.all([
      query(
        `SELECT tc.*, p.name AS position_name
         FROM training_courses tc LEFT JOIN positions p ON p.id = tc.position_id
         ${where} ORDER BY tc.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      queryOne(`SELECT COUNT(*)::int AS total FROM training_courses tc ${where}`, params),
    ]);

    res.json({items: rows, total: countResult?.total ?? 0, page: parseInt(page, 10), pageSize: limit});
  } catch (e) { next(e); }
});

// GET /courses/:id
router.get('/courses/:id', async (req, res, next) => {
  try {
    const row = await queryOne(
      `SELECT tc.*, p.name AS position_name
       FROM training_courses tc LEFT JOIN positions p ON p.id = tc.position_id
       WHERE tc.id = $1`,
      [req.params.id],
    );
    if (!row) { res.status(404).json({error: {code: 'NOT_FOUND', message: `Course (${req.params.id}) not found`}}); return; }
    res.json(row);
  } catch (e) { next(e); }
});

// POST /courses (admin, recruiter)
router.post('/courses', requireRole('admin', 'recruiter'), async (req, res, next) => {
  try {
    const {title, description, category, difficulty, durationMinutes, content, materials,
           assessmentConfig, positionId, competencyDimension} = req.body;
    if (!title) { res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'title is required'}}); return; }

    const row = await queryOne(
      `INSERT INTO training_courses
        (title, description, category, difficulty, duration_minutes, content, materials,
         assessment_config, position_id, competency_dimension)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        title, description ?? null, category ?? '综合', difficulty ?? '初级',
        durationMinutes ?? 30,
        content ? JSON.stringify(content) : '[]',
        materials ? JSON.stringify(materials) : '[]',
        assessmentConfig ? JSON.stringify(assessmentConfig) : '{}',
        positionId ?? null, competencyDimension ?? null,
      ],
    );
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// PATCH /courses/:id (admin, recruiter)
router.patch('/courses/:id', requireRole('admin', 'recruiter'), async (req, res, next) => {
  try {
    const allowed: Record<string, string> = {
      title: 'title', description: 'description', category: 'category',
      difficulty: 'difficulty', durationMinutes: 'duration_minutes',
      content: 'content', materials: 'materials', assessmentConfig: 'assessment_config',
      positionId: 'position_id', competencyDimension: 'competency_dimension',
      isActive: 'is_active',
    };
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    for (const [bodyKey, col] of Object.entries(allowed)) {
      if (req.body[bodyKey] !== undefined) {
        let val = req.body[bodyKey];
        if (['content', 'materials', 'assessmentConfig'].includes(bodyKey)) val = JSON.stringify(val);
        fields.push(`${col} = $${idx++}`);
        values.push(val);
      }
    }
    if (fields.length === 0) { res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'No fields'}}); return; }
    fields.push('updated_at = now()');
    values.push(req.params.id);

    const row = await queryOne(`UPDATE training_courses SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    if (!row) { res.status(404).json({error: {code: 'NOT_FOUND', message: 'Course not found'}}); return; }
    res.json(row);
  } catch (e) { next(e); }
});

// DELETE /courses/:id (admin only)
router.delete('/courses/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const row = await queryOne(`DELETE FROM training_courses WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!row) { res.status(404).json({error: {code: 'NOT_FOUND', message: 'Course not found'}}); return; }
    res.json({deleted: true, id: row.id});
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════
// Enrollments
// ═══════════════════════════════════════════════════════════════════

// GET /enrollments — list with pagination + filters
router.get('/enrollments', async (req, res, next) => {
  try {
    const {candidateId, courseId, status, page = '1', pageSize = '50'} = req.query as Record<string, string>;
    const limit = Math.min(parseInt(pageSize, 10) || 50, 200);
    const offset = (parseInt(page, 10) - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (candidateId) { conditions.push(`te.candidate_id = $${params.length + 1}`); params.push(candidateId); }
    if (courseId) { conditions.push(`te.course_id = $${params.length + 1}`); params.push(courseId); }
    if (status) { conditions.push(`te.status = $${params.length + 1}`); params.push(status); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows, countResult] = await Promise.all([
      query(
        `SELECT te.*, tc.title AS course_title, tc.category AS course_category
         FROM training_enrollments te
         LEFT JOIN training_courses tc ON tc.id = te.course_id
         ${where} ORDER BY te.enrolled_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      queryOne(`SELECT COUNT(*)::int AS total FROM training_enrollments te ${where}`, params),
    ]);

    res.json({items: rows, total: countResult?.total ?? 0, page: parseInt(page, 10), pageSize: limit});
  } catch (e) { next(e); }
});

// POST /enrollments — enroll a candidate (admin, recruiter)
router.post('/enrollments', requireRole('admin', 'recruiter'), async (req, res, next) => {
  try {
    const {candidateId, candidateName, courseId, preInterviewScore, notes} = req.body;
    if (!candidateId || !candidateName || !courseId) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'candidateId, candidateName, courseId required'}});
      return;
    }

    // Get candidate's latest interview score if not provided
    let preScore = preInterviewScore ?? null;
    if (preScore === null) {
      const lastInterview = await queryOne(
        `SELECT total_score FROM interview_results WHERE candidate_id = $1 ORDER BY interview_date DESC LIMIT 1`,
        [candidateId],
      );
      preScore = lastInterview?.total_score ?? null;
    }

    const row = await queryOne(
      `INSERT INTO training_enrollments
        (candidate_id, candidate_name, course_id, pre_interview_score, notes)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (candidate_id, course_id) DO NOTHING
       RETURNING *`,
      [candidateId, candidateName, courseId, preScore, notes ?? null],
    );

    if (!row) {
      res.status(409).json({error: {code: 'DUPLICATE', message: 'Candidate already enrolled in this course'}});
      return;
    }
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// PATCH /enrollments/:id — update progress/status (admin, recruiter)
router.patch('/enrollments/:id', requireRole('admin', 'recruiter'), async (req, res, next) => {
  try {
    const allowed: Record<string, string> = {
      status: 'status', progressPct: 'progress_pct', finalScore: 'final_score',
      postInterviewScore: 'post_interview_score', notes: 'notes',
    };
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [bodyKey, col] of Object.entries(allowed)) {
      if (req.body[bodyKey] !== undefined) {
        fields.push(`${col} = $${idx++}`);
        values.push(req.body[bodyKey]);
      }
    }
    if (req.body.status === 'completed' || req.body.status === 'failed') {
      fields.push('completed_at = now()');
    }
    fields.push('updated_at = now()');
    values.push(req.params.id);

    const row = await queryOne(
      `UPDATE training_enrollments SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (!row) { res.status(404).json({error: {code: 'NOT_FOUND', message: 'Enrollment not found'}}); return; }
    res.json(row);
  } catch (e) { next(e); }
});

// DELETE /enrollments/:id (admin, recruiter)
router.delete('/enrollments/:id', requireRole('admin', 'recruiter'), async (req, res, next) => {
  try {
    const row = await queryOne(`DELETE FROM training_enrollments WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!row) { res.status(404).json({error: {code: 'NOT_FOUND', message: 'Enrollment not found'}}); return; }
    res.json({deleted: true, id: row.id});
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════
// Assessments
// ═══════════════════════════════════════════════════════════════════

// GET /enrollments/:id/assessments
router.get('/enrollments/:id/assessments', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT * FROM training_assessments WHERE enrollment_id = $1 ORDER BY created_at DESC`,
      [req.params.id],
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /enrollments/:id/assessments — submit assessment (admin, recruiter)
router.post('/enrollments/:id/assessments', requireRole('admin', 'recruiter'), async (req, res, next) => {
  try {
    const {id} = req.params;
    const {score, passed, answers, assessor, feedback} = req.body;

    if (score === undefined) { res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'score required'}}); return; }

    const enrollment = await queryOne(`SELECT * FROM training_enrollments WHERE id = $1`, [id]);
    if (!enrollment) { res.status(404).json({error: {code: 'NOT_FOUND', message: 'Enrollment not found'}}); return; }

    const row = await queryOne(
      `INSERT INTO training_assessments (enrollment_id, score, passed, answers, assessor, feedback)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        id, score, passed ?? (Number(score) >= 60),
        answers ? JSON.stringify(answers) : '[]',
        assessor ?? null, feedback ?? null,
      ],
    );

    // Update enrollment with final score and status
    await queryOne(
      `UPDATE training_enrollments
       SET final_score = $1, status = CASE WHEN $2 THEN 'completed' ELSE 'failed' END,
           completed_at = now(), updated_at = now()
       WHERE id = $3`,
      [score, passed ?? (Number(score) >= 60), id],
    );

    res.status(201).json(row);
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════
// Analytics
// ═══════════════════════════════════════════════════════════════════

// GET /analytics/weakness-analysis — aggregate interview weaknesses
router.get('/analytics/weakness-analysis', async (req, res, next) => {
  try {
    const {positionId} = req.query as Record<string, string>;

    // Get all low-scoring interview results (grade < B or total_score < 60)
    const conditions = ['ir.total_score < 60'];
    const params: unknown[] = [];
    if (positionId) {
      conditions.push(`c.position_id = $${params.length + 1}`);
      params.push(positionId);
    }

    const weakResults = await query(
      `SELECT ir.candidate_id, ir.total_score, ir.grade, ir.dimensions,
              c.name AS candidate_name, c.position_id
       FROM interview_results ir
       JOIN candidates c ON c.id = ir.candidate_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ir.interview_date DESC LIMIT 100`,
      params,
    );

    // Aggregate dimension weakness
    const dimensionStats: Record<string, {count: number; totalScore: number; candidates: string[]}> = {};

    for (const r of weakResults as Record<string, unknown>[]) {
      const dims = (r.dimensions ?? []) as {name: string; score: number}[];
      for (const d of dims) {
        if (d.score < 60) { // dimension score below 60 = weak
          if (!dimensionStats[d.name]) dimensionStats[d.name] = {count: 0, totalScore: 0, candidates: []};
          dimensionStats[d.name].count++;
          dimensionStats[d.name].totalScore += d.score;
          dimensionStats[d.name].candidates.push(r.candidate_name as string);
        }
      }
    }

    // Sort by frequency
    const weaknesses = Object.entries(dimensionStats)
      .map(([name, stat]) => ({
        dimension: name,
        frequency: stat.count,
        avgScore: Math.round((stat.totalScore / stat.count) * 100) / 100,
        affectedCandidates: stat.candidates.slice(0, 10),
      }))
      .sort((a, b) => b.frequency - a.frequency);

    res.json({
      totalAnalyzed: weakResults.length,
      weaknesses,
    });
  } catch (e) { next(e); }
});

// GET /analytics/training-effectiveness — before/after comparison
router.get('/analytics/training-effectiveness', async (req, res, next) => {
  try {
    const completed = await query(
      `SELECT te.pre_interview_score, te.post_interview_score, te.final_score,
              te.candidate_name, tc.title AS course_title, tc.category
       FROM training_enrollments te
       JOIN training_courses tc ON tc.id = te.course_id
       WHERE te.status IN ('completed', 'failed')
         AND te.pre_interview_score IS NOT NULL
       ORDER BY te.completed_at DESC LIMIT 100`,
    );

    let totalImprovement = 0;
    let improved = 0;
    const byCategory: Record<string, {count: number; avgPre: number; avgPost: number; improved: number}> = {};

    for (const r of completed as Record<string, unknown>[]) {
      const pre = Number(r.pre_interview_score);
      const post = Number(r.post_interview_score ?? r.final_score);
      const improvement = post - pre;
      totalImprovement += improvement;
      if (improvement > 0) improved++;

      const cat = r.category as string;
      if (!byCategory[cat]) byCategory[cat] = {count: 0, avgPre: 0, avgPost: 0, improved: 0};
      byCategory[cat].count++;
      byCategory[cat].avgPre += pre;
      byCategory[cat].avgPost += post;
      if (improvement > 0) byCategory[cat].improved++;
    }

    // Finalize averages
    for (const v of Object.values(byCategory)) {
      v.avgPre = v.count > 0 ? Math.round((v.avgPre / v.count) * 100) / 100 : 0;
      v.avgPost = v.count > 0 ? Math.round((v.avgPost / v.count) * 100) / 100 : 0;
    }

    res.json({
      totalCompleted: completed.length,
      avgImprovement: completed.length > 0 ? Math.round((totalImprovement / completed.length) * 100) / 100 : 0,
      improvementRate: completed.length > 0 ? Math.round((improved / completed.length) * 100) : 0,
      byCategory,
    });
  } catch (e) { next(e); }
});

// POST /analytics/recommend-courses — recommend courses for a candidate
router.post('/analytics/recommend-courses', async (req, res, next) => {
  try {
    const {candidateId} = req.body;
    if (!candidateId) { res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'candidateId required'}}); return; }

    // Get candidate's weak dimensions from interview results
    const weakDims = await query(
      `SELECT (dim->>'name') AS dimension, AVG((dim->>'score')::numeric) AS avg_score
       FROM interview_results ir, jsonb_array_elements(ir.dimensions) AS dim
       WHERE ir.candidate_id = $1 AND (dim->>'score')::numeric < 60
       GROUP BY (dim->>'name')
       ORDER BY avg_score ASC`,
      [candidateId],
    );

    const dimensions = (weakDims as Record<string, unknown>[]).map(r => r.dimension as string);

    if (dimensions.length === 0) {
      res.json({dimensions: [], recommendations: []});
      return;
    }

    // Find courses matching these dimensions
    const placeholders = dimensions.map((_, i) => `$${i + 1}`).join(', ');
    const courses = await query(
      `SELECT * FROM training_courses
       WHERE is_active = true
         AND (competency_dimension IN (${placeholders}) OR category IN (${placeholders}))
       ORDER BY difficulty, created_at DESC`,
      [...dimensions, ...dimensions],
    );

    res.json({
      dimensions,
      recommendations: courses,
    });
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════════════

// GET /export/enrollments — CSV export of enrollment records
router.get('/export/enrollments', requireRole('admin', 'recruiter'), async (req, res, next) => {
  try {
    const {status, courseId} = req.query as Record<string, string>;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) { conditions.push(`te.status = $${params.length + 1}`); params.push(status); }
    if (courseId) { conditions.push(`te.course_id = $${params.length + 1}`); params.push(courseId); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await query(
      `SELECT te.candidate_name, tc.title AS course_title, tc.category,
              te.status, te.progress_pct, te.pre_interview_score,
              te.final_score, te.post_interview_score,
              te.enrolled_at, te.completed_at
       FROM training_enrollments te
       LEFT JOIN training_courses tc ON tc.id = te.course_id
       ${where} ORDER BY te.enrolled_at DESC`,
      params,
    );

    const STATUS_MAP: Record<string, string> = {enrolled: '已报名', in_progress: '学习中', completed: '已完成', failed: '未通过'};
    const header = '学员姓名,课程名称,分类,状态,进度(%),培训前面试分,考核分,培训后面试分,报名时间,完成时间\n';
    const csvRows = (rows as Record<string, unknown>[]).map(r =>
      [
        r.candidate_name ?? '',
        r.course_title ?? '',
        r.category ?? '',
        STATUS_MAP[r.status as string] ?? r.status,
        r.progress_pct ?? 0,
        r.pre_interview_score ?? '',
        r.final_score ?? '',
        r.post_interview_score ?? '',
        r.enrolled_at ? new Date(r.enrolled_at as string).toLocaleDateString('zh-CN') : '',
        r.completed_at ? new Date(r.completed_at as string).toLocaleDateString('zh-CN') : '',
      ].join(','),
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=training-enrollments-${new Date().toISOString().slice(0, 10)}.csv`);
    // BOM for Excel UTF-8 compatibility
    res.send('\uFEFF' + header + csvRows);
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════
// Stats
// ═══════════════════════════════════════════════════════════════════

// GET /stats — training overview statistics
router.get('/stats', async (_req, res, next) => {
  try {
    const [totalCourses, activeEnrollments, completedEnrollments, failedEnrollments, avgScore] = await Promise.all([
      queryOne(`SELECT COUNT(*)::int AS total FROM training_courses WHERE is_active = true`),
      queryOne(`SELECT COUNT(*)::int AS total FROM training_enrollments WHERE status IN ('enrolled', 'in_progress')`),
      queryOne(`SELECT COUNT(*)::int AS total FROM training_enrollments WHERE status = 'completed'`),
      queryOne(`SELECT COUNT(*)::int AS total FROM training_enrollments WHERE status = 'failed'`),
      queryOne(`SELECT AVG(final_score)::numeric(5,2) AS avg FROM training_enrollments WHERE final_score IS NOT NULL`),
    ]);

    const totalDone = Number(completedEnrollments?.total ?? 0) + Number(failedEnrollments?.total ?? 0);
    const completionRate = totalDone > 0 ? Math.round((Number(completedEnrollments?.total ?? 0) / totalDone) * 100) : 0;

    res.json({
      totalCourses: totalCourses?.total ?? 0,
      activeEnrollments: activeEnrollments?.total ?? 0,
      completedEnrollments: completedEnrollments?.total ?? 0,
      failedEnrollments: failedEnrollments?.total ?? 0,
      completionRate,
      avgScore: avgScore?.avg ?? 0,
    });
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════
// Learning Paths CRUD
// ═══════════════════════════════════════════════════════════════════

// GET /paths — list learning paths
router.get('/paths', async (req, res, next) => {
  try {
    const {category, positionId, level} = req.query as Record<string, string>;
    const conditions: string[] = ['tp.is_active = true'];
    const params: unknown[] = [];

    if (category) { conditions.push(`tp.category = $${params.length + 1}`); params.push(category); }
    if (positionId) { conditions.push(`tp.position_id = $${params.length + 1}`); params.push(positionId); }
    if (level) { conditions.push(`tp.level = $${params.length + 1}`); params.push(level); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const paths = await query(
      `SELECT tp.*, COALESCE(ec.cnt, 0)::int AS enrolled_count
       FROM training_paths tp
       LEFT JOIN (
         SELECT path_id, COUNT(*) AS cnt FROM training_path_enrollments GROUP BY path_id
       ) ec ON ec.path_id = tp.id
       ${where} ORDER BY tp.created_at DESC`,
      params,
    );

    // Fetch courses for each path
    const pathIds = (paths as Record<string, unknown>[]).map(p => p.id as string);
    let coursesByPath: Record<string, Record<string, unknown>[]> = {};
    if (pathIds.length > 0) {
      const placeholders = pathIds.map((_, i) => `$${i + 1}`).join(',');
      const pcRows = await query(
        `SELECT tpc.*, tc.title, tc.category, tc.difficulty, tc.duration_minutes, tc.content, tc.materials
         FROM training_path_courses tpc
         JOIN training_courses tc ON tc.id = tpc.course_id
         WHERE tpc.path_id IN (${placeholders})
         ORDER BY tpc.sort_order`,
        pathIds,
      );
      for (const pc of pcRows as Record<string, unknown>[]) {
        const pid = pc.path_id as string;
        if (!coursesByPath[pid]) coursesByPath[pid] = [];
        coursesByPath[pid].push(pc);
      }
    }

    const items = (paths as Record<string, unknown>[]).map(p => ({
      ...p,
      courses: coursesByPath[p.id as string] ?? [],
      enrolledCount: Number(p.enrolled_count ?? 0),
    }));

    res.json({items, total: items.length});
  } catch (e) { next(e); }
});

// GET /paths/:id
router.get('/paths/:id', async (req, res, next) => {
  try {
    const p = await queryOne(
      `SELECT tp.*, COALESCE(ec.cnt, 0)::int AS enrolled_count
       FROM training_paths tp
       LEFT JOIN (
         SELECT path_id, COUNT(*) AS cnt FROM training_path_enrollments GROUP BY path_id
       ) ec ON ec.path_id = tp.id
       WHERE tp.id = $1`,
      [req.params.id],
    );
    if (!p) { res.status(404).json({error: {code: 'NOT_FOUND', message: 'Path not found'}}); return; }

    const courses = await query(
      `SELECT tpc.*, tc.title, tc.category, tc.difficulty, tc.duration_minutes
       FROM training_path_courses tpc
       JOIN training_courses tc ON tc.id = tpc.course_id
       WHERE tpc.path_id = $1 ORDER BY tpc.sort_order`,
      [req.params.id],
    );

    res.json({...p, courses, enrolledCount: Number(p.enrolled_count ?? 0)});
  } catch (e) { next(e); }
});

// POST /paths — create learning path (admin, recruiter)
router.post('/paths', requireRole('admin', 'recruiter'), async (req, res, next) => {
  try {
    const {title, description, category, level, isCertified, positionId, coverImageUrl, courseIds} = req.body;
    if (!title) { res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'title is required'}}); return; }

    const p = await queryOne(
      `INSERT INTO training_paths (title, description, category, level, is_certified, position_id, cover_image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [title, description ?? null, category ?? '综合', level ?? '初级', isCertified ?? false, positionId ?? null, coverImageUrl ?? null],
    );
    if (!p) { res.status(500).json({error: {code: 'INTERNAL_ERROR', message: 'Failed to create path'}}); return; }

    if (courseIds && Array.isArray(courseIds) && courseIds.length > 0) {
      const values: string[] = [];
      const params: unknown[] = [];
      courseIds.forEach((cid: string, i: number) => {
        params.push(p.id, cid, i + 1, true);
        values.push(`($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`);
      });
      await query(
        `INSERT INTO training_path_courses (path_id, course_id, sort_order, is_required) VALUES ${values.join(', ')}`,
        params,
      );
    }

    res.status(201).json({...p, courses: [], enrolledCount: 0});
  } catch (e) { next(e); }
});

// PATCH /paths/:id — update learning path (admin, recruiter)
router.patch('/paths/:id', requireRole('admin', 'recruiter'), async (req, res, next) => {
  try {
    const allowed: Record<string, string> = {
      title: 'title', description: 'description', category: 'category',
      level: 'level', isCertified: 'is_certified', isActive: 'is_active',
      coverImageUrl: 'cover_image_url',
    };
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    for (const [bodyKey, col] of Object.entries(allowed)) {
      if (req.body[bodyKey] !== undefined) {
        fields.push(`${col} = $${idx++}`);
        values.push(req.body[bodyKey]);
      }
    }

    if (fields.length === 0 && !req.body.courseIds) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'No fields'}}); return;
    }

    if (fields.length > 0) {
      fields.push('updated_at = now()');
      values.push(req.params.id);
      const updated = await queryOne(`UPDATE training_paths SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
      if (!updated) { res.status(404).json({error: {code: 'NOT_FOUND', message: 'Path not found'}}); return; }
    }

    // Update courses if provided
    if (req.body.courseIds && Array.isArray(req.body.courseIds)) {
      await query(`DELETE FROM training_path_courses WHERE path_id = $1`, [req.params.id]);
      if (req.body.courseIds.length > 0) {
        const values: string[] = [];
        const params: unknown[] = [];
        req.body.courseIds.forEach((cid: string, i: number) => {
          params.push(req.params.id, cid, i + 1, true);
          values.push(`($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`);
        });
        await query(
          `INSERT INTO training_path_courses (path_id, course_id, sort_order, is_required) VALUES ${values.join(', ')}`,
          params,
        );
      }
    }

    // Return updated path with courses
    const p = await queryOne('SELECT * FROM training_paths WHERE id = $1', [req.params.id]);
    const courses = await query(
      `SELECT tpc.*, tc.title, tc.category, tc.difficulty, tc.duration_minutes
       FROM training_path_courses tpc
       JOIN training_courses tc ON tc.id = tpc.course_id
       WHERE tpc.path_id = $1 ORDER BY tpc.sort_order`,
      [req.params.id],
    );
    const enrolledCount = await queryOne(
      `SELECT COUNT(*)::int AS cnt FROM training_path_enrollments WHERE path_id = $1`,
      [req.params.id],
    );

    res.json({...p, courses, enrolledCount: enrolledCount?.cnt ?? 0});
  } catch (e) { next(e); }
});

// DELETE /paths/:id (admin only)
router.delete('/paths/:id', requireRole('admin'), async (req, res, next) => {
  try {
    await query(`DELETE FROM training_path_courses WHERE path_id = $1`, [req.params.id]);
    await query(`DELETE FROM training_path_enrollments WHERE path_id = $1`, [req.params.id]);
    const row = await queryOne(`DELETE FROM training_paths WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!row) { res.status(404).json({error: {code: 'NOT_FOUND', message: 'Path not found'}}); return; }
    res.json({deleted: true, id: row.id});
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════
// Path Courses — add/remove courses from a path
// ═══════════════════════════════════════════════════════════════════

// POST /paths/:id/courses — add a course to path
router.post('/paths/:id/courses', requireRole('admin', 'recruiter'), async (req, res, next) => {
  try {
    const {courseId, sortOrder, isRequired} = req.body;
    if (!courseId) { res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'courseId is required'}}); return; }
    const maxOrder = await queryOne(
      `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM training_path_courses WHERE path_id = $1`,
      [req.params.id],
    );
    const order = sortOrder ?? (Number(maxOrder?.max_order ?? 0) + 1);
    const row = await queryOne(
      `INSERT INTO training_path_courses (path_id, course_id, sort_order, is_required)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, courseId, order, isRequired ?? true],
    );
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// DELETE /paths/:id/courses/:courseId — remove a course from path
router.delete('/paths/:id/courses/:courseId', requireRole('admin', 'recruiter'), async (req, res, next) => {
  try {
    const row = await queryOne(
      `DELETE FROM training_path_courses WHERE path_id = $1 AND course_id = $2 RETURNING id`,
      [req.params.id, req.params.courseId],
    );
    if (!row) { res.status(404).json({error: {code: 'NOT_FOUND', message: 'Course not in path'}}); return; }
    res.json({deleted: true});
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════
// Path Enrollments
// ═══════════════════════════════════════════════════════════════════

// GET /paths/:id/enrollments — list enrollments for a path
router.get('/paths/:id/enrollments', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT tpe.*, c.name AS candidate_name
       FROM training_path_enrollments tpe
       LEFT JOIN candidates c ON c.id = tpe.candidate_id
       WHERE tpe.path_id = $1 ORDER BY tpe.enrolled_at DESC`,
      [req.params.id],
    );
    res.json({items: rows, total: rows.length});
  } catch (e) { next(e); }
});

// POST /paths/:id/enrollments — enroll a candidate in a path (admin, recruiter)
router.post('/paths/:id/enrollments', requireRole('admin', 'recruiter'), async (req, res, next) => {
  try {
    const {candidateId} = req.body;
    if (!candidateId) { res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'candidateId is required'}}); return; }
    const row = await queryOne(
      `INSERT INTO training_path_enrollments (path_id, candidate_id)
       VALUES ($1,$2) ON CONFLICT (path_id, candidate_id) DO NOTHING RETURNING *`,
      [req.params.id, candidateId],
    );
    if (!row) {
      res.status(409).json({error: {code: 'DUPLICATE', message: 'Candidate already enrolled in this path'}});
      return;
    }
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// PATCH /paths/:id/enrollments/:enrollmentId — update enrollment (admin, recruiter)
router.patch('/paths/:id/enrollments/:enrollmentId', requireRole('admin', 'recruiter'), async (req, res, next) => {
  try {
    const {status, progressPct} = req.body;
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (status !== undefined) { fields.push(`status = $${idx++}`); values.push(status); }
    if (progressPct !== undefined) { fields.push(`progress_pct = $${idx++}`); values.push(progressPct); }
    if (status === 'completed' || status === 'failed') {
      fields.push('completed_at = now()');
    }
    if (fields.length === 0) { res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'No fields'}}); return; }

    values.push(req.params.enrollmentId);
    const row = await queryOne(
      `UPDATE training_path_enrollments SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (!row) { res.status(404).json({error: {code: 'NOT_FOUND', message: 'Enrollment not found'}}); return; }
    res.json(row);
  } catch (e) { next(e); }
});

// DELETE /paths/:id/enrollments/:enrollmentId — unenroll (admin, recruiter)
router.delete('/paths/:id/enrollments/:enrollmentId', requireRole('admin', 'recruiter'), async (req, res, next) => {
  try {
    const row = await queryOne(
      `DELETE FROM training_path_enrollments WHERE id = $1 AND path_id = $2 RETURNING id`,
      [req.params.enrollmentId, req.params.id],
    );
    if (!row) { res.status(404).json({error: {code: 'NOT_FOUND', message: 'Enrollment not found'}}); return; }
    res.json({deleted: true, id: row.id});
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════
// Materials Upload (dev-only — production uses Edge Function + Supabase Storage)
// ═══════════════════════════════════════════════════════════════════

// POST /materials/upload
router.post('/materials/upload', requireRole('admin', 'recruiter'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) { res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'file is required'}}); return; }
    const ext = path.extname(req.file.originalname);
    const filename = `materials/${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`;
    const destPath = path.join(uploadsDir, path.basename(filename));

    // Rename temp file to clean name
    fs.renameSync(req.file.path, destPath);

    const url = `/uploads/training-materials/${path.basename(filename)}`;
    res.status(201).json({url, filename: req.file.originalname});
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════
// Batch Enrollment
// ═══════════════════════════════════════════════════════════════════

// POST /enrollments/batch — batch enroll candidates (admin, recruiter)
router.post('/enrollments/batch', requireRole('admin', 'recruiter'), async (req, res, next) => {
  try {
    const {candidateIds, courseId, pathId} = req.body;
    if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'candidateIds array is required'}}); return;
    }
    if (!courseId && !pathId) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'courseId or pathId is required'}}); return;
    }

    const placeholders = candidateIds.map((_: string, i: number) => `$${i + 1}`).join(',');
    const candidates = await query(
      `SELECT id, name FROM candidates WHERE id IN (${placeholders})`,
      candidateIds,
    );
    const candidateMap = new Map((candidates as Record<string, unknown>[]).map(c => [c.id, c.name]));

    const enrolled: {candidateId: string; candidateName: string}[] = [];
    const skipped: {candidateId: string; reason: string}[] = [];

    for (const cid of candidateIds) {
      const name = candidateMap.get(cid) as string | undefined;
      if (!name) { skipped.push({candidateId: cid, reason: 'Candidate not found'}); continue; }

      try {
        if (pathId) {
          await query(
            `INSERT INTO training_path_enrollments (path_id, candidate_id) VALUES ($1,$2)`,
            [pathId, cid],
          );
        } else {
          await query(
            `INSERT INTO training_enrollments (candidate_id, candidate_name, course_id) VALUES ($1,$2,$3)
             ON CONFLICT (candidate_id, course_id) DO NOTHING`,
            [cid, name, courseId],
          );
        }
        enrolled.push({candidateId: cid, candidateName: name});
      } catch (err: unknown) {
        const code = (err as Record<string, string>)?.code;
        if (code === '23505') {
          skipped.push({candidateId: cid, reason: 'Already enrolled'});
        } else {
          skipped.push({candidateId: cid, reason: (err as Error).message});
        }
      }
    }

    res.status(201).json({enrolled, skipped, total: candidateIds.length});
  } catch (e) { next(e); }
});

export default router;
