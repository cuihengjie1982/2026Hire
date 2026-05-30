import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';


function jsonRes(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function textRes(body: string, contentType: string, filename: string) {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

// Extract remaining path segments after the matched prefix
function getPathSegments(req: Request, prefix: string): string[] {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/embox-api/, '') || '/';
  const rest = path.startsWith(prefix) ? path.slice(prefix.length) : '';
  return rest.split('/').filter(Boolean);
}

// Extract query params
function getQuery(req: Request, key: string): string | null {
  return new URL(req.url).searchParams.get(key);
}

// =============================================================================
// Courses
// =============================================================================

const listOrGetCourse = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getPathSegments(req, '/training/courses');
    const id = segments[0];

    // GET /training/courses/:id
    if (id) {
      const { data, error } = await supabase
        .from('training_courses')
        .select('*, positions(name)')
        .eq('id', id)
        .single();
      if (error || !data) {
        return jsonRes({ error: { code: 'NOT_FOUND', message: `Course (${id}) not found` } }, 404);
      }
      return jsonRes(data);
    }

    // GET /training/courses — list with filters
    const category = getQuery(req, 'category');
    const positionId = getQuery(req, 'positionId');
    const difficulty = getQuery(req, 'difficulty');
    const page = parseInt(getQuery(req, 'page') ?? '1', 10);
    const pageSize = Math.min(parseInt(getQuery(req, 'pageSize') ?? '50', 10), 200);
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('training_courses')
      .select('*, positions(name)', { count: 'exact' })
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (category) query = query.eq('category', category);
    if (positionId) query = query.eq('position_id', positionId);
    if (difficulty) query = query.eq('difficulty', difficulty);

    const { data, count, error } = await query;
    if (error) throw error;

    return jsonRes({ items: data ?? [], total: count ?? 0, page, pageSize });
  } catch (e) {
    console.error('[training courses]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch courses' } }, 500);
  }
};

const createCourse = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();
    if (!body.title) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'title is required' } }, 400);
    }

    const { data, error } = await supabase.from('training_courses').insert({
      title: body.title,
      description: body.description ?? null,
      category: body.category ?? '综合',
      difficulty: body.difficulty ?? '初级',
      duration_minutes: body.durationMinutes ?? 30,
      content: body.content ?? [],
      materials: body.materials ?? [],
      assessment_config: body.assessmentConfig ?? {},
      position_id: body.positionId ?? null,
      competency_dimension: body.competencyDimension ?? null,
    }).select().single();

    if (error) throw error;
    return jsonRes(data, 201);
  } catch (e) {
    console.error('[training courses create]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create course' } }, 500);
  }
};

const updateCourse = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getPathSegments(req, '/training/courses');
    const id = segments[0];
    if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Course ID required' } }, 400);

    const body = await req.json();
    const updates: Record<string, unknown> = {};
    const fieldMap: Record<string, string> = {
      title: 'title', description: 'description', category: 'category',
      difficulty: 'difficulty', durationMinutes: 'duration_minutes',
      content: 'content', materials: 'materials', assessmentConfig: 'assessment_config',
      positionId: 'position_id', competencyDimension: 'competency_dimension',
      isActive: 'is_active',
    };

    for (const [bodyKey, col] of Object.entries(fieldMap)) {
      if (body[bodyKey] !== undefined) {
        updates[col] = body[bodyKey];
      }
    }

    if (Object.keys(updates).length === 0) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } }, 400);
    }

    updates['updated_at'] = new Date().toISOString();

    const { data, error } = await supabase.from('training_courses')
      .update(updates).eq('id', id).select().single();

    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: 'Course not found' } }, 404);
    }
    return jsonRes(data);
  } catch (e) {
    console.error('[training courses update]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update course' } }, 500);
  }
};

const deleteCourse = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getPathSegments(req, '/training/courses');
    const id = segments[0];
    if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Course ID required' } }, 400);

    const { error, data } = await supabase.from('training_courses').delete().eq('id', id).select('id').single();
    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: 'Course not found' } }, 404);
    }
    return jsonRes({ deleted: true, id: data.id });
  } catch (e) {
    console.error('[training courses delete]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete course' } }, 500);
  }
};

// =============================================================================
// Enrollments
// =============================================================================

