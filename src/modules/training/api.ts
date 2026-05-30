import {getItemsFromPayload} from '../../shared/lib/apiClient';
import {USE_MOCK_API, API_BASE_URL, getAuthToken} from '../../shared/lib/runtime';
import {courseFixtures, enrollmentFixtures} from './fixtures';
import {
  type TrainingCourse,
  type TrainingEnrollment,
  type TrainingAssessment,
  type TrainingStats,
  type WeaknessAnalysis,
  type TrainingEffectiveness,
  type CourseRecommendation,
} from './types';

// Re-export types for consumers
export type {
  TrainingCourse,
  TrainingEnrollment,
  TrainingAssessment,
  TrainingStats,
  WeaknessAnalysis,
  TrainingEffectiveness,
  CourseRecommendation,
};

// Helper to call embox-api Edge Function (production) or fall through to fetchJson (dev)
const efetch = async <T>(path: string, method = 'GET', body?: Record<string, unknown>): Promise<T> => {
  const base = USE_MOCK_API ? '' : API_BASE_URL;
  const token = getAuthToken();
  const res = await fetch(`${base}/functions/v1/embox-api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `API error ${res.status}`);
  return data as T;
};

// ─── Mappers ────────────────────────────────────────────────────────────

const mapCourse = (raw: Record<string, unknown>): TrainingCourse => ({
  id: String(raw.id ?? ''),
  title: String(raw.title ?? ''),
  description: String(raw.description ?? ''),
  category: String(raw.category ?? '综合'),
  difficulty: String(raw.difficulty ?? '初级') as TrainingCourse['difficulty'],
  durationMinutes: Number(raw.duration_minutes ?? raw.durationMinutes ?? 30),
  content: (raw.content ?? []) as TrainingCourse['content'],
  materials: (raw.materials ?? []) as TrainingCourse['materials'],
  assessmentConfig: (raw.assessment_config ?? raw.assessmentConfig ?? {type: 'quiz', passingScore: 60}) as TrainingCourse['assessmentConfig'],
  positionId: raw.position_id ? String(raw.position_id) : undefined,
  positionName: (raw.positions as Record<string, unknown>)?.name
    ? String((raw.positions as Record<string, unknown>).name)
    : raw.position_name ? String(raw.position_name) : undefined,
  competencyDimension: raw.competency_dimension ? String(raw.competency_dimension) : undefined,
  isActive: Boolean(raw.is_active ?? raw.isActive ?? true),
  createdAt: String(raw.created_at ?? ''),
  updatedAt: String(raw.updated_at ?? ''),
});

const mapEnrollment = (raw: Record<string, unknown>): TrainingEnrollment => ({
  id: String(raw.id ?? ''),
  candidateId: String(raw.candidate_id ?? raw.candidateId ?? ''),
  candidateName: String(raw.candidate_name ?? raw.candidateName ?? ''),
  courseId: String(raw.course_id ?? raw.courseId ?? ''),
  courseTitle: raw.course_title ? String(raw.course_title) : undefined,
  courseCategory: raw.course_category ? String(raw.course_category) : undefined,
  status: String(raw.status ?? 'enrolled') as TrainingEnrollment['status'],
  enrolledAt: String(raw.enrolled_at ?? raw.enrolledAt ?? ''),
  completedAt: raw.completed_at ? String(raw.completed_at) : undefined,
  progressPct: Number(raw.progress_pct ?? raw.progressPct ?? 0),
  finalScore: raw.final_score as number | undefined,
  preInterviewScore: raw.pre_interview_score as number | undefined,
  postInterviewScore: raw.post_interview_score as number | undefined,
  notes: raw.notes ? String(raw.notes) : undefined,
  createdAt: String(raw.created_at ?? ''),
  updatedAt: String(raw.updated_at ?? ''),
});

const mapAssessment = (raw: Record<string, unknown>): TrainingAssessment => ({
  id: String(raw.id ?? ''),
  enrollmentId: String(raw.enrollment_id ?? raw.enrollmentId ?? ''),
  score: Number(raw.score ?? 0),
  passed: Boolean(raw.passed ?? false),
  answers: (raw.answers ?? []) as TrainingAssessment['answers'],
  assessor: raw.assessor ? String(raw.assessor) : undefined,
  feedback: raw.feedback ? String(raw.feedback) : undefined,
  createdAt: String(raw.created_at ?? ''),
});

// ─── Mock data store ────────────────────────────────────────────────────

let courses = [...courseFixtures];
let enrollments = [...enrollmentFixtures];
let assessments: TrainingAssessment[] = [];

const mockDelay = () => new Promise<void>(r => setTimeout(r, 150 + Math.random() * 200));

// ─── Courses ────────────────────────────────────────────────────────────

export const listCourses = async (filters?: {
  category?: string;
  positionId?: string;
  difficulty?: string;
  page?: number;
  pageSize?: number;
}): Promise<{items: TrainingCourse[]; total: number; page: number; pageSize: number}> => {
  if (USE_MOCK_API) {
    await mockDelay();
    let filtered = courses.filter(c => c.isActive);
    if (filters?.category) filtered = filtered.filter(c => c.category === filters.category);
    if (filters?.difficulty) filtered = filtered.filter(c => c.difficulty === filters.difficulty);
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 50;
    return {items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize};
  }

  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.positionId) params.set('positionId', filters.positionId);
  if (filters?.difficulty) params.set('difficulty', filters.difficulty);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));

  const qs = params.toString();
  const payload = await efetch<Record<string, unknown>>(`/training/courses${qs ? `?${qs}` : ''}`);
  return {
    items: getItemsFromPayload<Record<string, unknown>>(payload).map(mapCourse),
    total: (payload.total as number) ?? 0,
    page: (payload.page as number) ?? 1,
    pageSize: (payload.pageSize as number) ?? 50,
  };
};

export const getCourse = async (id: string): Promise<TrainingCourse> => {
  if (USE_MOCK_API) { await mockDelay(); const c = courses.find(x => x.id === id); if (!c) throw new Error('Course not found'); return c; }
  const raw = await efetch<Record<string, unknown>>(`/training/courses/${id}`);
  return mapCourse(raw);
};

export const createCourse = async (input: Partial<TrainingCourse> & {title: string}): Promise<TrainingCourse> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const course: TrainingCourse = {
      id: Date.now().toString(),
      title: input.title,
      description: input.description ?? '',
      category: input.category ?? '综合',
      difficulty: input.difficulty ?? '初级',
      durationMinutes: input.durationMinutes ?? 30,
      content: input.content ?? [],
      materials: input.materials ?? [],
      assessmentConfig: input.assessmentConfig ?? {type: 'quiz', passingScore: 60},
      positionId: input.positionId,
      competencyDimension: input.competencyDimension,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    courses.push(course);
    return course;
  }

  const raw = await efetch<Record<string, unknown>>('/training/courses', 'POST', input as unknown as Record<string, unknown>);
  return mapCourse(raw);
};

export const updateCourse = async (id: string, updates: Partial<TrainingCourse>): Promise<TrainingCourse> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const idx = courses.findIndex(c => c.id === id);
    if (idx === -1) throw new Error('Course not found');
    courses[idx] = {...courses[idx], ...updates, updatedAt: new Date().toISOString()};
    return courses[idx];
  }

  const raw = await efetch<Record<string, unknown>>(`/training/courses/${id}`, 'PATCH', updates as unknown as Record<string, unknown>);
  return mapCourse(raw);
};

export const deleteCourse = async (id: string): Promise<void> => {
  if (USE_MOCK_API) { await mockDelay(); courses = courses.filter(c => c.id !== id); return; }
  await efetch(`/training/courses/${id}`, 'DELETE');
};

// ─── Enrollments ────────────────────────────────────────────────────────

export const listEnrollments = async (filters?: {
  candidateId?: string;
  courseId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{items: TrainingEnrollment[]; total: number; page: number; pageSize: number}> => {
  if (USE_MOCK_API) {
    await mockDelay();
    let filtered = [...enrollments];
    if (filters?.candidateId) filtered = filtered.filter(e => e.candidateId === filters.candidateId);
    if (filters?.courseId) filtered = filtered.filter(e => e.courseId === filters.courseId);
    if (filters?.status) filtered = filtered.filter(e => e.status === filters.status);
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 50;
    return {items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize};
  }

  const params = new URLSearchParams();
  if (filters?.candidateId) params.set('candidateId', filters.candidateId);
  if (filters?.courseId) params.set('courseId', filters.courseId);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));

  const qs = params.toString();
  const payload = await efetch<Record<string, unknown>>(`/training/enrollments${qs ? `?${qs}` : ''}`);
  return {
    items: getItemsFromPayload<Record<string, unknown>>(payload).map(mapEnrollment),
    total: (payload.total as number) ?? 0,
    page: (payload.page as number) ?? 1,
    pageSize: (payload.pageSize as number) ?? 50,
  };
};

export const createEnrollment = async (input: {
  candidateId: string;
  candidateName: string;
  courseId: string;
  preInterviewScore?: number;
  notes?: string;
}): Promise<TrainingEnrollment> => {
  if (USE_MOCK_API) {
    await mockDelay();
    // Find course title
    const course = courses.find(c => c.id === input.courseId);
    const enrollment: TrainingEnrollment = {
      id: Date.now().toString(),
      candidateId: input.candidateId,
      candidateName: input.candidateName,
      courseId: input.courseId,
      courseTitle: course?.title ?? '',
      courseCategory: course?.category ?? '',
      status: 'enrolled',
      enrolledAt: new Date().toISOString(),
      progressPct: 0,
      preInterviewScore: input.preInterviewScore,
      notes: input.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    enrollments.push(enrollment);
    return enrollment;
  }

  const raw = await efetch<Record<string, unknown>>('/training/enrollments', 'POST', input as unknown as Record<string, unknown>);
  return mapEnrollment(raw);
};

export const updateEnrollment = async (
  id: string,
  updates: Partial<Pick<TrainingEnrollment, 'status' | 'progressPct' | 'finalScore' | 'postInterviewScore' | 'notes'>>,
): Promise<TrainingEnrollment> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const idx = enrollments.findIndex(e => e.id === id);
    if (idx === -1) throw new Error('Enrollment not found');
    enrollments[idx] = {...enrollments[idx], ...updates, updatedAt: new Date().toISOString()};
    return enrollments[idx];
  }

  const raw = await efetch<Record<string, unknown>>(`/training/enrollments/${id}`, 'PATCH', updates as unknown as Record<string, unknown>);
  return mapEnrollment(raw);
};

export const deleteEnrollment = async (id: string): Promise<void> => {
  if (USE_MOCK_API) { await mockDelay(); enrollments = enrollments.filter(e => e.id !== id); return; }
  await efetch(`/training/enrollments/${id}`, 'DELETE');
};

// ─── Assessments ────────────────────────────────────────────────────────

export const listAssessments = async (enrollmentId: string): Promise<TrainingAssessment[]> => {
  if (USE_MOCK_API) { await mockDelay(); return assessments.filter(a => a.enrollmentId === enrollmentId); }
  const rows = await efetch<Record<string, unknown>[]>(`/training/enrollments/${enrollmentId}/assessments`);
  return rows.map(mapAssessment);
};

export const submitAssessment = async (
  enrollmentId: string,
  input: {score: number; passed?: boolean; answers?: unknown[]; assessor?: string; feedback?: string},
): Promise<TrainingAssessment> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const record: TrainingAssessment = {
      id: Date.now().toString(),
      enrollmentId,
      score: input.score,
      passed: input.passed ?? input.score >= 60,
      answers: (input.answers ?? []) as TrainingAssessment['answers'],
      assessor: input.assessor,
      feedback: input.feedback,
      createdAt: new Date().toISOString(),
    };
    assessments.push(record);

    // Update enrollment
    const idx = enrollments.findIndex(e => e.id === enrollmentId);
    if (idx !== -1) {
      enrollments[idx] = {
        ...enrollments[idx],
        status: record.passed ? 'completed' : 'failed',
        finalScore: record.score,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    return record;
  }

  const raw = await efetch<Record<string, unknown>>(`/training/enrollments/${enrollmentId}/assessments`, 'POST', input as unknown as Record<string, unknown>);
  return mapAssessment(raw);
};

// ─── Analytics ──────────────────────────────────────────────────────────

export const getWeaknessAnalysis = async (positionId?: string): Promise<WeaknessAnalysis> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return {
      totalAnalyzed: 15,
      weaknesses: [
        {dimension: '沟通表达', frequency: 12, avgScore: 38.5, affectedCandidates: ['张三', '王五', '赵六', '刘七']},
        {dimension: '专业能力', frequency: 9, avgScore: 42.1, affectedCandidates: ['李四', '孙八', '周九']},
        {dimension: '应变能力', frequency: 7, avgScore: 35.8, affectedCandidates: ['张三', '李四', '吴十']},
        {dimension: '综合素质', frequency: 4, avgScore: 48.2, affectedCandidates: ['王五', '赵六']},
      ],
    };
  }

  const qs = positionId ? `?positionId=${encodeURIComponent(positionId)}` : '';
  return efetch<WeaknessAnalysis>(`/training/analytics/weakness-analysis${qs}`);
};

export const getTrainingEffectiveness = async (): Promise<TrainingEffectiveness> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return {
      totalCompleted: 8,
      avgImprovement: 18.5,
      improvementRate: 75,
      byCategory: {
        '沟通表达': {count: 4, avgPre: 42.5, avgPost: 68.2, improved: 3},
        '专业能力': {count: 3, avgPre: 38.0, avgPost: 61.3, improved: 2},
        '应变能力': {count: 1, avgPre: 35.0, avgPost: 55.0, improved: 1},
      },
    };
  }

  return efetch<TrainingEffectiveness>('/training/analytics/training-effectiveness');
};

export const recommendCourses = async (candidateId: string): Promise<CourseRecommendation> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return {
      dimensions: ['沟通表达', '应变能力'],
      recommendations: courses.filter(c => ['沟通表达', '应变能力'].includes(c.category)),
    };
  }

  const raw = await efetch<CourseRecommendation>('/training/analytics/recommend-courses', 'POST', {candidateId});
  return raw;
};

// ─── Stats ──────────────────────────────────────────────────────────────

export const exportEnrollmentsCSV = async (filters?: {status?: string; courseId?: string}): Promise<void> => {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.courseId) params.set('courseId', filters.courseId);
  const qs = params.toString();

  const token = getAuthToken() ?? '';
  const base = USE_MOCK_API ? '' : API_BASE_URL;
  const url = `${base}/functions/v1/embox-api/training/export/enrollments${qs ? `?${qs}` : ''}`;

  const resp = await fetch(url, {
    headers: {Authorization: `Bearer ${token}`},
  });
  if (!resp.ok) throw new Error(`Export failed: ${resp.status}`);

  const blob = await resp.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `training-enrollments-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

export const getTrainingStats = async (): Promise<TrainingStats> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const completed = enrollments.filter(e => e.status === 'completed').length;
    const failed = enrollments.filter(e => e.status === 'failed').length;
    const totalDone = completed + failed;
    const scores = enrollments.filter(e => e.finalScore !== undefined).map(e => e.finalScore!);
    return {
      totalCourses: courses.filter(c => c.isActive).length,
      activeEnrollments: enrollments.filter(e => e.status === 'enrolled' || e.status === 'in_progress').length,
      completedEnrollments: completed,
      failedEnrollments: failed,
      completionRate: totalDone > 0 ? Math.round((completed / totalDone) * 100) : 0,
      avgScore: scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0,
    };
  }

  return efetch<TrainingStats>('/training/stats');
};

