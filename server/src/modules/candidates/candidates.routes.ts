import {Router} from 'express';
import {query, queryOne} from '../../config/database.js';
import {validateUuidParams} from '../../middleware/validateParams.js';

const router = Router();

// GET / — list candidates with tags
// Mounted at /api/candidates and /api/talent-pool
// Only returns candidates that have an uploaded resume file (original_file_name IS NOT NULL)
// to exclude seed fixture data
router.get('/', async (req, res, next) => {
  try {
    const {search} = req.query as Record<string, string>;
    let sql: string;
    let params: unknown[] = [];

    if (search) {
      sql = `SELECT c.*,
              COALESCE(
                json_agg(DISTINCT ct.tag) FILTER (WHERE ct.tag IS NOT NULL),
                '[]'::json
              ) AS tags,
              p.name AS position_name,
              pr.name AS project_name
       FROM candidates c
       LEFT JOIN candidate_tags ct ON c.id = ct.candidate_id
       LEFT JOIN positions p ON c.position_id = p.id
       LEFT JOIN projects pr ON c.project_id = pr.id
       WHERE c.original_file_name IS NOT NULL
         AND (c.name ILIKE $1 OR c.email ILIKE $1 OR c.phone ILIKE $1)
       GROUP BY c.id, p.name, pr.name
       ORDER BY c.created_at DESC`;
      params = [`%${search}%`];
    } else {
      sql = `SELECT c.*,
              COALESCE(
                json_agg(DISTINCT ct.tag) FILTER (WHERE ct.tag IS NOT NULL),
                '[]'::json
              ) AS tags,
              p.name AS position_name,
              pr.name AS project_name
       FROM candidates c
       LEFT JOIN candidate_tags ct ON c.id = ct.candidate_id
       LEFT JOIN positions p ON c.position_id = p.id
       LEFT JOIN projects pr ON c.project_id = pr.id
       WHERE c.original_file_name IS NOT NULL
       GROUP BY c.id, p.name, pr.name
       ORDER BY c.created_at DESC`;
    }

    const rows = await query(sql, params);
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /search — search candidates with filters
router.get('/search', async (req, res, next) => {
  try {
    const {keyword, positionId, grades, sort, page = '1', pageSize = '20'} = req.query as Record<string, string>;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (keyword) {
      conditions.push(`(c.name ILIKE $${idx} OR c.email ILIKE $${idx})`);
      params.push(`%${keyword}%`);
      idx++;
    }

    if (positionId) {
      conditions.push(`c.position_id = $${idx}`);
      params.push(positionId);
      idx++;
    }

    if (grades) {
      const gradeList = (grades as string).split(',').map((g) => g.trim());
      conditions.push(`c.grade = ANY($${idx})`);
      params.push(gradeList);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE c.original_file_name IS NOT NULL AND ${conditions.join(' AND ')}` : 'WHERE c.original_file_name IS NOT NULL';

    let orderBy = 'c.created_at DESC';
    if (sort === 'score_desc') orderBy = 'c.score_total DESC NULLS LAST';
    else if (sort === 'score_asc') orderBy = 'c.score_total ASC NULLS LAST';
    else if (sort === 'name_asc') orderBy = 'c.name ASC';
    else if (sort === 'name_desc') orderBy = 'c.name DESC';

    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);

    const rows = await query(
      `SELECT c.*,
              COALESCE(
                json_agg(DISTINCT ct.tag) FILTER (WHERE ct.tag IS NOT NULL),
                '[]'::json
              ) AS tags,
              p.name AS position_name,
              pr.name AS project_name
       FROM candidates c
       LEFT JOIN candidate_tags ct ON c.id = ct.candidate_id
       LEFT JOIN positions p ON c.position_id = p.id
       LEFT JOIN projects pr ON c.project_id = pr.id
       ${whereClause}
       GROUP BY c.id, p.name, pr.name
       ORDER BY ${orderBy}
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, parseInt(pageSize, 10), offset],
    );

    const countResult = await queryOne(
      `SELECT COUNT(*)::int AS total FROM candidates c ${whereClause}`,
      params,
    );

    res.json({
      items: rows,
      total: countResult?.total ?? 0,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
    });
  } catch (e) { next(e); }
});

// GET /stats — talent stats (MUST be before /:id to avoid matching "stats" as an ID)
router.get('/stats', async (req, res, next) => {
  try {
    const [totalResult, monthlyResult, gradeResult] = await Promise.all([
      queryOne(`SELECT COUNT(*)::int AS "totalCount" FROM candidates WHERE original_file_name IS NOT NULL`),
      queryOne(
        `SELECT COUNT(*)::int AS "monthlyNew"
         FROM candidates
         WHERE original_file_name IS NOT NULL
           AND created_at >= now() - INTERVAL '30 days'`,
      ),
      query(
        `SELECT grade, COUNT(*)::int AS count
         FROM candidates
         WHERE original_file_name IS NOT NULL
           AND grade IS NOT NULL
         GROUP BY grade
         ORDER BY grade`,
      ),
    ]);

    const gradeDistribution: Record<string, number> = {};
    for (const r of gradeResult) {
      gradeDistribution[r.grade as string] = r.count as number;
    }

    res.json({
      totalCount: totalResult?.totalCount ?? 0,
      monthlyNew: monthlyResult?.monthlyNew ?? 0,
      gradeDistribution,
    });
  } catch (e) { next(e); }
});

// GET /export/csv — export candidates as CSV
router.get('/export/csv', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT c.name, c.email, c.phone, c.resume_score, c.grade, c.source,
              COALESCE(
                json_agg(DISTINCT ct.tag) FILTER (WHERE ct.tag IS NOT NULL),
                '[]'::json
              ) AS tags,
              p.name AS position_name,
              pr.name AS project_name,
              c.created_at
       FROM candidates c
       LEFT JOIN candidate_tags ct ON c.id = ct.candidate_id
       LEFT JOIN positions p ON c.position_id = p.id
       LEFT JOIN projects pr ON c.project_id = pr.id
       WHERE c.original_file_name IS NOT NULL
       GROUP BY c.id, p.name, pr.name
       ORDER BY c.created_at DESC`,
    );

    const escCsv = (v: unknown): string => {
      const s = v == null ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const header = ['姓名', '邮箱', '电话', '简历评分', '等级', '来源', '标签', '岗位', '项目', '创建时间'];
    const lines = rows.map((r: Record<string, unknown>) =>
      [r.name, r.email, r.phone, r.resume_score, r.grade, r.source,
       Array.isArray(r.tags) ? r.tags.join('; ') : '',
       r.position_name, r.project_name,
       r.created_at ? new Date(r.created_at as string).toLocaleDateString('zh-CN') : ''
      ].map(escCsv).join(','),
    );

    const csv = '\uFEFF' + [header.map(escCsv).join(','), ...lines].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=candidates.csv');
    res.send(csv);
  } catch (e) { next(e); }
});

// GET /:id — single candidate with tags
router.get('/:id', validateUuidParams('id'), async (req, res, next) => {
  try {
    const {id} = req.params;
    const row = await queryOne(
      `SELECT c.*,
              COALESCE(
                json_agg(DISTINCT ct.tag) FILTER (WHERE ct.tag IS NOT NULL),
                '[]'::json
              ) AS tags,
              p.name AS position_name,
              pr.name AS project_name
       FROM candidates c
       LEFT JOIN candidate_tags ct ON c.id = ct.candidate_id
       LEFT JOIN positions p ON c.position_id = p.id
       LEFT JOIN projects pr ON c.project_id = pr.id
       WHERE c.id = $1
       GROUP BY c.id, p.name, pr.name`,
      [id],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Candidate (${id}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// POST /import — handle candidate import with deduplication
// Note: multipart file upload handling with multer is expected at the app level
router.post('/import', async (req, res, next) => {
  try {
    const {name, email, phone, location, source, projectId, positionId, parsed_info, grade, score_total, original_file_base64, original_file_name} = req.body;
    if (!name) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Candidate name is required'}});
      return;
    }

    // Check for duplicate: match by email first, then by name+phone
    let existing: Record<string, unknown> | null = null;
    if (email) {
      existing = await queryOne(
        `SELECT * FROM candidates WHERE email = $1 LIMIT 1`,
        [email],
      );
    }
    if (!existing && phone) {
      existing = await queryOne(
        `SELECT * FROM candidates WHERE name = $1 AND phone = $2 LIMIT 1`,
        [name, phone],
      );
    }

    if (existing) {
      // Duplicate found — update the existing record with latest data
      const updated = await queryOne(
        `UPDATE candidates
         SET name = $1, email = $2, phone = $3, location = $4, source = $5,
             project_id = $6, position_id = $7, parsed_info = $8,
             grade = $9, score_total = $10,
             original_file_base64 = COALESCE($11, original_file_base64),
             original_file_name = COALESCE($12, original_file_name)
         WHERE id = $13
         RETURNING *`,
        [
          name,
          email ?? null,
          phone ?? null,
          location ?? null,
          source ?? null,
          projectId ?? null,
          positionId ?? null,
          parsed_info ? JSON.stringify(parsed_info) : null,
          grade ?? null,
          score_total ?? null,
          original_file_base64 ?? null,
          original_file_name ?? null,
          existing.id,
        ],
      );
      res.status(200).json({...updated, duplicate: true, replaced: true});
      return;
    }

    // No duplicate — insert new
    const row = await queryOne(
      `INSERT INTO candidates (name, email, phone, location, source, project_id, position_id, parsed_info, grade, score_total, original_file_base64, original_file_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        name,
        email ?? null,
        phone ?? null,
        location ?? null,
        source ?? null,
        projectId ?? null,
        positionId ?? null,
        parsed_info ? JSON.stringify(parsed_info) : null,
        grade ?? null,
        score_total ?? null,
        original_file_base64 ?? null,
        original_file_name ?? null,
      ],
    );
    res.status(201).json({...row, duplicate: false});
  } catch (e) { next(e); }
});