const listEnrollments = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const candidateId = getQuery(req, 'candidateId');
    const courseId = getQuery(req, 'courseId');
    const status = getQuery(req, 'status');
    const page = parseInt(getQuery(req, 'page') ?? '1', 10);
    const pageSize = Math.min(parseInt(getQuery(req, 'pageSize') ?? '50', 10), 200);
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('training_enrollments')
      .select('*, training_courses!inner(title, category)', { count: 'exact' })
      .order('enrolled_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (candidateId) query = query.eq('candidate_id', candidateId);
    if (courseId) query = query.eq('course_id', courseId);
    if (status) query = query.eq('status', status);

    const { data, count, error } = await query;
    if (error) throw error;

    // Flatten course_title / course_category
    const items = (data ?? []).map((e: Record<string, unknown>) => {
      const course = (e.training_courses ?? {}) as Record<string, unknown>;
      const { training_courses: _, ...rest } = e;
      return {
        ...rest,
        course_title: course.title ?? '',
        course_category: course.category ?? '',
      };
    });

    return jsonRes({ items, total: count ?? 0, page, pageSize });
  } catch (e) {
    console.error('[training enrollments]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch enrollments' } }, 500);
  }
};

const createEnrollment = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();
    const { candidateId, candidateName, courseId, preInterviewScore, notes } = body;

    if (!candidateId || !candidateName || !courseId) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'candidateId, candidateName, courseId required' } }, 400);
    }

    // Get latest interview score if not provided
    let preScore = preInterviewScore ?? null;
    if (preScore === null || preScore === undefined) {
      const { data: lastInterview } = await supabase
        .from('interview_results')
        .select('total_score')
        .eq('candidate_id', candidateId)
        .order('interview_date', { ascending: false })
        .limit(1)
        .single();
      preScore = lastInterview?.total_score ?? null;
    }

    const { data, error } = await supabase.from('training_enrollments').insert({
      candidate_id: candidateId,
      candidate_name: candidateName,
      course_id: courseId,
      pre_interview_score: preScore,
      notes: notes ?? null,
    }).select().single();

    if (error) {
      if (error.code === '23505') {
        return jsonRes({ error: { code: 'DUPLICATE', message: 'Candidate already enrolled in this course' } }, 409);
      }
      throw error;
    }
    return jsonRes(data, 201);
  } catch (e) {
    console.error('[training enrollments create]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create enrollment' } }, 500);
  }
};

const updateEnrollment = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getPathSegments(req, '/training/enrollments');
    const id = segments[0];
    if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Enrollment ID required' } }, 400);

    const body = await req.json();
    const updates: Record<string, unknown> = {};
    const fieldMap: Record<string, string> = {
      status: 'status', progressPct: 'progress_pct', finalScore: 'final_score',
      postInterviewScore: 'post_interview_score', notes: 'notes',
    };

    for (const [bodyKey, col] of Object.entries(fieldMap)) {
      if (body[bodyKey] !== undefined) updates[col] = body[bodyKey];
    }

    if (body.status === 'completed' || body.status === 'failed') {
      updates['completed_at'] = new Date().toISOString();
    }
    updates['updated_at'] = new Date().toISOString();

    const { data, error } = await supabase.from('training_enrollments')
      .update(updates).eq('id', id).select().single();

    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: 'Enrollment not found' } }, 404);
    }
    return jsonRes(data);
  } catch (e) {
    console.error('[training enrollments update]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update enrollment' } }, 500);
  }
};

const deleteEnrollment = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getPathSegments(req, '/training/enrollments');
    const id = segments[0];
    if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Enrollment ID required' } }, 400);

    const { error, data } = await supabase.from('training_enrollments').delete().eq('id', id).select('id').single();
    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: 'Enrollment not found' } }, 404);
    }
    return jsonRes({ deleted: true, id: data.id });
  } catch (e) {
    console.error('[training enrollments delete]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete enrollment' } }, 500);
  }
};

// =============================================================================
// Assessments
// =============================================================================

const listAssessments = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getPathSegments(req, '/training/enrollments');
    const enrollmentId = segments[0]; // /training/enrollments/:id/assessments

    const { data, error } = await supabase
      .from('training_assessments')
      .select('*')
      .eq('enrollment_id', enrollmentId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return jsonRes(data ?? []);
  } catch (e) {
    console.error('[training assessments]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch assessments' } }, 500);
  }
};