// ─── Learning Paths ─────────────────────────────────────────────────────

const mapPathCourse = (raw: Record<string, unknown>): import('../training/types').PathCourse => ({
  id: String(raw.id ?? ''),
  pathId: String(raw.pathId ?? raw.path_id ?? ''),
  courseId: String(raw.courseId ?? raw.course_id ?? ''),
  sortOrder: Number(raw.sortOrder ?? raw.sort_order ?? 0),
  isRequired: Boolean(raw.isRequired ?? raw.is_required ?? true),
  course: mapCourse((raw.course ?? raw.training_courses ?? {}) as Record<string, unknown>),
});

const mapPath = (raw: Record<string, unknown>): import('../training/types').LearningPath => ({
  id: String(raw.id ?? ''),
  title: String(raw.title ?? ''),
  description: String(raw.description ?? ''),
  category: String(raw.category ?? '通用'),
  level: (String(raw.level ?? '初级')) as '初级' | '中级' | '高级',
  isCertified: Boolean(raw.isCertified ?? raw.is_certified ?? false),
  positionId: (raw.positionId ?? raw.position_id ?? undefined) as string | undefined,
  coverImageUrl: (raw.coverImageUrl ?? raw.cover_image_url ?? undefined) as string | undefined,
  isActive: Boolean(raw.isActive ?? raw.is_active ?? true),
  courses: ((raw.courses ?? []) as Record<string, unknown>[]).map(mapPathCourse),
  enrolledCount: Number(raw.enrolledCount ?? 0),
  createdAt: String(raw.createdAt ?? raw.created_at ?? ''),
  updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ''),
});

