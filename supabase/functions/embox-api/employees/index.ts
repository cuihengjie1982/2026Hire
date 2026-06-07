import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';

function jsonRes(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function getQuery(req: Request, key: string): string | null {
  return new URL(req.url).searchParams.get(key);
}

// Extract path segments after /api/employees
function getSegments(req: Request): string[] {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/embox-api\/api\/employees\/?/, '');
  return path.split('/').filter(Boolean);
}

// Field labels for version history (Chinese display names)
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
 * For Edge Function, we batch insert history entries.
 */
async function recordProfileChanges(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  employeeId: string,
  beforeRow: Record<string, unknown>,
  updates: Record<string, unknown>,
  fieldMap: Record<string, string>,
  userId?: string,
  userEmail?: string,
): Promise<void> {
  const historyEntries: Array<{
    employee_id: string;
    action: string;
    field_name: string;
    field_label: string;
    old_value: string | null;
    new_value: string | null;
    changed_by: string | null;
    changed_by_email: string | null;
    snapshot: string;
  }> = [];

  const snapshot = JSON.stringify(beforeRow);
  const jsonbFields = ['certifications', 'skills', 'personality', 'interview_weaknesses'];

  for (const [bodyKey, colName] of Object.entries(fieldMap)) {
    if (updates[bodyKey] === undefined) continue;

    let oldVal = beforeRow[colName];
    let newVal = updates[bodyKey];

    if (jsonbFields.includes(bodyKey)) {
      oldVal = oldVal ? JSON.stringify(oldVal) : null;
      newVal = JSON.stringify(newVal);
    } else {
      oldVal = oldVal != null ? String(oldVal) : null;
      newVal = newVal != null ? String(newVal) : null;
    }

    if (oldVal !== newVal) {
      historyEntries.push({
        employee_id: employeeId,
        action: 'update',
        field_name: bodyKey,
        field_label: FIELD_LABELS[bodyKey] ?? bodyKey,
        old_value: oldVal,
        new_value: newVal,
        changed_by: userId ?? null,
        changed_by_email: userEmail ?? null,
        snapshot,
      });
    }
  }

  if (historyEntries.length === 0) return;

  const { error } = await supabase.from('employee_profile_history').insert(historyEntries);
  if (error) console.error('[employees history record]', error);
}

// ═══════════════════════════════════════════════════════════════════
// Employee Profiles
// ═══════════════════════════════════════════════════════════════════

// GET /api/employees — list with pagination + filters
const listEmployees = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const status = getQuery(req, 'status');
    const projectId = getQuery(req, 'projectId');
    const positionId = getQuery(req, 'positionId');
    const page = parseInt(getQuery(req, 'page') ?? '1', 10);
    const pageSize = Math.min(parseInt(getQuery(req, 'pageSize') ?? '50', 10), 200);
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('employee_profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (status) query = query.eq('status', status);
    if (projectId) query = query.eq('project_id', projectId);
    if (positionId) query = query.eq('position_id', positionId);

    const { data, count, error } = await query;
    if (error) throw error;

    // Compute retention_days for active employees
    const mapped = (data ?? []).map((r: Record<string, unknown>) => {
      if (r.status === 'active' && r.hire_date) {
        r.retention_days = Math.floor((Date.now() - new Date(r.hire_date as string).getTime()) / 86400000);
      }
      return r;
    });

    return jsonRes({ items: mapped, total: count ?? 0, page, pageSize });
  } catch (e) {
    console.error('[employees list]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list employees' } }, 500);
  }
};

// GET /api/employees/stats — aggregated stats
const getStats = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);

    const [
      { count: totalActive },
      { data: avgPerfData },
      { data: avgRetData },
      { data: statusData },
      { data: gradeData },
    ] = await Promise.all([
      supabase.from('employee_profiles').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('employee_profiles').select('avg_performance').eq('status', 'active').not('avg_performance', 'is', null),
      supabase.from('employee_profiles').select('retention_days').eq('status', 'active').not('retention_days', 'is', null),
      supabase.from('employee_profiles').select('status'),
      supabase.from('employee_profiles').select('interview_grade').not('interview_grade', 'is', null),
    ]);

    const sumPerf = (avgPerfData ?? []).reduce((s: number, r: Record<string, unknown>) => s + Number(r.avg_performance ?? 0), 0);
    const sumRet = (avgRetData ?? []).reduce((s: number, r: Record<string, unknown>) => s + Number(r.retention_days ?? 0), 0);

    const statusMap: Record<string, number> = {};
    for (const r of (statusData ?? []) as Record<string, unknown>[]) {
      const s = r.status as string;
      statusMap[s] = (statusMap[s] ?? 0) + 1;
    }
    const gradeMap: Record<string, number> = {};
    for (const r of (gradeData ?? []) as Record<string, unknown>[]) {
      const g = r.interview_grade as string;
      gradeMap[g] = (gradeMap[g] ?? 0) + 1;
    }

    return jsonRes({
      totalActive: totalActive ?? 0,
      avgPerformance: (avgPerfData ?? []).length > 0 ? Number((sumPerf / (avgPerfData ?? []).length).toFixed(2)) : 0,
      avgRetentionDays: (avgRetData ?? []).length > 0 ? Math.round(sumRet / (avgRetData ?? []).length) : 0,
      statusBreakdown: statusMap,
      gradeDistribution: gradeMap,
    });
  } catch (e) {
    console.error('[employees stats]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get employee stats' } }, 500);
  }
};