const submitAssessment = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getPathSegments(req, '/training/enrollments');
    const enrollmentId = segments[0];
    const body = await req.json();
    const { score, passed, answers, assessor, feedback } = body;

    if (score === undefined) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'score required' } }, 400);
    }

    // Verify enrollment exists
    const { data: enrollment } = await supabase
      .from('training_enrollments').select('*').eq('id', enrollmentId).single();
    if (!enrollment) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: 'Enrollment not found' } }, 404);
    }

    const finalPassed = passed ?? (Number(score) >= 60);
    const { data: assessment, error } = await supabase.from('training_assessments').insert({
      enrollment_id: enrollmentId,
      score: Number(score),
      passed: finalPassed,
      answers: answers ?? [],
      assessor: assessor ?? null,
      feedback: feedback ?? null,
    }).select().single();

    if (error) throw error;

    // Update enrollment
    await supabase.from('training_enrollments').update({
      final_score: Number(score),
      status: finalPassed ? 'completed' : 'failed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', enrollmentId);

    return jsonRes(assessment, 201);
  } catch (e) {
    console.error('[training assessments submit]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to submit assessment' } }, 500);
  }
};

// =============================================================================
// Analytics — Weakness Analysis
// =============================================================================

const weaknessAnalysis = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const positionId = getQuery(req, 'positionId');

    // Get low-scoring interview results
    let query = supabase
      .from('interview_results')
      .select('candidate_id, total_score, grade, dimensions, candidates!inner(name, position_id)')
      .lt('total_score', 60)
      .order('interview_date', { ascending: false })
      .limit(100);

    if (positionId) {
      query = query.eq('candidates.position_id', positionId);
    }

    const { data: weakResults, error } = await query;
    if (error) throw error;

    // Aggregate dimension weaknesses
    const dimensionStats: Record<string, { count: number; totalScore: number; candidates: string[] }> = {};

    for (const r of (weakResults ?? [])) {
      const dims = (r.dimensions ?? []) as { name: string; score: number }[];
      const candidateName = (r.candidates as Record<string, unknown>)?.name as string ?? '';
      for (const d of dims) {
        if (d.score < 60) {
          if (!dimensionStats[d.name]) dimensionStats[d.name] = { count: 0, totalScore: 0, candidates: [] };
          dimensionStats[d.name].count++;
          dimensionStats[d.name].totalScore += d.score;
          if (!dimensionStats[d.name].candidates.includes(candidateName)) {
            dimensionStats[d.name].candidates.push(candidateName);
          }
        }
      }
    }

    const weaknesses = Object.entries(dimensionStats)
      .map(([name, stat]) => ({
        dimension: name,
        frequency: stat.count,
        avgScore: Math.round((stat.totalScore / stat.count) * 100) / 100,
        affectedCandidates: stat.candidates.slice(0, 10),
      }))
      .sort((a, b) => b.frequency - a.frequency);

    return jsonRes({ totalAnalyzed: (weakResults ?? []).length, weaknesses });
  } catch (e) {
    console.error('[training analytics weakness]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to analyze weaknesses' } }, 500);
  }
};

// =============================================================================
// Analytics — Training Effectiveness
// =============================================================================

const trainingEffectiveness = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);

    const { data: completed, error } = await supabase
      .from('training_enrollments')
      .select('pre_interview_score, post_interview_score, final_score, candidate_name, training_courses!inner(title, category)')
      .in('status', ['completed', 'failed'])
      .not('pre_interview_score', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    let totalImprovement = 0;
    let improved = 0;
    const byCategory: Record<string, { count: number; avgPre: number; avgPost: number; improved: number }> = {};

    for (const r of (completed ?? [])) {
      const pre = Number(r.pre_interview_score);
      const post = Number(r.post_interview_score ?? r.final_score);
      const improvement = post - pre;
      totalImprovement += improvement;
      if (improvement > 0) improved++;

      const cat = (r.training_courses as Record<string, unknown>)?.category as string ?? '未知';
      if (!byCategory[cat]) byCategory[cat] = { count: 0, avgPre: 0, avgPost: 0, improved: 0 };
      byCategory[cat].count++;
      byCategory[cat].avgPre += pre;
      byCategory[cat].avgPost += post;
      if (improvement > 0) byCategory[cat].improved++;
    }

    for (const v of Object.values(byCategory)) {
      v.avgPre = v.count > 0 ? Math.round((v.avgPre / v.count) * 100) / 100 : 0;
      v.avgPost = v.count > 0 ? Math.round((v.avgPost / v.count) * 100) / 100 : 0;
    }

    const totalCompleted = (completed ?? []).length;
    return jsonRes({
      totalCompleted,
      avgImprovement: totalCompleted > 0 ? Math.round((totalImprovement / totalCompleted) * 100) / 100 : 0,
      improvementRate: totalCompleted > 0 ? Math.round((improved / totalCompleted) * 100) : 0,
      byCategory,
    });
  } catch (e) {
    console.error('[training analytics effectiveness]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to analyze effectiveness' } }, 500);
  }
};

