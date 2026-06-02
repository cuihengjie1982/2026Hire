import {Router} from 'express';
import {query, queryOne, transaction} from '../../config/database.js';
import multer from 'multer';

const router = Router();
const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: 10 * 1024 * 1024}});

// Predefined column name mapping (Chinese/English → employee_profiles columns)
const COLUMN_MAP: Record<string, {column: string; jsonb?: boolean}> = {
  '姓名': {column: 'name'}, '名字': {column: 'name'}, 'name': {column: 'name'},
  '邮箱': {column: 'email'}, 'email': {column: 'email'},
  '电话': {column: 'phone'}, '手机': {column: 'phone'}, 'phone': {column: 'phone'},
  '部门': {column: 'department'}, 'department': {column: 'department'},
  '主管': {column: 'manager'}, '经理': {column: 'manager'}, 'manager': {column: 'manager'},
  '学历': {column: 'education'}, 'education': {column: 'education'},
  '专业': {column: 'major'}, 'major': {column: 'major'},
  '入职日期': {column: 'hire_date'}, 'hire_date': {column: 'hire_date'},
  '状态': {column: 'status'}, 'status': {column: 'status'},
  '职位': {column: 'position_id'}, 'position': {column: 'position_id'},
  '项目': {column: 'project_id'}, 'project': {column: 'project_id'},
  '通勤距离': {column: 'commute_distance'}, 'commute_distance': {column: 'commute_distance'},
  '家庭情况': {column: 'family_status'}, 'family_status': {column: 'family_status'},
};

// ═══════════════════════════════════════════════════════════════════
// Field labels for version history (Chinese display names)
// ═══════════════════════════════════════════════════════════════════
const FIELD_LABELS: Record<string, string> = {
  name: '姓名', email: '邮箱', phone: '电话',
  status: '在职状态', hireDate: '入职日期', terminationDate: '离职日期',
  terminationReason: '离职原因',
  projectId: '项目', positionId: '职位',
  department: '部门', manager: '主管',
  education: '学历', major: '专业',
  certifications: '证书', skills: '技能', personality: '性格测评',
  commuteDistance: '通勤距离', familyStatus: '家庭情况',
  interviewScore: '面试分数', interviewGrade: '面试等级',
  interviewWeaknesses: '面试薄弱点',
  avgPerformance: '平均绩效', trainingScore: '培训分数',
};

/**
 * Record field-level changes into employee_profile_history.
 * Called inside a transaction after reading the "before" row.
 */
async function recordProfileChanges(
  employeeId: string,
  beforeRow: Record<string, unknown>,
  updates: Record<string, unknown>,
  allowedFields: Record<string, string>,
  userId?: string,
  userEmail?: string,
): Promise<void> {
  const historyEntries: Array<[string, string, string, string]> = []; // [field_name, field_label, old_val, new_val]

  for (const [bodyKey, colName] of Object.entries(allowedFields)) {
    if (updates[bodyKey] === undefined) continue;

    let oldVal: string | null;
    let newVal: string | null;

    // JSONB fields: serialize for comparison
    const jsonbFields = ['certifications', 'skills', 'personality', 'interview_weaknesses'];
    if (jsonbFields.includes(bodyKey)) {
      oldVal = beforeRow[colName] ? JSON.stringify(beforeRow[colName]) : null;
      newVal = JSON.stringify(updates[bodyKey]);
    } else {
      oldVal = beforeRow[colName] != null ? String(beforeRow[colName]) : null;
      newVal = updates[bodyKey] != null ? String(updates[bodyKey]) : null;
    }

    if (oldVal !== newVal) {
      historyEntries.push([bodyKey, FIELD_LABELS[bodyKey] ?? bodyKey, oldVal ?? '', newVal ?? '']);
    }
  }

  if (historyEntries.length === 0) return;

  // Build batch INSERT
  const snapshot = JSON.stringify(beforeRow);
  const placeholders: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  for (const [fieldName, fieldLabel, oldVal, newVal] of historyEntries) {
    placeholders.push(
      `($${idx},$${idx + 1},$${idx + 2},$${idx + 3},$${idx + 4},$${idx + 5},$${idx + 6},$${idx + 7},$${idx + 8})`,
    );
    params.push(
      employeeId, 'update',
      fieldName, oldVal, newVal, fieldLabel,
      userId ?? null, userEmail ?? null,
      snapshot,
    );
    idx += 9;
  }

  await query(
    `INSERT INTO employee_profile_history
      (employee_id, action, field_name, old_value, new_value, field_label, changed_by, changed_by_email, snapshot)
     VALUES ${placeholders.join(', ')}`,
    params,
  );
}

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