// GET /api/employees/:id — single employee with candidate resume data
const getEmployee = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getSegments(req);
    // segments may be [id] or [id, 'performance', ...] or ['competency-models', ...] or ['stats']
    const id = segments[0];
    if (!id || id === 'stats' || id === 'competency-models') {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id required' } }, 400);
    }

    const { data, error } = await supabase.from('employee_profiles').select('*').eq('id', id).single();
    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Employee (${id}) not found` } }, 404);
    }

    // Try to join candidate resume data
    if (data.candidate_id) {
      const { data: candidate } = await supabase.from('candidates')
        .select('parsed_info, raw_resume_md, score_total, grade')
        .eq('id', data.candidate_id).maybeSingle();
      if (candidate) {
        (data as Record<string, unknown>).parsed_info = candidate.parsed_info;
        (data as Record<string, unknown>).raw_resume_md = candidate.raw_resume_md;
        (data as Record<string, unknown>).resume_score = candidate.score_total;
        (data as Record<string, unknown>).resume_grade = candidate.grade;
      }
    }

    if (data.status === 'active' && data.hire_date) {
      (data as Record<string, unknown>).retention_days = Math.floor(
        (Date.now() - new Date(data.hire_date as string).getTime()) / 86400000
      );
    }

    return jsonRes(data);
  } catch (e) {
    console.error('[employees get]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get employee' } }, 500);
  }
};

// POST /api/employees — create employee profile
const createEmployee = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();
    const {
      candidateId, name, email, phone,
      status, hireDate, projectId, positionId,
      department, manager,
      education, major, certifications, skills, personality,
      commuteDistance, familyStatus,
      interviewScore, interviewGrade, interviewWeaknesses,
    } = body;

    if (!candidateId || !name) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'candidateId and name are required' } }, 400);
    }

    // Check candidate exists
    const { data: candidate } = await supabase.from('candidates').select('id, email, phone').eq('id', candidateId).maybeSingle();
    if (!candidate) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Candidate (${candidateId}) not found` } }, 404);
    }

    // Check for duplicate
    const { data: existing } = await supabase.from('employee_profiles').select('id').eq('candidate_id', candidateId).maybeSingle();
    if (existing) {
      return jsonRes({ error: { code: 'DUPLICATE', message: `Employee profile already exists for candidate ${candidateId}` } }, 409);
    }

    const { data, error } = await supabase.from('employee_profiles').insert({
      candidate_id: candidateId,
      name,
      email: email ?? candidate.email ?? null,
      phone: phone ?? candidate.phone ?? null,
      status: status ?? 'active',
      hire_date: hireDate ?? new Date().toISOString().slice(0, 10),
      project_id: projectId ?? null,
      position_id: positionId ?? null,
      department: department ?? null,
      manager: manager ?? null,
      education: education ?? null,
      major: major ?? null,
      certifications: certifications ?? null,
      skills: skills ?? null,
      personality: personality ?? null,
      commute_distance: commuteDistance ?? null,
      family_status: familyStatus ?? null,
      interview_score: interviewScore ?? null,
      interview_grade: interviewGrade ?? null,
      interview_weaknesses: interviewWeaknesses ?? null,
    }).select().single();

    if (error) throw error;

    // Record creation in history
    if (data) {
      await supabase.from('employee_profile_history').insert({
        employee_id: data.id,
        action: 'create',
        field_label: '创建员工档案',
        snapshot: JSON.stringify(data),
      });
    }

    return jsonRes(data, 201);
  } catch (e) {
    console.error('[employees create]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create employee' } }, 500);
  }
};

// PATCH /api/employees/:id — update employee (with version history tracking)
const updateEmployee = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getSegments(req);
    const id = segments[0];
    if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id required' } }, 400);

    const updates = await req.json();
    const updateData: Record<string, unknown> = {};

    const fieldMap: Record<string, string> = {
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

    for (const [bodyKey, colName] of Object.entries(fieldMap)) {
      if (updates[bodyKey] !== undefined) {
        updateData[colName] = updates[bodyKey];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' } }, 400);
    }

    // Read current row before updating (for version history)
    const { data: beforeRow } = await supabase.from('employee_profiles').select('*').eq('id', id).maybeSingle();
    if (!beforeRow) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Employee (${id}) not found` } }, 404);
    }

    updateData['updated_at'] = new Date().toISOString();

    const { data, error } = await supabase.from('employee_profiles')
      .update(updateData).eq('id', id).select().single();

    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Employee (${id}) not found` } }, 404);
    }

    // Record field-level changes in history
    await recordProfileChanges(
      supabase,
      id,
      beforeRow as Record<string, unknown>,
      updates,
      fieldMap,
    );

    return jsonRes(data);
  } catch (e) {
    console.error('[employees update]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update employee' } }, 500);
  }
};