// =============================================================================
// Analytics — Recommend Courses
// =============================================================================

const recommendCourses = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();
    const { candidateId } = body;

    if (!candidateId) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'candidateId required' } }, 400);
    }

    // Get candidate's interview results with weak dimensions
    const { data: results } = await supabase
      .from('interview_results')
      .select('dimensions')
      .eq('candidate_id', candidateId);

    const weakDimSet = new Set<string>();
    for (const r of (results ?? [])) {
      const dims = (r.dimensions ?? []) as { name: string; score: number }[];
      for (const d of dims) {
        if (d.score < 60) weakDimSet.add(d.name);
      }
    }
    const dimensions = Array.from(weakDimSet);

    if (dimensions.length === 0) {
      return jsonRes({ dimensions: [], recommendations: [] });
    }

    // Find matching courses
    const { data: courses } = await supabase
      .from('training_courses')
      .select('*')
      .eq('is_active', true)
      .or(dimensions.map(d => `competency_dimension.eq.${d},category.eq.${d}`).join(','))
      .order('difficulty', { ascending: true })
      .order('created_at', { ascending: false });

    return jsonRes({ dimensions, recommendations: courses ?? [] });
  } catch (e) {
    console.error('[training recommend]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to recommend courses' } }, 500);
  }
};

// =============================================================================
// CSV Export
// =============================================================================

const exportEnrollmentsCsv = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const status = getQuery(req, 'status');
    const courseId = getQuery(req, 'courseId');

    let query = supabase
      .from('training_enrollments')
      .select('candidate_name, training_courses!inner(title, category), status, progress_pct, pre_interview_score, final_score, post_interview_score, enrolled_at, completed_at')
      .order('enrolled_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (courseId) query = query.eq('course_id', courseId);

    const { data, error } = await query;
    if (error) throw error;

    const STATUS_MAP: Record<string, string> = {
      enrolled: '已报名', in_progress: '学习中', completed: '已完成', failed: '未通过',
    };

    const header = '学员姓名,课程名称,分类,状态,进度(%),培训前面试分,考核分,培训后面试分,报名时间,完成时间\n';
    const csvRows = (data ?? []).map((r: Record<string, unknown>) => {
      const course = (r.training_courses ?? {}) as Record<string, unknown>;
      const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('zh-CN') : '';
      return [
        r.candidate_name ?? '',
        course.title ?? '',
        course.category ?? '',
        STATUS_MAP[r.status as string] ?? r.status,
        r.progress_pct ?? 0,
        r.pre_interview_score ?? '',
        r.final_score ?? '',
        r.post_interview_score ?? '',
        fmtDate(r.enrolled_at as string),
        fmtDate(r.completed_at as string),
      ].join(',');
    }).join('\n');

    const date = new Date().toISOString().slice(0, 10);
    return textRes('\uFEFF' + header + csvRows, 'text/csv; charset=utf-8', `training-enrollments-${date}.csv`);
  } catch (e) {
    console.error('[training export csv]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to export CSV' } }, 500);
  }
};

// =============================================================================
// Stats
// =============================================================================

const getTrainingStats = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);

    const [
      { count: totalCourses },
      { count: activeEnrollments },
      { count: completedEnrollments },
      { count: failedEnrollments },
      { data: avgData },
    ] = await Promise.all([
      supabase.from('training_courses').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('training_enrollments').select('*', { count: 'exact', head: true }).in('status', ['enrolled', 'in_progress']),
      supabase.from('training_enrollments').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('training_enrollments').select('*', { count: 'exact', head: true }).eq('status', 'failed'),
      supabase.from('training_enrollments').select('final_score').not('final_score', 'is', null),
    ]);

    const scores = (avgData ?? []).map(r => Number(r.final_score));
    const totalDone = (completedEnrollments ?? 0) + (failedEnrollments ?? 0);
    const completionRate = totalDone > 0 ? Math.round(((completedEnrollments ?? 0) / totalDone) * 100) : 0;
    const avgScore = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0;

    return jsonRes({
      totalCourses: totalCourses ?? 0,
      activeEnrollments: activeEnrollments ?? 0,
      completedEnrollments: completedEnrollments ?? 0,
      failedEnrollments: failedEnrollments ?? 0,
      completionRate,
      avgScore,
    });
  } catch (e) {
    console.error('[training stats]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch stats' } }, 500);
  }
};

