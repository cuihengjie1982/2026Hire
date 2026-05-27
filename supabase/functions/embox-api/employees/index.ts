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
    return jsonRes(data, 201);
  } catch (e) {
    console.error('[employees create]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create employee' } }, 500);
  }
};

// PATCH /api/employees/:id — update employee
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

    updateData['updated_at'] = new Date().toISOString();

    const { data, error } = await supabase.from('employee_profiles')
      .update(updateData).eq('id', id).select().single();

    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Employee (${id}) not found` } }, 404);
    }
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

  // /api/employees/:id/performance
  if (path.includes('/performance')) {
    if (method === 'GET') return listPerformance(req);
    if (method === 'POST') return addPerformance(req);
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