// DELETE /api/employees/:id
const deleteEmployee = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getSegments(req);
    const id = segments[0];
    if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id required' } }, 400);

    const { data, error } = await supabase.from('employee_profiles').delete().eq('id', id).select('id').single();
    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Employee (${id}) not found` } }, 404);
    }
    return jsonRes({ deleted: true, id: data.id });
  } catch (e) {
    console.error('[employees delete]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete employee' } }, 500);
  }
};

// ═══════════════════════════════════════════════════════════════════
// Version History
// ═══════════════════════════════════════════════════════════════════

// GET /api/employees/:id/history — version history for an employee profile
const getHistory = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getSegments(req);
    const employeeId = segments[0];
    if (!employeeId) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id required' } }, 400);

    const page = parseInt(getQuery(req, 'page') ?? '1', 10);
    const pageSize = Math.min(parseInt(getQuery(req, 'pageSize') ?? '20', 10), 100);
    const offset = (page - 1) * pageSize;

    // Verify employee exists
    const { data: emp } = await supabase.from('employee_profiles').select('id').eq('id', employeeId).maybeSingle();
    if (!emp) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Employee (${employeeId}) not found` } }, 404);
    }

    const { data, error, count } = await supabase.from('employee_profile_history')
      .select('id, employee_id, action, field_name, old_value, new_value, field_label, changed_by, changed_by_email, changed_at', { count: 'exact' })
      .eq('employee_id', employeeId)
      .order('changed_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    return jsonRes({
      items: data ?? [],
      total: count ?? 0,
      page,
      pageSize,
    });
  } catch (e) {
    console.error('[employees history]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get history' } }, 500);
  }
};

// ═══════════════════════════════════════════════════════════════════
// Custom Field Definitions
// ═══════════════════════════════════════════════════════════════════

// GET /api/employees/custom-fields
const listCustomFields = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const { data, error } = await supabase.from('employee_custom_field_defs')
      .select('*').eq('is_active', true).order('sort_order').order('created_at');
    if (error) throw error;
    return jsonRes(data ?? []);
  } catch (e) {
    console.error('[employees custom-fields list]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list custom fields' } }, 500);
  }
};

// POST /api/employees/custom-fields
const createCustomField = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();
    const { fieldKey, fieldLabel, fieldType, options, source } = body;

    if (!fieldKey || !fieldLabel) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'fieldKey and fieldLabel are required' } }, 400);
    }

    // Upsert by field_key
    const { data, error } = await supabase.from('employee_custom_field_defs')
      .upsert({
        field_key: fieldKey,
        field_label: fieldLabel,
        field_type: fieldType ?? 'text',
        options: options ?? [],
        source: source ?? 'manual',
      }, { onConflict: 'field_key' })
      .select().single();

    if (error) throw error;
    return jsonRes(data, 201);
  } catch (e) {
    console.error('[employees custom-fields create]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create custom field' } }, 500);
  }
};

// PATCH /api/employees/custom-fields/:id
const updateCustomField = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getSegments(req);
    const id = segments[1]; // ['custom-fields', id]
    if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id required' } }, 400);

    const body = await req.json();
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.fieldLabel !== undefined) updateData.field_label = body.fieldLabel;
    if (body.fieldType !== undefined) updateData.field_type = body.fieldType;
    if (body.options !== undefined) updateData.options = body.options;
    if (body.isActive !== undefined) updateData.is_active = body.isActive;
    if (body.sortOrder !== undefined) updateData.sort_order = body.sortOrder;

    const { data, error } = await supabase.from('employee_custom_field_defs')
      .update(updateData).eq('id', id).select().single();

    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Custom field (${id}) not found` } }, 404);
    }
    return jsonRes(data);
  } catch (e) {
    console.error('[employees custom-fields update]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update custom field' } }, 500);
  }
};

// DELETE /api/employees/custom-fields/:id
const deleteCustomField = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getSegments(req);
    const id = segments[1];
    if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id required' } }, 400);

    const { data, error } = await supabase.from('employee_custom_field_defs')
      .update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id).select('id').single();

    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Custom field (${id}) not found` } }, 404);
    }
    return jsonRes({ deleted: true, id: data.id });
  } catch (e) {
    console.error('[employees custom-fields delete]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete custom field' } }, 500);
  }
};

// ═══════════════════════════════════════════════════════════════════
// Custom Field Values
// ═══════════════════════════════════════════════════════════════════

// GET /api/employees/:id/custom-values
const getCustomValues = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getSegments(req);
    const employeeId = segments[0];

    const { data, error } = await supabase.from('employee_custom_field_values')
      .select('*, employee_custom_field_defs!inner(field_key, field_label, field_type)')
      .eq('employee_id', employeeId)
      .eq('employee_custom_field_defs.is_active', true)
      .order('employee_custom_field_defs.sort_order');

    if (error) throw error;

    const mapped = (data ?? []).map((r: Record<string, unknown>) => {
      const def = r.employee_custom_field_defs as Record<string, unknown>;
      return {
        ...r,
        field_key: def?.field_key,
        field_label: def?.field_label,
        field_type: def?.field_type,
      };
    });

    return jsonRes(mapped);
  } catch (e) {
    console.error('[employees custom-values get]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get custom values' } }, 500);
  }
};