// GET /:id/history — version history for an employee profile
router.get('/:id/history', async (req, res, next) => {
  try {
    const {id} = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);
    const offset = (page - 1) * pageSize;

    // Verify employee exists
    const emp = await queryOne(`SELECT id FROM employee_profiles WHERE id = $1`, [id]);
    if (!emp) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Employee (${id}) not found`}});
      return;
    }

    const [rows, countResult] = await Promise.all([
      query(
        `SELECT id, employee_id, action, field_name, old_value, new_value,
                field_label, changed_by, changed_by_email, changed_at
         FROM employee_profile_history
         WHERE employee_id = $1
         ORDER BY changed_at DESC
         LIMIT $2 OFFSET $3`,
        [id, pageSize, offset],
      ),
      queryOne(
        `SELECT COUNT(*)::int AS total FROM employee_profile_history WHERE employee_id = $1`,
        [id],
      ),
    ]);

    res.json({
      items: rows,
      total: countResult?.total ?? 0,
      page,
      pageSize,
    });
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

    // Record creation in history
    if (row) {
      await query(
        `INSERT INTO employee_profile_history
          (employee_id, action, field_label, snapshot, changed_by, changed_by_email)
         VALUES ($1, 'create', '创建员工档案', $2, $3, $4)`,
        [
          (row as Record<string, unknown>).id,
          JSON.stringify(row),
          (req as any).user?.userId ?? null,
          (req as any).user?.email ?? null,
        ],
      );
    }

    res.status(201).json(row);
  } catch (e) { next(e); }
});

// PATCH /:id — update employee profile (with version history tracking)
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

    // Read current row before updating (for version history)
    const beforeRow = await queryOne(`SELECT * FROM employee_profiles WHERE id = $1`, [id]);
    if (!beforeRow) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Employee profile (${id}) not found`}});
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

    // Record field-level changes in history
    await recordProfileChanges(
      id,
      beforeRow as Record<string, unknown>,
      updates,
      allowedFields,
      (req as any).user?.userId,
      (req as any).user?.email,
    );

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
// Custom Field Definitions
// ═══════════════════════════════════════════════════════════════════