// =============================================================================
// Public Portal — candidate training progress (no auth)
// =============================================================================

const portalHandler = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getPathSegments(req, '/training/portal');
    const candidateId = segments[0];

    if (!candidateId) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Candidate ID required' } }, 400);
    }

    // Optional token verification
    const token = new URL(req.url).searchParams.get('token');
    if (token) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const secret = supabaseUrl.slice(0, 16);
        const enc = new TextEncoder();
        const data = enc.encode(candidateId + secret);
        // Use hex instead of btoa for Deno compatibility
        const expected = Array.from(data.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('');
        if (token !== expected) {
          return jsonRes({ error: { code: 'FORBIDDEN', message: 'Invalid access token' } }, 403);
        }
      } catch {
        // If token validation itself fails, degrade gracefully
        console.warn('[training portal] Token validation failed, proceeding without verification');
      }
    }

    // Fetch enrollments with course details
    const { data: enrollments } = await supabase
      .from('training_enrollments')
      .select('*, training_courses!inner(*)')
      .eq('candidate_id', candidateId)
      .order('enrolled_at', { ascending: false });

    // Fetch assessments for each enrollment
    const result = [];
    for (const e of (enrollments ?? [])) {
      const { data: assessments } = await supabase
        .from('training_assessments')
        .select('*')
        .eq('enrollment_id', e.id)
        .order('created_at', { ascending: false });

      const course = (e.training_courses ?? {}) as Record<string, unknown>;
      const { training_courses: _, ...enrollment } = e;
      result.push({ ...enrollment, course_title: course.title, course_category: course.category, course_description: course.description, difficulty: course.difficulty, duration_minutes: course.duration_minutes, content: course.content, materials: course.materials, assessments: assessments ?? [] });
    }

    // Get candidate info
    const { data: candidate } = await supabase
      .from('candidates')
      .select('id, name, email, phone')
      .eq('id', candidateId)
      .single();

    return jsonRes({ candidate: candidate ?? null, enrollments: result });
  } catch (e) {
    console.error('[training portal]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to load portal data' } }, 500);
  }
};

// =============================================================================
// Course handler — routes GET/POST/PATCH/DELETE for /training/courses
// =============================================================================

export const handleCourses = async (req: Request): Promise<Response> => {
  const method = req.method;
  switch (method) {
    case 'GET': return listOrGetCourse(req);
    case 'POST': return createCourse(req);
    case 'PATCH': return updateCourse(req);
    case 'DELETE': return deleteCourse(req);
    default: return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, 405);
  }
};

// =============================================================================
// Enrollment handlers — routes GET/POST/PATCH/DELETE for /training/enrollments
// =============================================================================

export const handleEnrollments = async (req: Request): Promise<Response> => {
  // Check if path ends with /:id/assessments
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/embox-api/, '') || '/';

  if (path.includes('/assessments')) {
    if (req.method === 'GET') return listAssessments(req);
    if (req.method === 'POST') return submitAssessment(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, 405);
  }

  switch (req.method) {
    case 'GET': return listEnrollments(req);
    case 'POST': return createEnrollment(req);
    case 'PATCH': return updateEnrollment(req);
    case 'DELETE': return deleteEnrollment(req);
    default: return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, 405);
  }
};

// =============================================================================
// Learning Path handlers
// =============================================================================