// PATCH /api/employees/:id/custom-values — batch update
const updateCustomValues = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getSegments(req);
    const employeeId = segments[0];
    const body = await req.json();
    const values = body.values as Array<{ fieldId: string; value: unknown }>;

    if (!Array.isArray(values) || values.length === 0) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'values array is required' } }, 400);
    }

    // Verify employee exists
    const { data: emp } = await supabase.from('employee_profiles').select('id').eq('id', employeeId).maybeSingle();
    if (!emp) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Employee (${employeeId}) not found` } }, 404);
    }

    for (const item of values) {
      const { data: fieldDef } = await supabase.from('employee_custom_field_defs')
        .select('id, field_type').eq('id', item.fieldId).maybeSingle();
      if (!fieldDef) continue;

      const ft = (fieldDef as Record<string, unknown>).field_type as string;
      const val = item.value;

      const upsertData: Record<string, unknown> = {
        employee_id: employeeId,
        field_id: item.fieldId,
      };

      if (ft === 'text' || ft === 'select') upsertData.value_text = val != null ? String(val) : null;
      if (ft === 'number') upsertData.value_num = val != null ? Number(val) : null;
      if (ft === 'date') upsertData.value_date = val ? String(val) : null;
      if (ft === 'multiselect' || ft === 'boolean') upsertData.value_json = val;

      await supabase.from('employee_custom_field_values')
        .upsert(upsertData, { onConflict: 'employee_id, field_id' });
    }

    // Return updated values
    const { data: result } = await supabase.from('employee_custom_field_values')
      .select('*, employee_custom_field_defs!inner(field_key, field_label, field_type)')
      .eq('employee_id', employeeId)
      .eq('employee_custom_field_defs.is_active', true);

    const mapped = (result ?? []).map((r: Record<string, unknown>) => {
      const def = r.employee_custom_field_defs as Record<string, unknown>;
      return { ...r, field_key: def?.field_key, field_label: def?.field_label, field_type: def?.field_type };
    });

    return jsonRes(mapped);
  } catch (e) {
    console.error('[employees custom-values update]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update custom values' } }, 500);
  }
};

// ═══════════════════════════════════════════════════════════════════
// Excel Export
// ═══════════════════════════════════════════════════════════════════

// GET /api/employees/export/excel
const exportExcel = async (req: Request): Promise<Response> => {
  try {
    // Dynamically import SheetJS for Deno
    const XLSX = await import('https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs');
    const supabase = createSupabaseAdmin(req);

    const { data: employees, error: empError } = await supabase.from('employee_profiles')
      .select('*').order('created_at', { ascending: false });
    if (empError) throw empError;

    const { data: customFields } = await supabase.from('employee_custom_field_defs')
      .select('id, field_key, field_label').eq('is_active', true).order('sort_order');

    const headers = ['姓名', '邮箱', '电话', '部门', '主管', '学历', '专业', '入职日期', '状态', '面试分数', '面试等级', '平均绩效', '培训分数'];
    const customHeaders = (customFields ?? []).map((f: Record<string, unknown>) => f.field_label as string);
    const allHeaders = [...headers, ...customHeaders];

    const data = (employees ?? []).map((emp: Record<string, unknown>) => {
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

    // Add custom values
    if (customFields && customFields.length > 0) {
      for (const emp of (employees ?? []) as Record<string, unknown>[]) {
        const { data: cvs } = await supabase.from('employee_custom_field_values')
          .select('field_id, value_text, value_num, value_date')
          .eq('employee_id', emp.id as string);

        const empRow = data.find((r: Record<string, unknown>) => r['姓名'] === emp.name);
        if (empRow && cvs) {
          for (const cv of cvs as Record<string, unknown>[]) {
            const fieldLabel = (customFields as Record<string, unknown>[]).find(f => f.id === cv.field_id)?.field_label;
            if (fieldLabel) {
              (empRow as Record<string, unknown>)[fieldLabel] = cv.value_text ?? cv.value_num ?? cv.value_date ?? '';
            }
          }
        }
      }
    }

    const ws = XLSX.utils.json_to_sheet(data, { header: allHeaders });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '员工档案');

    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=employees-${new Date().toISOString().slice(0, 10)}.xlsx`,
      },
    });
  } catch (e) {
    console.error('[employees export excel]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to export Excel' } }, 500);
  }
};

// ═══════════════════════════════════════════════════════════════════
// Performance Records
// ═══════════════════════════════════════════════════════════════════

// GET /api/employees/:id/performance
const listPerformance = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getSegments(req);
    const employeeId = segments[0];

    const { data, error } = await supabase.from('employee_performance')
      .select('*').eq('employee_id', employeeId).order('period', { ascending: false });

    if (error) throw error;
    return jsonRes(data ?? []);
  } catch (e) {
    console.error('[employees performance list]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list performance' } }, 500);
  }
};