export const listPaths = async (filters?: {
  category?: string; positionId?: string; level?: string;
}): Promise<{ items: import('../training/types').LearningPath[]; total: number }> => {
  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.positionId) params.set('positionId', filters.positionId);
  if (filters?.level) params.set('level', filters.level);
  const qs = params.toString();

  if (USE_MOCK_API) {
    await mockDelay();
    return { items: [], total: 0 };
  }

  const payload = await efetch<Record<string, unknown>>(`/training/paths${qs ? `?${qs}` : ''}`);
  return {
    items: (payload.items as Record<string, unknown>[] | undefined ?? []).map(mapPath),
    total: (payload.total as number) ?? 0,
  };
};

export const createPath = async (input: {
  title: string;
  description?: string;
  category?: string;
  level?: string;
  isCertified?: boolean;
  positionId?: string;
  coverImageUrl?: string;
  courseIds?: string[];
}): Promise<import('../training/types').LearningPath> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return {
      id: Date.now().toString(),
      title: input.title,
      description: input.description ?? '',
      category: input.category ?? '通用',
      level: (input.level ?? '初级') as '初级' | '中级' | '高级',
      isCertified: input.isCertified ?? false,
      positionId: input.positionId,
      courses: [],
      enrolledCount: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  const raw = await efetch<Record<string, unknown>>('/training/paths', 'POST', input as unknown as Record<string, unknown>);
  return mapPath(raw);
};