const listPaths = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const category = getQuery(req, 'category');
    const positionId = getQuery(req, 'positionId');
    const level = getQuery(req, 'level');
    const active = getQuery(req, 'active');

    let query = supabase.from('training_paths').select('*');
    if (category) query = query.eq('category', category);
    if (positionId) query = query.eq('position_id', positionId);
    if (level) query = query.eq('level', level);
    if (active === '0') query = query.eq('is_active', false);
    else query = query.eq('is_active', true);

    query = query.order('created_at', { ascending: false });

    // For each path, fetch its courses
    const { data: paths, error } = await query;
    if (error) throw error;

    const result = [];
    for (const p of (paths ?? [])) {
      // Get courses associated with this path
      const { data: pathCourses } = await supabase
        .from('training_path_courses')
        .select('*, training_courses(*)')
        .eq('path_id', p.id)
        .order('sort_order');

      // Fetch enrollment stats
      const { count: enrolledCount } = await supabase
        .from('training_path_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('path_id', p.id);

      result.push({
        ...p,
        courses: (pathCourses ?? []).map((pc: Record<string, unknown>) => ({
          id: pc.id,
          pathId: pc.path_id,
          courseId: pc.course_id,
          sortOrder: pc.sort_order,
          isRequired: pc.is_required,
          course: pc.training_courses,
        })),
        enrolledCount: enrolledCount ?? 0,
      });
    }

    return jsonRes({ items: result, total: result.length });
  } catch (e) {
    console.error('[training paths list]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch paths' } }, 500);
  }
};