// POST /api/employees/:id/performance
const addPerformance = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getSegments(req);
    const employeeId = segments[0];
    const body = await req.json();
    const { period, score, rating, dimensions, strengths, weaknesses, notes, reviewer } = body;

    if (!period || score === undefined) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'period and score are required' } }, 400);
    }

    // Verify employee exists
    const { data: emp } = await supabase.from('employee_profiles').select('id').eq('id', employeeId).maybeSingle();
    if (!emp) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Employee (${employeeId}) not found` } }, 404);
    }

    // Upsert
    const { data, error } = await supabase.from('employee_performance').upsert({
      employee_id: employeeId,
      period,
      score,
      rating: rating ?? null,
      dimensions: dimensions ?? [],
      strengths: strengths ?? [],
      weaknesses: weaknesses ?? [],
      notes: notes ?? null,
      reviewer: reviewer ?? null,
    }, { onConflict: 'employee_id, period' }).select().single();

    if (error) throw error;

    // Update employee's avg_performance
    const { data: perfRows } = await supabase.from('employee_performance')
      .select('score').eq('employee_id', employeeId);
    if (perfRows && perfRows.length > 0) {
      const avg = (perfRows as Record<string, unknown>[]).reduce((s, r) => s + Number(r.score ?? 0), 0) / perfRows.length;
      await supabase.from('employee_profiles').update({ avg_performance: Number(avg.toFixed(2)), updated_at: new Date().toISOString() }).eq('id', employeeId);
    }

    return jsonRes(data, 201);
  } catch (e) {
    console.error('[employees performance add]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to add performance record' } }, 500);
  }
};

// ═══════════════════════════════════════════════════════════════════
// Competency Models
// ═══════════════════════════════════════════════════════════════════

// GET /api/employees/competency-models
const listCompetencyModels = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const positionId = getQuery(req, 'positionId');

    let query = supabase.from('competency_models')
      .select('*, positions(name)')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (positionId) query = query.eq('position_id', positionId);

    const { data, error } = await query;
    if (error) throw error;

    // Flatten positions.name → position_name
    const mapped = (data ?? []).map((r: Record<string, unknown>) => {
      const pos = r.positions as Record<string, unknown> | null;
      return { ...r, position_name: pos?.name ?? null };
    });

    return jsonRes(mapped);
  } catch (e) {
    console.error('[employees competency list]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list competency models' } }, 500);
  }
};

// GET /api/employees/competency-models/:id
const getCompetencyModel = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getSegments(req);
    // segments: ['competency-models', id] or ['competency-models', 'derive', positionId]
    const id = segments[1];
    if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id required' } }, 400);

    const { data, error } = await supabase.from('competency_models')
      .select('*, positions(name)').eq('id', id).single();

    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Competency model (${id}) not found` } }, 404);
    }

    const pos = (data as Record<string, unknown>).positions as Record<string, unknown> | null;
    return jsonRes({ ...data, position_name: pos?.name ?? null });
  } catch (e) {
    console.error('[employees competency get]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get competency model' } }, 500);
  }
};

// POST /api/employees/competency-models
const createCompetencyModel = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();
    const { positionId, name, dimensions, sourceType, derivedFrom } = body;

    if (!positionId || !name) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'positionId and name are required' } }, 400);
    }

    // Deactivate previous active models
    await supabase.from('competency_models')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('position_id', positionId).eq('is_active', true);

    const { data, error } = await supabase.from('competency_models').insert({
      position_id: positionId,
      name,
      dimensions: dimensions ?? [],
      source_type: sourceType ?? 'manual',
      derived_from: derivedFrom ?? null,
    }).select().single();

    if (error) throw error;
    return jsonRes(data, 201);
  } catch (e) {
    console.error('[employees competency create]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create competency model' } }, 500);
  }
};