export const updatePath = async (id: string, updates: {
  title?: string; description?: string; category?: string; level?: string;
  isCertified?: boolean; isActive?: boolean; coverImageUrl?: string;
  courseIds?: string[];
}): Promise<import('../training/types').LearningPath> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return { /* simplified mock */ } as import('../training/types').LearningPath;
  }

  const raw = await efetch<Record<string, unknown>>(`/training/paths/${id}`, 'PATCH', updates as unknown as Record<string, unknown>);
  return mapPath(raw);
};

export const deletePath = async (id: string): Promise<void> => {
  if (USE_MOCK_API) { await mockDelay(); return; }
  await efetch(`/training/paths/${id}`, 'DELETE');
};

export const getPathEnrollments = async (pathId: string): Promise<{ items: import('../training/types').PathEnrollment[]; total: number }> => {
  if (USE_MOCK_API) { await mockDelay(); return { items: [], total: 0 }; }
  const payload = await efetch<Record<string, unknown>>(`/training/paths/${pathId}/enrollments`);
  return {
    items: (payload.items as Record<string, unknown>[] ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id ?? ''),
      pathId: String(r.path_id ?? ''),
      candidateId: String(r.candidate_id ?? ''),
      status: String(r.status ?? 'enrolled') as 'enrolled' | 'in_progress' | 'completed' | 'failed',
      enrolledAt: String(r.enrolled_at ?? ''),
      completedAt: (r.completed_at ?? undefined) as string | undefined,
      progressPct: Number(r.progress_pct ?? 0),
    })),
    total: (payload.total as number) ?? 0,
  };
};