// GET /custom-fields — list all custom field definitions
router.get('/custom-fields', async (_req, res, next) => {
  try {
    const rows = await query(
      `SELECT * FROM employee_custom_field_defs WHERE is_active = true ORDER BY sort_order, created_at`,
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /custom-fields — create custom field definition
router.post('/custom-fields', async (req, res, next) => {
  try {
    const {fieldKey, fieldLabel, fieldType, options, source} = req.body;
    if (!fieldKey || !fieldLabel) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'fieldKey and fieldLabel are required'}});
      return;
    }

    const row = await queryOne(
      `INSERT INTO employee_custom_field_defs (field_key, field_label, field_type, options, source)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (field_key) DO UPDATE SET field_label = $2, field_type = $3, options = $4, is_active = true, updated_at = now()
       RETURNING *`,
      [
        fieldKey, fieldLabel, fieldType ?? 'text',
        options ? JSON.stringify(options) : '[]',
        source ?? 'manual',
      ],
    );
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// PATCH /custom-fields/:id — update custom field definition
router.patch('/custom-fields/:id', async (req, res, next) => {
  try {
    const {id} = req.params;
    const {fieldLabel, fieldType, options, isActive, sortOrder} = req.body;

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (fieldLabel !== undefined) { fields.push(`field_label = $${idx++}`); values.push(fieldLabel); }
    if (fieldType !== undefined) { fields.push(`field_type = $${idx++}`); values.push(fieldType); }
    if (options !== undefined) { fields.push(`options = $${idx++}`); values.push(JSON.stringify(options)); }
    if (isActive !== undefined) { fields.push(`is_active = $${idx++}`); values.push(isActive); }
    if (sortOrder !== undefined) { fields.push(`sort_order = $${idx++}`); values.push(sortOrder); }
    fields.push(`updated_at = now()`);

    values.push(id);
    const row = await queryOne(
      `UPDATE employee_custom_field_defs SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Custom field (${id}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// DELETE /custom-fields/:id — soft delete (set is_active = false)
router.delete('/custom-fields/:id', async (req, res, next) => {
  try {
    const row = await queryOne(
      `UPDATE employee_custom_field_defs SET is_active = false, updated_at = now() WHERE id = $1 RETURNING id`,
      [req.params.id],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Custom field (${req.params.id}) not found`}});
      return;
    }
    res.json({deleted: true, id: row.id});
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════
// Custom Field Values (nested under employee)
// ═══════════════════════════════════════════════════════════════════

// GET /:id/custom-values — get all custom field values for an employee
router.get('/:id/custom-values', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT cfv.*, cfd.field_key, cfd.field_label, cfd.field_type
       FROM employee_custom_field_values cfv
       JOIN employee_custom_field_defs cfd ON cfd.id = cfv.field_id
       WHERE cfv.employee_id = $1 AND cfd.is_active = true
       ORDER BY cfd.sort_order`,
      [req.params.id],
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// PATCH /:id/custom-values — batch update custom field values
router.patch('/:id/custom-values', async (req, res, next) => {
  try {
    const {id} = req.params;
    const {values} = req.body as {values: Array<{fieldId: string; value: unknown}>};

    if (!Array.isArray(values) || values.length === 0) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'values array is required'}});
      return;
    }

    // Verify employee exists
    const emp = await queryOne(`SELECT id FROM employee_profiles WHERE id = $1`, [id]);
    if (!emp) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Employee (${id}) not found`}});
      return;
    }

    // For each value, determine which column to store in based on field type
    for (const item of values) {
      const fieldDef = await queryOne(
        `SELECT id, field_type FROM employee_custom_field_defs WHERE id = $1`,
        [item.fieldId],
      );
      if (!fieldDef) continue;

      const ft = fieldDef.field_type as string;
      const val = item.value;

      const valueText = (ft === 'text' || ft === 'select') ? String(val ?? '') : null;
      const valueNum = (ft === 'number') ? (val != null ? Number(val) : null) : null;
      const valueDate = (ft === 'date') ? (val ? String(val) : null) : null;
      const valueJson = (ft === 'multiselect' || ft === 'boolean') ? JSON.stringify(val) : null;

      await queryOne(
        `INSERT INTO employee_custom_field_values (employee_id, field_id, value_text, value_num, value_date, value_json)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (employee_id, field_id) DO UPDATE SET
           value_text = EXCLUDED.value_text,
           value_num = EXCLUDED.value_num,
           value_date = EXCLUDED.value_date,
           value_json = EXCLUDED.value_json,
           updated_at = now()
         RETURNING *`,
        [id, item.fieldId, valueText, valueNum, valueDate, valueJson],
      );
    }

    // Return updated values
    const rows = await query(
      `SELECT cfv.*, cfd.field_key, cfd.field_label, cfd.field_type
       FROM employee_custom_field_values cfv
       JOIN employee_custom_field_defs cfd ON cfd.id = cfv.field_id
       WHERE cfv.employee_id = $1 AND cfd.is_active = true
       ORDER BY cfd.sort_order`,
      [id],
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════
// Excel Import / Export
// ═══════════════════════════════════════════════════════════════════

// POST /import/excel — upload and process Excel file
router.post('/import/excel', upload.single('file'), async (req, res, next) => {
  try {
    const XLSX = await import('xlsx');
    const file = req.file;
    if (!file) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'No file uploaded'}});
      return;
    }

    const workbook = XLSX.read(file.buffer, {type: 'buffer'});
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {defval: ''});

    if (rows.length === 0) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Excel file is empty'}});
      return;
    }

    const headers = Object.keys(rows[0]);
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{row: number; message: string}> = [];
    const newFields: Array<{fieldKey: string; fieldLabel: string}> = [];

    // Build header mapping: map each column header to a known column or new custom field
    const headerMapping: Array<{header: string; target: 'builtin' | 'custom'; column?: string}> = [];
    for (const header of headers) {
      const mapped = COLUMN_MAP[header.trim()];
      if (mapped) {
        headerMapping.push({header, target: 'builtin', column: mapped.column});
      } else {
        // Check if matches an existing custom field
        const existingField = await queryOne(
          `SELECT id, field_key FROM employee_custom_field_defs WHERE field_label = $1 AND is_active = true`,
          [header.trim()],
        );
        if (existingField) {
          headerMapping.push({header, target: 'custom', column: (existingField as Record<string, unknown>).id as string});
        } else {
          // Will create new custom field
          headerMapping.push({header, target: 'custom', column: '__new__'});
        }
      }
    }

    // Create new custom fields for unmapped headers
    for (const mapping of headerMapping) {
      if (mapping.target === 'custom' && mapping.column === '__new__') {
        const fieldKey = mapping.header.trim().replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').toLowerCase().slice(0, 100);
        const row = await queryOne(
          `INSERT INTO employee_custom_field_defs (field_key, field_label, field_type, source)
           VALUES ($1, $2, 'text', 'excel_import')
           ON CONFLICT (field_key) DO UPDATE SET is_active = true, updated_at = now()
           RETURNING id`,
          [fieldKey, mapping.header.trim()],
        );
        mapping.column = (row as Record<string, unknown>).id as string;
        newFields.push({fieldKey, fieldLabel: mapping.header.trim()});
      }
    }

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = String(row['姓名'] ?? row['name'] ?? row['名字'] ?? '').trim();
      const email = String(row['邮箱'] ?? row['email'] ?? '').trim();

      if (!name && !email) {
        skipped++;
        errors.push({row: i + 2, message: '姓名和邮箱都为空'});
        continue;
      }

      // Try to find existing employee by name or email
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (name) { conditions.push(`name = $${params.length + 1}`); params.push(name); }
      if (email) { conditions.push(`email = $${params.length + 1}`); params.push(email); }

      const existing = await queryOne(
        `SELECT id FROM employee_profiles WHERE ${conditions.join(' OR ')}`,
        params,
      );

      if (existing) {
        // Update existing employee
        const empId = (existing as Record<string, unknown>).id as string;
        const setClauses: string[] = [];
        const setValues: unknown[] = [];
        let idx = 1;

        for (const mapping of headerMapping) {
          if (mapping.target !== 'builtin' || !mapping.column) continue;
          const val = row[mapping.header];
          if (val === undefined || val === '') continue;
          setClauses.push(`${mapping.column} = $${idx++}`);
          setValues.push(String(val));
        }

        if (setClauses.length > 0) {
          setClauses.push('updated_at = now()');
          setValues.push(empId);
          await queryOne(
            `UPDATE employee_profiles SET ${setClauses.join(', ')} WHERE id = $${idx}`,
            setValues,
          );
        }

        // Update custom field values
        for (const mapping of headerMapping) {
          if (mapping.target !== 'custom' || !mapping.column || mapping.column === '__new__') continue;
          const val = row[mapping.header];
          if (val === undefined || val === '') continue;
          await queryOne(
            `INSERT INTO employee_custom_field_values (employee_id, field_id, value_text)
             VALUES ($1, $2, $3)
             ON CONFLICT (employee_id, field_id) DO UPDATE SET value_text = EXCLUDED.value_text, updated_at = now()`,
            [empId, mapping.column, String(val)],
          );
        }
        updated++;
      } else {
        // Cannot create without candidate_id — skip
        skipped++;
        errors.push({row: i + 2, message: `未找到匹配的员工记录 (${name || email})`});
      }
    }

    res.json({total: rows.length, created, updated, skipped, errors, newFields});
  } catch (e) { next(e); }
});