// POST /api/employees/competency-models/derive/:positionId
const deriveCompetencyModel = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getSegments(req);
    // segments: ['competency-models', 'derive', positionId]
    const positionId = segments[2];
    if (!positionId) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'positionId required' } }, 400);

    const body = await req.json();
    const topN = body.topN ?? 5;

    // Find top performers
    const { data: topEmployees } = await supabase.from('employee_profiles')
      .select('id, name, avg_performance, interview_score, interview_grade, skills, interview_weaknesses')
      .eq('position_id', positionId).eq('status', 'active').not('avg_performance', 'is', null)
      .order('avg_performance', { ascending: false }).limit(topN);

    if (!topEmployees || topEmployees.length === 0) {
      return jsonRes({ error: { code: 'NO_DATA', message: 'No employees with performance data found' } }, 400);
    }

    // Aggregate
    const allSkills: Record<string, { count: number; total: number }> = {};
    const allWeaknesses: Record<string, number> = {};
    let totalPerf = 0;
    const employeeIds: string[] = [];

    for (const emp of topEmployees as Record<string, unknown>[]) {
      employeeIds.push(emp.id as string);
      totalPerf += Number(emp.avg_performance ?? 0);

      const skills = (emp.skills ?? []) as { name: string; level: number }[];
      for (const s of skills) {
        if (!allSkills[s.name]) allSkills[s.name] = { count: 0, total: 0 };
        allSkills[s.name].count++;
        allSkills[s.name].total += s.level;
      }

      const weaknesses = (emp.interview_weaknesses ?? []) as string[];
      for (const w of weaknesses) {
        allWeaknesses[w] = (allWeaknesses[w] ?? 0) + 1;
      }
    }

    const dimEntries = Object.entries(allSkills).sort((a, b) => b[1].count - a[1].count);
    const totalWeight = dimEntries.reduce((sum, [, v]) => sum + v.count, 0);
    const dimensions = dimEntries.slice(0, 10).map(([name, v]) => ({
      name,
      weight: Math.round((v.count / totalWeight) * 100),
      description: `Top performers avg level: ${(v.total / v.count).toFixed(1)}`,
    }));

    // Deactivate previous
    await supabase.from('competency_models')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('position_id', positionId).eq('is_active', true);

    const { data: position } = await supabase.from('positions').select('name').eq('id', positionId).maybeSingle();
    const modelName = `${position?.name ?? '岗位'}胜任力模型 v${new Date().toISOString().slice(0, 10)}`;

    const { data, error } = await supabase.from('competency_models').insert({
      position_id: positionId,
      name: modelName,
      dimensions,
      source_type: 'ai_derived',
      derived_from: {
        employee_ids: employeeIds,
        sample_size: employeeIds.length,
        avg_score: Number((totalPerf / employeeIds.length).toFixed(2)),
        common_weaknesses: Object.entries(allWeaknesses)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, count]) => ({ name, count })),
      },
    }).select().single();

    if (error) throw error;
    return jsonRes(data, 201);
  } catch (e) {
    console.error('[employees competency derive]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to derive competency model' } }, 500);
  }
};

// PATCH /api/employees/competency-models/:id
const updateCompetencyModel = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getSegments(req);
    const id = segments[1];
    if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id required' } }, 400);

    const body = await req.json();
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.dimensions !== undefined) updateData.dimensions = body.dimensions;
    if (body.isActive !== undefined) updateData.is_active = body.isActive;

    const { data, error } = await supabase.from('competency_models')
      .update(updateData).eq('id', id).select().single();

    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Competency model (${id}) not found` } }, 404);
    }
    return jsonRes(data);
  } catch (e) {
    console.error('[employees competency update]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update competency model' } }, 500);
  }
};

// DELETE /api/employees/competency-models/:id
const deleteCompetencyModel = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getSegments(req);
    const id = segments[1];
    if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id required' } }, 400);

    const { data, error } = await supabase.from('competency_models').delete().eq('id', id).select('id').single();
    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Competency model (${id}) not found` } }, 404);
    }
    return jsonRes({ deleted: true, id: data.id });
  } catch (e) {
    console.error('[employees competency delete]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete competency model' } }, 500);
  }
};

// ═══════════════════════════════════════════════════════════════════
// Scorecard
// ═══════════════════════════════════════════════════════════════════

// GET /api/employees/:id/scorecard
const getScorecard = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getSegments(req);
    const employeeId = segments[0];

    let { data: card } = await supabase.from('employee_scorecards').select('*').eq('employee_id', employeeId).maybeSingle();

    const lastRecomputedAt = (card as Record<string, unknown> | null)?.last_recomputed_at;
    const lastComputedAt = lastRecomputedAt ? new Date(String(lastRecomputedAt)).getTime() : 0;
    const isStale = !lastComputedAt || Number.isNaN(lastComputedAt) || Date.now() - lastComputedAt > 24 * 3600000;
    if (!card || isStale) {
      await recomputeScorecardEF(supabase, employeeId);
      const result = await supabase.from('employee_scorecards').select('*').eq('employee_id', employeeId).maybeSingle();
      card = result.data;
    }

    if (!card) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Employee (${employeeId}) not found` } }, 404);
    }
    return jsonRes(card);
  } catch (e) {
    console.error('[employees scorecard]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get scorecard' } }, 500);
  }
};

// POST /api/employees/:id/recompute-score
const recomputeScore = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getSegments(req);
    const employeeId = segments[0];

    const { data: emp } = await supabase.from('employee_profiles').select('id').eq('id', employeeId).maybeSingle();
    if (!emp) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Employee (${employeeId}) not found` } }, 404);
    }

    await recomputeScorecardEF(supabase, employeeId);
    const { data: card } = await supabase.from('employee_scorecards').select('*').eq('employee_id', employeeId).maybeSingle();
    return jsonRes(card);
  } catch (e) {
    console.error('[employees recompute]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to recompute scorecard' } }, 500);
  }
};