const getPath = async (req: Request, pathId: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);

    const { data: path, error } = await supabase
      .from('training_paths')
      .select('*')
      .eq('id', pathId)
      .single();

    if (error || !path) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Path (${pathId}) not found` } }, 404);
    }

    const { data: pathCourses } = await supabase
      .from('training_path_courses')
      .select('*, training_courses(*)')
      .eq('path_id', pathId)
      .order('sort_order');

    return jsonRes({
      ...path,
      courses: (pathCourses ?? []).map((pc: Record<string, unknown>) => ({
        id: pc.id,
        pathId: pc.path_id,
        courseId: pc.course_id,
        sortOrder: pc.sort_order,
        isRequired: pc.is_required,
        course: pc.training_courses,
      })),
    });
  } catch (e) {
    console.error('[training paths get]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch path' } }, 500);
  }
};

const createPath = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();

    if (!body.title) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'title is required' } }, 400);
    }

    const { data: path, error } = await supabase.from('training_paths').insert({
      title: body.title,
      description: body.description ?? null,
      category: body.category ?? '通用',
      level: body.level ?? '初级',
      is_certified: body.isCertified ?? false,
      position_id: body.positionId ?? null,
      cover_image_url: body.coverImageUrl ?? null,
    }).select().single();

    if (error) throw error;

    // Attach courses if provided
    const courseIds = body.courseIds as string[] | undefined;
    if (courseIds && courseIds.length > 0) {
      const rows = courseIds.map((cid, i) => ({
        path_id: path.id,
        course_id: cid,
        sort_order: i,
        is_required: true,
      }));
      await supabase.from('training_path_courses').insert(rows);
    }

    return jsonRes(path, 201);
  } catch (e) {
    console.error('[training paths create]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create path' } }, 500);
  }
};

const updatePath = async (req: Request, pathId: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();

    const updates: Record<string, unknown> = {};
    const fieldMap: Record<string, string> = {
      title: 'title', description: 'description', category: 'category',
      level: 'level', isCertified: 'is_certified',
      positionId: 'position_id', coverImageUrl: 'cover_image_url',
      isActive: 'is_active',
    };

    for (const [bodyKey, col] of Object.entries(fieldMap)) {
      if (body[bodyKey] !== undefined) {
        updates[col] = body[bodyKey];
      }
    }

    if (Object.keys(updates).length === 0 && !body.courseIds) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } }, 400);
    }

    if (Object.keys(updates).length > 0) {
      updates['updated_at'] = new Date().toISOString();
      const { error } = await supabase.from('training_paths')
        .update(updates).eq('id', pathId);
      if (error) throw error;
    }

    // Re-sync course associations
    if (body.courseIds !== undefined) {
      const courseIds = body.courseIds as string[];
      // Remove existing
      await supabase.from('training_path_courses').delete().eq('path_id', pathId);
      // Insert new
      if (courseIds.length > 0) {
        const rows = courseIds.map((cid, i) => ({
          path_id: pathId,
          course_id: cid,
          sort_order: i,
          is_required: true,
        }));
        await supabase.from('training_path_courses').insert(rows);
      }
    }

    return getPath(req, pathId);
  } catch (e) {
    console.error('[training paths update]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update path' } }, 500);
  }
};

const deletePath = async (req: Request, pathId: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const { error } = await supabase.from('training_paths').delete().eq('id', pathId);
    if (error) throw error;
    return jsonRes({ deleted: true });
  } catch (e) {
    console.error('[training paths delete]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete path' } }, 500);
  }
};

const addCourseToPath = async (req: Request, pathId: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();
    if (!body.courseId) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'courseId is required' } }, 400);
    }
    const { data, error } = await supabase.from('training_path_courses').insert({
      path_id: pathId,
      course_id: body.courseId,
      sort_order: body.sortOrder ?? 0,
      is_required: body.isRequired ?? true,
    }).select().single();
    if (error) throw error;
    return jsonRes(data, 201);
  } catch (e) {
    console.error('[training paths addCourse]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to add course to path' } }, 500);
  }
};

const removeCourseFromPath = async (req: Request, pathId: string, courseId: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const { error } = await supabase.from('training_path_courses')
      .delete().eq('path_id', pathId).eq('course_id', courseId);
    if (error) throw error;
    return jsonRes({ deleted: true });
  } catch (e) {
    console.error('[training paths removeCourse]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to remove course from path' } }, 500);
  }
};

const getPathEnrollments = async (req: Request, pathId: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const { data, error } = await supabase
      .from('training_path_enrollments')
      .select('*, candidates(id, name)')
      .eq('path_id', pathId)
      .order('enrolled_at', { ascending: false });

    if (error) throw error;
    return jsonRes({ items: data ?? [], total: (data ?? []).length });
  } catch (e) {
    console.error('[training paths enrollments]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch path enrollments' } }, 500);
  }
};

const enrollCandidateInPath = async (req: Request, pathId: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();
    if (!body.candidateId) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'candidateId is required' } }, 400);
    }
    const { data, error } = await supabase.from('training_path_enrollments').insert({
      path_id: pathId,
      candidate_id: body.candidateId,
    }).select().single();
    if (error) {
      if (error.code === '23505') {
        return jsonRes({ error: { code: 'DUPLICATE', message: 'Candidate already enrolled in this path' } }, 409);
      }
      throw error;
    }
    return jsonRes(data, 201);
  } catch (e) {
    console.error('[training paths enroll]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to enroll candidate' } }, 500);
  }
};

const updatePathEnrollment = async (req: Request, enrollmentId: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();
    const updates: Record<string, unknown> = {};
    const fieldMap: Record<string, string> = {
      status: 'status', progressPct: 'progress_pct',
    };
    for (const [bodyKey, col] of Object.entries(fieldMap)) {
      if (body[bodyKey] !== undefined) updates[col] = body[bodyKey];
    }
    if (body.status === 'completed' || body.status === 'failed') {
      updates['completed_at'] = new Date().toISOString();
    }
    updates['updated_at'] = new Date().toISOString();

    const { data, error } = await supabase.from('training_path_enrollments')
      .update(updates).eq('id', enrollmentId).select().single();
    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: 'Path enrollment not found' } }, 404);
    }
    return jsonRes(data);
  } catch (e) {
    console.error('[training paths updateEnrollment]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update enrollment' } }, 500);
  }
};

const deletePathEnrollment = async (req: Request, enrollmentId: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const { error, data } = await supabase.from('training_path_enrollments')
      .delete().eq('id', enrollmentId).select('id').single();
    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: 'Path enrollment not found' } }, 404);
    }
    return jsonRes({ deleted: true, id: data.id });
  } catch (e) {
    console.error('[training paths deleteEnrollment]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete enrollment' } }, 500);
  }
};

export const handlePaths = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/embox-api/, '') || '/';
  // Extract pathId and sub-resource from path: /training/paths/:id
  const afterPaths = path.replace(/^\/training\/paths\/?/, '');
  const segments = afterPaths.split('/').filter(Boolean);
  const pathId = segments[0];
  const subResource = segments[1]; // 'courses', 'enrollments', or a courseId
  const subId = segments[2]; // courseId for /:pathId/courses/:courseId, or candidateId for /:pathId/enrollments

  const method = req.method;

  // No pathId — list or create
  if (!pathId) {
    if (method === 'GET') return listPaths(req);
    if (method === 'POST') return createPath(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, 405);
  }

  // Path-level operations
  if (!subResource) {
    if (method === 'GET') return getPath(req, pathId);
    if (method === 'PATCH') return updatePath(req, pathId);
    if (method === 'DELETE') return deletePath(req, pathId);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, 405);
  }

  // /:pathId/courses and /:pathId/courses/:courseId
  if (subResource === 'courses') {
    if (subId) {
      if (method === 'DELETE') return removeCourseFromPath(req, pathId, subId);
      return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, 405);
    }
    if (method === 'POST') return addCourseToPath(req, pathId);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, 405);
  }

  // /:pathId/enrollments and /:pathId/enrollments/:enrollmentId
  if (subResource === 'enrollments') {
    if (subId) {
      if (method === 'PATCH') return updatePathEnrollment(req, subId);
      if (method === 'DELETE') return deletePathEnrollment(req, subId);
      return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, 405);
    }
    if (method === 'GET') return getPathEnrollments(req, pathId);
    if (method === 'POST') return enrollCandidateInPath(req, pathId);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, 405);
  }

  return jsonRes({ error: { code: 'NOT_FOUND', message: 'Path sub-resource not found' } }, 404);
};

// =============================================================================
// File Upload for training materials
// =============================================================================

const uploadMaterial = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'file is required' } }, 400);
    }

    if (file.size > 500 * 1024 * 1024) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'File too large (max 500MB)' } }, 400);
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const filename = `materials/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

    const { data, error } = await supabase.storage
      .from('training-materials')
      .upload(filename, await file.arrayBuffer(), {
        contentType: file.type,
        upsert: false,
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('training-materials')
      .getPublicUrl(filename);

    return jsonRes({ url: urlData.publicUrl, filename: file.name }, 201);
  } catch (e) {
    console.error('[training upload]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to upload file' } }, 500);
  }
};