// GET /export/excel — export all employees to Excel
router.get('/export/excel', async (_req, res, next) => {
  try {
    const XLSX = await import('xlsx');

    const employees = await query(
      `SELECT ep.* FROM employee_profiles ep ORDER BY ep.created_at DESC`,
    );

    // Get custom field definitions
    const customFields = await query(
      `SELECT id, field_key, field_label FROM employee_custom_field_defs WHERE is_active = true ORDER BY sort_order`,
    );

    // Header row
    const headers = ['姓名', '邮箱', '电话', '部门', '主管', '学历', '专业', '入职日期', '状态', '面试分数', '面试等级', '平均绩效', '培训分数'];
    const customHeaders = (customFields as Record<string, unknown>[]).map(f => f.field_label as string);
    const allHeaders = [...headers, ...customHeaders];

    const data = (employees as Record<string, unknown>[]).map(emp => {
      const row: Record<string, unknown> = {
        '姓名': emp.name,
        '邮箱': emp.email,
        '电话': emp.phone,
        '部门': emp.department,
        '主管': emp.manager,
        '学历': emp.education,
        '专业': emp.major,
        '入职日期': emp.hire_date ? String(emp.hire_date).slice(0, 10) : '',
        '状态': emp.status,
        '面试分数': emp.interview_score,
        '面试等级': emp.interview_grade,
        '平均绩效': emp.avg_performance,
        '培训分数': emp.training_score,
      };
      return row;
    });

    // Add custom field values
    for (let i = 0; i < data.length; i++) {
      const empId = (employees as Record<string, unknown>[])[i].id;
      const customValues = await query(
        `SELECT cfv.field_id, cfv.value_text, cfv.value_num, cfv.value_date
         FROM employee_custom_field_values cfv
         JOIN employee_custom_field_defs cfd ON cfd.id = cfv.field_id
         WHERE cfv.employee_id = $1 AND cfd.is_active = true`,
        [empId],
      );
      for (const cv of customValues as Record<string, unknown>[]) {
        const fieldLabel = (customFields as Record<string, unknown>[]).find(f => f.id === cv.field_id)?.field_label as string | undefined;
        if (fieldLabel) {
          data[i][fieldLabel as string] = cv.value_text ?? cv.value_num ?? cv.value_date ?? '';
        }
      }
    }

    const ws = XLSX.utils.json_to_sheet(data, {header: allHeaders});
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '员工档案');

    const buffer = XLSX.write(wb, {type: 'buffer', bookType: 'xlsx'});
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=employees-${new Date().toISOString().slice(0, 10)}.xlsx`);
    res.send(buffer);
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════
// Scorecard (unified score management)
// ═══════════════════════════════════════════════════════════════════

// Recompute scorecard for a single employee
async function recomputeScorecard(employeeId: string): Promise<void> {
  const emp = await queryOne(`SELECT candidate_id, position_id FROM employee_profiles WHERE id = $1`, [employeeId]);
  if (!emp) return;

  const candidateId = (emp as Record<string, unknown>).candidate_id;

  // Interview scores
  const interviewResult = await queryOne(
    `SELECT total_score, grade, interview_date FROM interview_results WHERE candidate_id = $1 ORDER BY interview_date DESC LIMIT 1`,
    [candidateId],
  );
  const interviewScore = interviewResult ? Number((interviewResult as Record<string, unknown>).total_score ?? 0) : null;
  const interviewGrade = interviewResult ? String((interviewResult as Record<string, unknown>).grade ?? '') : null;
  const interviewDate = interviewResult ? (interviewResult as Record<string, unknown>).interview_date as string : null;
  const interviewCount = candidateId ? Number((await queryOne(`SELECT COUNT(*)::int AS c FROM interview_results WHERE candidate_id = $1`, [candidateId]))?.c ?? 0) : 0;

  // Training scores
  const trainingStats = await queryOne(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'completed') AS passed,
            AVG(final_score) FILTER (WHERE final_score IS NOT NULL)::numeric(5,2) AS avg_score
     FROM training_enrollments WHERE candidate_id = $1`,
    [candidateId],
  );
  const tStats = trainingStats as Record<string, unknown>;
  const trainingTotal = Number(tStats?.total ?? 0);
  const trainingPassed = Number(tStats?.passed ?? 0);
  const trainingAvg = tStats?.avg_score ? Number(tStats.avg_score) : null;
  const trainingRate = trainingTotal > 0 ? Number(((trainingPassed / trainingTotal) * 100).toFixed(2)) : null;

  // Performance scores
  const perfStats = await queryOne(
    `SELECT AVG(score)::numeric(5,2) AS avg_score, COUNT(*)::int AS cnt FROM employee_performance WHERE employee_id = $1`,
    [employeeId],
  );
  const pStats = perfStats as Record<string, unknown>;
  const perfAvg = pStats?.avg_score ? Number(pStats.avg_score) : null;
  const perfCount = Number(pStats?.cnt ?? 0);
  const perfLatest = await queryOne(
    `SELECT rating FROM employee_performance WHERE employee_id = $1 ORDER BY period DESC LIMIT 1`,
    [employeeId],
  );
  const perfLatestRating = perfLatest ? String((perfLatest as Record<string, unknown>).rating ?? '') : null;

  // Composite score (weighted, re-weight if missing)
  const weights: Array<{score: number | null; weight: number}> = [
    {score: interviewScore, weight: 0.30},
    {score: trainingAvg, weight: 0.30},
    {score: perfAvg, weight: 0.40},
  ];
  const validWeights = weights.filter(w => w.score !== null);
  const totalWeight = validWeights.reduce((s, w) => s + w.weight, 0);
  const composite = totalWeight > 0 ? validWeights.reduce((s, w) => s + (w.score! * w.weight), 0) / totalWeight : null;
  const compositeGrade = composite !== null ? (composite >= 90 ? 'S' : composite >= 80 ? 'A' : composite >= 70 ? 'B' : composite >= 60 ? 'C' : 'D') : null;

  // Upsert scorecard
  await queryOne(
    `INSERT INTO employee_scorecards (
      employee_id, interview_score_latest, interview_grade_latest, interview_date_latest, interview_count,
      training_score_avg, training_courses_total, training_courses_passed, training_completion_rate,
      performance_score_avg, performance_review_count, performance_latest_rating,
      composite_score, composite_grade, last_recomputed_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
    ON CONFLICT (employee_id) DO UPDATE SET
      interview_score_latest = EXCLUDED.interview_score_latest,
      interview_grade_latest = EXCLUDED.interview_grade_latest,
      interview_date_latest = EXCLUDED.interview_date_latest,
      interview_count = EXCLUDED.interview_count,
      training_score_avg = EXCLUDED.training_score_avg,
      training_courses_total = EXCLUDED.training_courses_total,
      training_courses_passed = EXCLUDED.training_courses_passed,
      training_completion_rate = EXCLUDED.training_completion_rate,
      performance_score_avg = EXCLUDED.performance_score_avg,
      performance_review_count = EXCLUDED.performance_review_count,
      performance_latest_rating = EXCLUDED.performance_latest_rating,
      composite_score = EXCLUDED.composite_score,
      composite_grade = EXCLUDED.composite_grade,
      last_recomputed_at = now(),
      updated_at = now()
    RETURNING *`,
    [
      employeeId, interviewScore, interviewGrade, interviewDate, interviewCount,
      trainingAvg, trainingTotal, trainingPassed, trainingRate,
      perfAvg, perfCount, perfLatestRating,
      composite, compositeGrade,
    ],
  );
}