// Helper: recompute scorecard (Edge Function version)
async function recomputeScorecardEF(supabase: ReturnType<typeof createSupabaseAdmin>, employeeId: string): Promise<void> {
  const { data: emp } = await supabase.from('employee_profiles').select('candidate_id').eq('id', employeeId).maybeSingle();
  if (!emp) return;
  const candidateId = (emp as Record<string, unknown>).candidate_id as string;

  // Interview
  const { data: interviewResult } = await supabase.from('interview_results')
    .select('total_score, grade, interview_date').eq('candidate_id', candidateId).order('interview_date', { ascending: false }).limit(1).maybeSingle();
  const { count: interviewCount } = await supabase.from('interview_results').select('*', { count: 'exact', head: true }).eq('candidate_id', candidateId);
  const interviewScore = interviewResult ? Number((interviewResult as Record<string, unknown>).total_score ?? 0) : null;
  const interviewGrade = interviewResult ? String((interviewResult as Record<string, unknown>).grade ?? '') : null;
  const interviewDate = interviewResult ? (interviewResult as Record<string, unknown>).interview_date as string : null;

  // Training
  const { data: trainingRows } = await supabase.from('training_enrollments').select('status, final_score').eq('candidate_id', candidateId);
  const trainingTotal = (trainingRows ?? []).length;
  const trainingPassed = (trainingRows ?? []).filter((r: Record<string, unknown>) => r.status === 'completed').length;
  const trainingScores = (trainingRows ?? []).filter((r: Record<string, unknown>) => r.final_score != null).map((r: Record<string, unknown>) => Number(r.final_score));
  const trainingAvg = trainingScores.length > 0 ? Number((trainingScores.reduce((s, v) => s + v, 0) / trainingScores.length).toFixed(2)) : null;
  const trainingRate = trainingTotal > 0 ? Number(((trainingPassed / trainingTotal) * 100).toFixed(2)) : null;

  // Performance
  const { data: perfRows } = await supabase.from('employee_performance').select('score, rating').eq('employee_id', employeeId);
  const perfScores = (perfRows ?? []).map((r: Record<string, unknown>) => Number(r.score));
  const perfAvg = perfScores.length > 0 ? Number((perfScores.reduce((s, v) => s + v, 0) / perfScores.length).toFixed(2)) : null;
  const perfCount = perfScores.length;
  const perfLatestRating = (perfRows ?? []).length > 0 ? String((perfRows as Record<string, unknown>[])[0]?.rating ?? '') : null;

  // Composite
  const weights: Array<{score: number | null; weight: number}> = [
    {score: interviewScore, weight: 0.30}, {score: trainingAvg, weight: 0.30}, {score: perfAvg, weight: 0.40},
  ];
  const valid = weights.filter(w => w.score !== null);
  const totalW = valid.reduce((s, w) => s + w.weight, 0);
  const composite = totalW > 0 ? Number((valid.reduce((s, w) => s + w.score! * w.weight, 0) / totalW).toFixed(2)) : null;
  const compositeGrade = composite !== null ? (composite >= 90 ? 'S' : composite >= 80 ? 'A' : composite >= 70 ? 'B' : composite >= 60 ? 'C' : 'D') : null;

  await supabase.from('employee_scorecards').upsert({
    employee_id: employeeId,
    interview_score_latest: interviewScore, interview_grade_latest: interviewGrade, interview_date_latest: interviewDate, interview_count: interviewCount ?? 0,
    training_score_avg: trainingAvg, training_courses_total: trainingTotal, training_courses_passed: trainingPassed, training_completion_rate: trainingRate,
    performance_score_avg: perfAvg, performance_review_count: perfCount, performance_latest_rating: perfLatestRating,
    composite_score: composite, composite_grade: compositeGrade,
    last_recomputed_at: new Date().toISOString(),
  }, { onConflict: 'employee_id' });
}

// ═══════════════════════════════════════════════════════════════════
// Training Recommendations
// ═══════════════════════════════════════════════════════════════════

// GET /api/employees/:id/training-recommendations
const listTrainingRecommendations = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getSegments(req);
    const employeeId = segments[0];

    const { data, error } = await supabase.from('employee_training_recommendations')
      .select('*, training_courses(title, category)')
      .eq('employee_id', employeeId).order('priority').order('created_at', { ascending: false });

    if (error) throw error;
    const mapped = (data ?? []).map((r: Record<string, unknown>) => {
      const course = r.training_courses as Record<string, unknown> | null;
      return {...r, course_title: course?.title ?? null, category: course?.category ?? null};
    });
    return jsonRes(mapped);
  } catch (e) {
    console.error('[employees training-recs list]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list recommendations' } }, 500);
  }
};