// =============================================================================
// Batch Enrollment — enroll multiple candidates into a course or path
// =============================================================================

const batchEnroll = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();
    const { candidateIds, courseId, pathId } = body;

    if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'candidateIds array is required' } }, 400);
    }
    if (!courseId && !pathId) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'courseId or pathId is required' } }, 400);
    }

    // Fetch candidate names
    const { data: candidates } = await supabase
      .from('candidates')
      .select('id, name')
      .in('id', candidateIds);

    const candidateMap = new Map((candidates ?? []).map((c: Record<string, unknown>) => [c.id, c.name]));
    const enrolled: { candidateId: string; candidateName: string }[] = [];
    const skipped: { candidateId: string; reason: string }[] = [];

    for (const cid of candidateIds) {
      const name = candidateMap.get(cid) as string | undefined;
      if (!name) {
        skipped.push({ candidateId: cid, reason: 'Candidate not found' });
        continue;
      }

      if (pathId) {
        const { error } = await supabase.from('training_path_enrollments').insert({
          path_id: pathId, candidate_id: cid,
        });
        if (error) {
          if (error.code === '23505') {
            skipped.push({ candidateId: cid, reason: 'Already enrolled' });
          } else {
            skipped.push({ candidateId: cid, reason: error.message });
          }
        } else {
          enrolled.push({ candidateId: cid, candidateName: name });
        }
      } else {
        const { error } = await supabase.from('training_enrollments').insert({
          candidate_id: cid, candidate_name: name, course_id: courseId,
        });
        if (error) {
          if (error.code === '23505') {
            skipped.push({ candidateId: cid, reason: 'Already enrolled' });
          } else {
            skipped.push({ candidateId: cid, reason: error.message });
          }
        } else {
          enrolled.push({ candidateId: cid, candidateName: name });
        }
      }
    }

    return jsonRes({ enrolled, skipped, total: candidateIds.length }, 201);
  } catch (e) {
    console.error('[training batchEnroll]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to batch enroll' } }, 500);
  }
};

// =============================================================================
// Analytics handlers
// =============================================================================

export const handleAnalytics = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/embox-api/, '') || '/';

  if (path.includes('weakness-analysis')) return weaknessAnalysis(req);
  if (path.includes('training-effectiveness')) return trainingEffectiveness(req);
  if (path.includes('recommend-courses')) return recommendCourses(req);

  return jsonRes({ error: { code: 'NOT_FOUND', message: 'Analytics endpoint not found' } }, 404);
};

// Export individual handlers for direct route registration
export {
  getTrainingStats,
  exportEnrollmentsCsv,
  portalHandler,
  uploadMaterial,
  batchEnroll,
};