// GET /:id/scorecard
router.get('/:id/scorecard', async (req, res, next) => {
  try {
    const {id} = req.params;
    let card = await queryOne(`SELECT * FROM employee_scorecards WHERE employee_id = $1`, [id]);

    // Lazy recompute if no card or card is older than 24h
    if (!card || (card as Record<string, unknown>).last_recomputed_at) {
      const lastComputed = new Date(String((card as Record<string, unknown>)?.last_recomputed_at ?? 0));
      const age = Date.now() - lastComputed.getTime();
      if (!card || age > 24 * 3600000) {
        await recomputeScorecard(id);
        card = await queryOne(`SELECT * FROM employee_scorecards WHERE employee_id = $1`, [id]);
      }
    }

    if (!card) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Employee (${id}) not found`}});
      return;
    }
    res.json(card);
  } catch (e) { next(e); }
});

// POST /:id/recompute-score — force recompute
router.post('/:id/recompute-score', async (req, res, next) => {
  try {
    const {id} = req.params;
    const emp = await queryOne(`SELECT id FROM employee_profiles WHERE id = $1`, [id]);
    if (!emp) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Employee (${id}) not found`}});
      return;
    }
    await recomputeScorecard(id);
    const card = await queryOne(`SELECT * FROM employee_scorecards WHERE employee_id = $1`, [id]);
    res.json(card);
  } catch (e) { next(e); }
});