// POST /api/employees/:id/generate-recommendations
const generateRecommendations = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getSegments(req);
    const employeeId = segments[0];

    const { data: emp } = await supabase.from('employee_profiles')
      .select('id, interview_weaknesses, candidate_id').eq('id', employeeId).maybeSingle();
    if (!emp) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Employee (${employeeId}) not found` } }, 404);
    }

    const weaknesses: Array<{name: string; source: string; detail: string}> = [];
    const interviewW = ((emp as Record<string, unknown>).interview_weaknesses ?? []) as string[];
    for (const w of interviewW) weaknesses.push({name: w, source: 'weakness', detail: `面试薄弱点: ${w}`});

    const { data: latestPerf } = await supabase.from('employee_performance')
      .select('weaknesses').eq('employee_id', employeeId).order('period', { ascending: false }).limit(1).maybeSingle();
    if (latestPerf) {
      const perfW = ((latestPerf as Record<string, unknown>).weaknesses ?? []) as string[];
      for (const w of perfW) weaknesses.push({name: w, source: 'performance', detail: `绩效待提升: ${w}`});
    }

    let generated = 0;
    for (const weakness of weaknesses) {
      const { data: courses } = await supabase.from('training_courses')
        .select('id, title').eq('is_active', true).ilike('category', `%${weakness.name}%`).limit(3);
      for (const course of (courses ?? []) as Record<string, unknown>[]) {
        const { error } = await supabase.from('employee_training_recommendations')
          .upsert({
            employee_id: employeeId, course_id: course.id, reason: weakness.source,
            reason_detail: weakness.detail, priority: 3,
          }, { onConflict: 'employee_id, course_id, reason' });
        if (!error) generated++;
      }
    }

    const { data: recs } = await supabase.from('employee_training_recommendations')
      .select('*, training_courses(title, category)').eq('employee_id', employeeId).order('priority');

    return jsonRes({generated, recommendations: recs ?? []});
  } catch (e) {
    console.error('[employees training-recs generate]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to generate recommendations' } }, 500);
  }
};

// PATCH /api/employees/:id/training-recommendations/:recId
const updateTrainingRecommendation = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getSegments(req);
    const employeeId = segments[0];
    const recId = segments[2];

    const body = await req.json();
    const status = body.status;
    if (!status || !['pending', 'enrolled', 'completed', 'dismissed'].includes(status)) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Valid status required' } }, 400);
    }

    const updateData: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'enrolled') updateData.enrolled_at = new Date().toISOString();
    if (status === 'completed') updateData.completed_at = new Date().toISOString();

    const { data, error } = await supabase.from('employee_training_recommendations')
      .update(updateData).eq('id', recId).eq('employee_id', employeeId).select().single();

    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Recommendation (${recId}) not found` } }, 404);
    }
    return jsonRes(data);
  } catch (e) {
    console.error('[employees training-recs update]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update recommendation' } }, 500);
  }
};

// ═══════════════════════════════════════════════════════════════════
// Main handler
// ═══════════════════════════════════════════════════════════════════

export const handleEmployees = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/embox-api/, '') || '/';
  const method = req.method;

  // /api/employees/competency-models/derive/:positionId
  if (path.includes('/competency-models/derive/')) {
    if (method === 'POST') return deriveCompetencyModel(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  }
  // /api/employees/competency-models/:id
  if (path.includes('/competency-models/')) {
    if (method === 'GET') return getCompetencyModel(req);
    if (method === 'PATCH') return updateCompetencyModel(req);
    if (method === 'DELETE') return deleteCompetencyModel(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  }
  // /api/employees/competency-models (list/create)
  if (path.includes('/competency-models')) {
    if (method === 'GET') return listCompetencyModels(req);
    if (method === 'POST') return createCompetencyModel(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  }
  // /api/employees/stats
  if (path.endsWith('/stats')) {
    if (method === 'GET') return getStats(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  }

  // /api/employees/export/excel
  if (path.endsWith('/export/excel')) {
    if (method === 'GET') return exportExcel(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  }

  // /api/employees/custom-fields/:id
  if (path.includes('/custom-fields/') && path.includes('/custom-fields')) {
    if (method === 'PATCH') return updateCustomField(req);
    if (method === 'DELETE') return deleteCustomField(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  }
  // /api/employees/custom-fields (list/create)
  if (path.includes('/custom-fields')) {
    if (method === 'GET') return listCustomFields(req);
    if (method === 'POST') return createCustomField(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  }

  // /api/employees/:id/performance
  if (path.includes('/performance')) {
    if (method === 'GET') return listPerformance(req);
    if (method === 'POST') return addPerformance(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  }

  // /api/employees/:id/history
  if (path.includes('/history')) {
    if (method === 'GET') return getHistory(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  }

  // /api/employees/:id/custom-values
  if (path.includes('/custom-values')) {
    if (method === 'GET') return getCustomValues(req);
    if (method === 'PATCH') return updateCustomValues(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  }

  // /api/employees/:id/recompute-score
  if (path.includes('/recompute-score')) {
    if (method === 'POST') return recomputeScore(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  }

  // /api/employees/:id/scorecard
  if (path.includes('/scorecard')) {
    if (method === 'GET') return getScorecard(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  }

  // /api/employees/:id/generate-recommendations
  if (path.includes('/generate-recommendations')) {
    if (method === 'POST') return generateRecommendations(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  }

  // /api/employees/:id/training-recommendations/:recId
  if (path.includes('/training-recommendations/') && path.split('/').length > 5) {
    if (method === 'PATCH') return updateTrainingRecommendation(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  }

  // /api/employees/:id/training-recommendations
  if (path.includes('/training-recommendations')) {
    if (method === 'GET') return listTrainingRecommendations(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  }

  // /api/employees/:id
  // Check if path has an id segment after /api/employees/
  const afterEmployees = path.replace(/^\/api\/employees\/?/, '');
  if (afterEmployees && method === 'GET') return getEmployee(req);
  if (afterEmployees && method === 'PATCH') return updateEmployee(req);
  if (afterEmployees && method === 'DELETE') return deleteEmployee(req);

  // /api/employees (no id)
  if (method === 'GET') return listEmployees(req);
  if (method === 'POST') return createEmployee(req);

  return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
};