// DELETE /:id — delete a candidate
router.delete('/:id', validateUuidParams('id'), async (req, res, next) => {
  try {
    const {id} = req.params;

    // Delete dependent records first (tables without ON DELETE CASCADE)
    await query(`DELETE FROM candidate_tags WHERE candidate_id = $1`, [id]);
    await query(`DELETE FROM interview_answer_scores WHERE session_id IN (SELECT id FROM interview_sessions WHERE candidate_id = $1)`, [id]);
    await query(`DELETE FROM interview_results WHERE candidate_id = $1`, [id]);
    await query(`DELETE FROM interview_sessions WHERE candidate_id = $1`, [id]);
    await query(`DELETE FROM approval_requests WHERE candidate_id = $1`, [id]);
    await query(`DELETE FROM shortlist_entries WHERE candidate_id = $1`, [id]);
    await query(`DELETE FROM outreach_records WHERE candidate_id = $1`, [id]);
    await query(`DELETE FROM contacts WHERE candidate_id = $1`, [id]);

    const result = await queryOne(`DELETE FROM candidates WHERE id = $1 RETURNING id`, [id]);
    if (!result) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Candidate (${id}) not found`}});
      return;
    }
    res.json({success: true, deleted: id});
  } catch (e) { next(e); }
});

// POST /:id/delete — fallback delete via POST (for environments where DELETE method is blocked)
router.post('/:id/delete', validateUuidParams('id'), async (req, res, next) => {
  try {
    const {id} = req.params;

    // Delete dependent records first (tables without ON DELETE CASCADE)
    await query(`DELETE FROM candidate_tags WHERE candidate_id = $1`, [id]);
    await query(`DELETE FROM interview_answer_scores WHERE session_id IN (SELECT id FROM interview_sessions WHERE candidate_id = $1)`, [id]);
    await query(`DELETE FROM interview_results WHERE candidate_id = $1`, [id]);
    await query(`DELETE FROM interview_sessions WHERE candidate_id = $1`, [id]);
    await query(`DELETE FROM approval_requests WHERE candidate_id = $1`, [id]);
    await query(`DELETE FROM shortlist_entries WHERE candidate_id = $1`, [id]);
    await query(`DELETE FROM outreach_records WHERE candidate_id = $1`, [id]);
    await query(`DELETE FROM contacts WHERE candidate_id = $1`, [id]);

    const result = await queryOne(`DELETE FROM candidates WHERE id = $1 RETURNING id`, [id]);
    if (!result) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Candidate (${id}) not found`}});
      return;
    }
    res.json({success: true, deleted: id});
  } catch (e) { next(e); }
});

// POST /:id/tags — replace candidate tags
router.post('/:id/tags', validateUuidParams('id'), async (req, res, next) => {
  try {
    const {id} = req.params;
    const {tags} = req.body;
    if (!Array.isArray(tags)) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'tags must be an array'}});
      return;
    }

    await query(`DELETE FROM candidate_tags WHERE candidate_id = $1`, [id]);

    if (tags.length > 0) {
      const values = tags.map((tag: string, i: number) => `($1, $${i + 2})`).join(', ');
      await query(
        `INSERT INTO candidate_tags (candidate_id, tag) VALUES ${values}`,
        [id, ...tags],
      );
    }

    const updatedTags = await query(
      `SELECT tag FROM candidate_tags WHERE candidate_id = $1 ORDER BY tag`,
      [id],
    );
    res.json(updatedTags.map((r) => r.tag));
  } catch (e) { next(e); }
});

export default router;