// GET /scorecard-overview — batch view
router.get('/scorecard-overview', async (_req, res, next) => {
  try {
    const rows = await query(
      `SELECT sc.*, ep.name, ep.department, ep.status
       FROM employee_scorecards sc
       JOIN employee_profiles ep ON ep.id = sc.employee_id
       ORDER BY sc.composite_score DESC NULLS LAST`,
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════
// Training Recommendations
// ═══════════════════════════════════════════════════════════════════

// GET /:id/training-recommendations
router.get('/:id/training-recommendations', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT etr.*, tc.title AS course_title, tc.category
       FROM employee_training_recommendations etr
       LEFT JOIN training_courses tc ON tc.id = etr.course_id
       WHERE etr.employee_id = $1
       ORDER BY etr.priority ASC, etr.created_at DESC`,
      [req.params.id],
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /:id/generate-recommendations — auto-generate from weaknesses/gaps
router.post('/:id/generate-recommendations', async (req, res, next) => {
  try {
    const {id} = req.params;
    const emp = await queryOne(
      `SELECT ep.id, ep.interview_weaknesses, ep.candidate_id, ep.position_id
       FROM employee_profiles ep WHERE ep.id = $1`,
      [id],
    );
    if (!emp) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Employee (${id}) not found`}});
      return;
    }

    // Collect weakness sources
    const weaknesses: Array<{name: string; source: string; detail: string}> = [];
    const interviewWeaknesses = (emp as Record<string, unknown>).interview_weaknesses as string[] ?? [];
    for (const w of interviewWeaknesses) {
      weaknesses.push({name: w, source: 'weakness', detail: `面试薄弱点: ${w}`});
    }

    // Performance weaknesses from latest review
    const latestPerf = await queryOne(
      `SELECT weaknesses FROM employee_performance WHERE employee_id = $1 ORDER BY period DESC LIMIT 1`,
      [id],
    );
    if (latestPerf) {
      const perfWeaknesses = (latestPerf as Record<string, unknown>).weaknesses as string[] ?? [];
      for (const w of perfWeaknesses) {
        weaknesses.push({name: w, source: 'performance', detail: `绩效待提升: ${w}`});
      }
    }

    // Match weaknesses to training courses
    let generated = 0;
    for (const weakness of weaknesses) {
      const courses = await query(
        `SELECT id, title FROM training_courses WHERE is_active = true AND (category ILIKE $1 OR title ILIKE $1) LIMIT 3`,
        [`%${weakness.name}%`],
      );

      for (const course of courses as Record<string, unknown>[]) {
        try {
          await queryOne(
            `INSERT INTO employee_training_recommendations (employee_id, course_id, reason, reason_detail, priority)
             VALUES ($1, $2, $3, $4, 3)
             ON CONFLICT (employee_id, course_id, reason) DO NOTHING
             RETURNING id`,
            [id, course.id, weakness.source, weakness.detail],
          );
          generated++;
        } catch { /* skip duplicates */ }
      }
    }

    const rows = await query(
      `SELECT etr.*, tc.title AS course_title, tc.category
       FROM employee_training_recommendations etr
       LEFT JOIN training_courses tc ON tc.id = etr.course_id
       WHERE etr.employee_id = $1
       ORDER BY etr.priority ASC`,
      [id],
    );
    res.json({generated, recommendations: rows});
  } catch (e) { next(e); }
});

// PATCH /:id/training-recommendations/:recId
router.patch('/:id/training-recommendations/:recId', async (req, res, next) => {
  try {
    const {id, recId} = req.params;
    const {status} = req.body;
    if (!status || !['pending', 'enrolled', 'completed', 'dismissed'].includes(status)) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Valid status required'}});
      return;
    }

    const updateData: Record<string, unknown> = {status, updated_at: new Date().toISOString()};
    if (status === 'enrolled') updateData.enrolled_at = new Date().toISOString();
    if (status === 'completed') updateData.completed_at = new Date().toISOString();

    const row = await queryOne(
      `UPDATE employee_training_recommendations SET status = $1, enrolled_at = COALESCE($2, enrolled_at), completed_at = COALESCE($3, completed_at), updated_at = now()
       WHERE id = $4 AND employee_id = $5 RETURNING *`,
      [status, updateData.enrolled_at ?? null, updateData.completed_at ?? null, recId, id],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Recommendation (${recId}) not found`}});
      return;
    }
    res.json(row);
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
