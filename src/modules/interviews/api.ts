import {fetchJson} from '../../shared/lib/apiClient';
import {USE_MOCK_API, API_BASE_URL, getAuthToken} from '../../shared/lib/runtime';

const isFormData = (v: unknown): v is FormData => typeof FormData !== 'undefined' && v instanceof FormData;

const efetch = async <T>(path: string, method = 'GET', body?: unknown): Promise<T> => {
  const base = USE_MOCK_API ? '' : API_BASE_URL;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${getAuthToken() ?? ''}`,
  };
  // Don't set Content-Type for FormData — browser auto-sets multipart boundary
  if (!isFormData(body)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${base}/functions/v1/embox-api${path}`, {
    method,
    headers,
    ...(body ? { body: isFormData(body) ? body : JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `API error ${res.status}`);
  return data as T;
};
import {supabase} from '../../shared/lib/supabase';
import {
  type InterviewTemplateSummary,
  type InterviewTemplateDetail,
  type InterviewTemplateStatus,
  type InterviewQuestion,
  type InterviewSession,
  type InterviewSessionStatus,
  type InterviewManagementSession,
  type InterviewResult,
  type AnalyticsSummary,
  type ScoreDistribution,
  type PassRateTrend,
  type PositionAnalytics,
  type ScoringConfig,
  type GradeRule,
  type AnswerScoreResult,
  type DimensionAnalysis,
} from './types';

/** Escape hatch for supabase without generated Database types */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (table: string) => supabase.from(table) as any;

// ---------------------------------------------------------------------------
// Response mappers: snake_case API → camelCase frontend types
// ---------------------------------------------------------------------------

const parseJsonField = <T>(val: unknown, fallback: T): T => {
  if (val == null) return fallback;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return val as T;
};

const mapTemplateSummary = (raw: Record<string, unknown>): InterviewTemplateSummary => ({
  id: raw.id as string,
  positionId: (raw.position_id ?? raw.positionId ?? '') as string,
  name: raw.name as string,
  version: (raw.version ?? 1) as number,
  status: (raw.status ?? 'draft') as InterviewTemplateStatus,
  durationMinutes: (raw.duration_minutes ?? raw.durationMinutes ?? 0) as number,
  questionCount: (raw.question_count ?? raw.questionCount ?? 0) as number,
  scoringConfig: parseJsonField<ScoringConfig>(raw.scoring_config ?? raw.scoringConfig, {dimensions: [], baseScore: 0, baseRequirements: []}),
  gradeRules: parseJsonField<GradeRule[]>(raw.grade_rules ?? raw.gradeRules, []),
});

const mapQuestion = (raw: Record<string, unknown>): InterviewQuestion => ({
  id: raw.id as string,
  order: (raw.sort_order ?? raw.order ?? 0) as number,
  title: raw.title as string,
  prompt: raw.prompt as string,
  timeLimitSeconds: (raw.time_limit_seconds ?? raw.timeLimitSeconds ?? 120) as number,
  group: (raw.group_name ?? raw.group ?? '') as string,
  followUps: parseJsonField<string[]>(raw.follow_ups ?? raw.followUps, []),
  scoringGuide: parseJsonField<InterviewQuestion['scoringGuide']>(raw.scoring_guide ?? raw.scoringGuide, {standard: '', rubric: []}),
  linkedDimensions: parseJsonField<string[]>(raw.linked_dimensions ?? raw.linkedDimensions, []),
});

const mapGrade = (grade: string): InterviewResult['grade'] => {
  const g = (grade ?? '').toUpperCase().trim();
  if (g === 'A' || g === 'A+' || g === 'S') return 'excellent';
  if (g === 'B+') return 'good';
  if (g === 'B') return 'qualified';
  if (g === 'C') return 'pending';
  return 'rejected';
};

const mapManagementSession = (raw: Record<string, unknown>): InterviewManagementSession => ({
  id: raw.id as string,
  candidateId: (raw.candidate_id ?? raw.candidateId ?? '') as string,
  candidateName: (raw.candidateName ?? raw.candidate_name ?? '未知') as string,
  candidateEmail: (raw.candidateEmail ?? raw.candidate_email ?? '') as string,
  position: (raw.position_name ?? raw.positionName ?? raw.position ?? '') as string,
  positionId: (raw.position_id ?? raw.positionId ?? '') as string,
  templateId: (raw.template_id ?? raw.templateId ?? '') as string,
  templateName: (raw.templateName ?? raw.template_name ?? '') as string,
  startTime: (raw.start_time ?? raw.startTime ?? raw.created_at ?? new Date().toISOString()) as string,
  status: (raw.status === 'created' ? 'pending' : raw.status === 'submitted' || raw.status === 'scored' ? 'completed' : raw.status === 'in_progress' ? 'in_progress' : raw.status ?? 'pending') as InterviewManagementSession['status'],
  progress: {
    current: (raw.progress_current ?? 0) as number,
    total: (raw.progress_total ?? raw.question_count ?? raw.questionCount ?? 0) as number,
  },
  score: raw.total_score != null ? Number(raw.total_score) : raw.score != null ? Number(raw.score) : undefined,
});

const mapInterviewResult = (raw: Record<string, unknown>): InterviewResult => ({
  id: raw.id as string,
  candidateId: (raw.candidate_id ?? raw.candidateId ?? '') as string,
  candidateName: (raw.candidate_name ?? raw.candidateName ?? '未知') as string,
  candidateEmail: (raw.candidate_email ?? raw.candidateEmail ?? '') as string,
  position: (raw.position ?? '') as string,
  templateName: (raw.template_name ?? raw.templateName ?? '') as string,
  interviewDate: (raw.interview_date ?? raw.interviewDate ?? new Date().toISOString()) as string,
  totalScore: Number(raw.total_score ?? raw.totalScore ?? 0),
  grade: mapGrade((raw.grade ?? '') as string),
  gradeLabel: (raw.grade_label ?? raw.gradeLabel ?? '') as string,
  dimensions: Array.isArray(raw.dimensions)
    ? (typeof raw.dimensions[0] === 'string'
        ? JSON.parse(raw.dimensions[0] as string)
        : raw.dimensions) as InterviewResult['dimensions']
    : [],
  duration: Number(raw.duration ?? 0),
  status: (raw.status ?? 'completed') as InterviewResult['status'],
});

const mapPassRateTrend = (raw: Record<string, unknown>): PassRateTrend => ({
  month: raw.month as string,
  total: (raw.total ?? 0) as number,
  passed: (raw.passed ?? 0) as number,
  rate: Number(raw.passRate ?? raw.rate ?? 0),
});

const mapPositionAnalytics = (raw: Record<string, unknown>): PositionAnalytics => ({
  position: (raw.position ?? '') as string,
  total: (raw.totalInterviews ?? raw.total ?? 0) as number,
  passRate: Number(raw.passRate ?? raw.pass_rate ?? 0),
  averageScore: Number(raw.avgScore ?? raw.averageScore ?? raw.average_score ?? 0),
});

// localStorage keys for persistence
const TEMPLATES_KEY = 'em-box.interview-templates';
const TEMPLATE_DETAILS_KEY = 'em-box.interview-template-details';
const DATA_VERSION_KEY = 'em-box.interview-data-version';
const CURRENT_DATA_VERSION = '1';

// Load from localStorage with version check
const loadFromStorage = <T>(key: string, fallback: T): T => {
  try {
    const version = localStorage.getItem(DATA_VERSION_KEY);
    if (version !== CURRENT_DATA_VERSION) {
      localStorage.removeItem(TEMPLATES_KEY);
      localStorage.removeItem(TEMPLATE_DETAILS_KEY);
      localStorage.setItem(DATA_VERSION_KEY, CURRENT_DATA_VERSION);
      return fallback;
    }
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored) as T;
    }
  } catch (e) {
    console.error(`Failed to load ${key} from localStorage:`, e);
  }
  return fallback;
};

const saveToStorage = <T>(key: string, data: T) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Failed to save ${key} to localStorage:`, e);
  }
};

// In-memory stores initialized from localStorage
let templatesData: InterviewTemplateSummary[] = loadFromStorage<InterviewTemplateSummary[]>(TEMPLATES_KEY, []);
let templateDetailsMap: Record<string, InterviewTemplateDetail> = loadFromStorage<Record<string, InterviewTemplateDetail>>(TEMPLATE_DETAILS_KEY, {});

const persistTemplates = () => saveToStorage(TEMPLATES_KEY, templatesData);
const persistDetails = () => saveToStorage(TEMPLATE_DETAILS_KEY, templateDetailsMap);

// --- Template CRUD ---

export const listInterviewTemplates = async (): Promise<InterviewTemplateSummary[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return templatesData;
  }
  const { data, error } = await supabase.from('interview_templates').select('*');
  if (error) throw new Error(error.message);
  return Array.from(new Map((data ?? []).map(r => [r.id as string, r])).values()).map(mapTemplateSummary);
};

export const getInterviewTemplateDetail = async (
  templateId: string,
): Promise<InterviewTemplateDetail | null> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return templateDetailsMap[templateId] || null;
  }
  const { data: templateData, error: templateError } = await supabase
    .from('interview_templates')
    .select('*')
    .eq('id', templateId)
    .single();
  if (templateError) return null;

  const { data: questionsData, error: questionsError } = await supabase
    .from('interview_questions')
    .select('*')
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true });

  const template = mapTemplateSummary(templateData);
  const questions = (questionsData ?? []).map(mapQuestion);
  return { template, questions };
};

export type CreateInterviewTemplateInput = {
  name: string;
  positionId?: string;
  durationMinutes?: number;
  status?: InterviewTemplateStatus;
  scoringConfig?: ScoringConfig;
  gradeRules?: GradeRule[];
};

export const createInterviewTemplate = async (
  input: CreateInterviewTemplateInput,
): Promise<InterviewTemplateSummary> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const id = `tpl-${Date.now()}`;
    const newTemplate: InterviewTemplateSummary = {
      id,
      positionId: input.positionId || '',
      name: input.name,
      version: 1,
      status: input.status || 'draft',
      durationMinutes: input.durationMinutes || 0,
      questionCount: 0,
      scoringConfig: input.scoringConfig ?? {dimensions: [], baseScore: 0, baseRequirements: []},
      gradeRules: input.gradeRules ?? [],
    };
    templatesData.push(newTemplate);
    templateDetailsMap[id] = {
      template: newTemplate,
      questions: [],
    };
    persistTemplates();
    persistDetails();
    return newTemplate;
  }
  const { data: insertData, error } = await db('interview_templates').insert({
    name: input.name,
    position_id: input.positionId,
    duration_minutes: input.durationMinutes,
    status: input.status,
    scoring_config: input.scoringConfig ? JSON.stringify(input.scoringConfig) : undefined,
    grade_rules: input.gradeRules ? JSON.stringify(input.gradeRules) : undefined,
  }).select().single() as unknown as { data: Record<string, unknown> | null; error: Error | null };
  if (error) throw new Error(error.message);
  if (!insertData) throw new Error('Failed to create template');
  return mapTemplateSummary(insertData as Record<string, unknown>);
};

export const updateInterviewTemplate = async (
  templateId: string,
  input: Partial<Pick<InterviewTemplateSummary, 'name' | 'positionId' | 'status' | 'durationMinutes' | 'scoringConfig' | 'gradeRules'>>,
): Promise<InterviewTemplateSummary | null> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const idx = templatesData.findIndex((t) => t.id === templateId);
    if (idx === -1) return null;
    templatesData[idx] = {
      ...templatesData[idx],
      ...input,
    };
    // Update detail too
    if (templateDetailsMap[templateId]) {
      templateDetailsMap[templateId].template = templatesData[idx];
    }
    persistTemplates();
    persistDetails();
    return templatesData[idx];
  }
  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.positionId !== undefined) updateData.position_id = input.positionId;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.durationMinutes !== undefined) updateData.duration_minutes = input.durationMinutes;
  if (input.scoringConfig !== undefined) updateData.scoring_config = JSON.stringify(input.scoringConfig);
  if (input.gradeRules !== undefined) updateData.grade_rules = JSON.stringify(input.gradeRules);

  const { data, error } = await db('interview_templates')
    .update(updateData)
    .eq('id', templateId)
    .select()
    .single() as unknown as { data: Record<string, unknown> | null; error: Error | null };
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Failed to update template');
  return mapTemplateSummary(data as Record<string, unknown>);
};

export const deleteInterviewTemplate = async (templateId: string): Promise<void> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    templatesData = templatesData.filter((t) => t.id !== templateId);
    delete templateDetailsMap[templateId];
    persistTemplates();
    persistDetails();
    return;
  }
  const { error } = await supabase.from('interview_templates').delete().eq('id', templateId);
  if (error) throw new Error(error.message);
};

// --- Question CRUD ---

export const saveInterviewQuestions = async (
  templateId: string,
  questions: Omit<InterviewQuestion, 'id' | 'order'>[],
): Promise<InterviewQuestion[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const detail = templateDetailsMap[templateId];
    if (!detail) return [];

    const savedQuestions: InterviewQuestion[] = questions.map((q, i) => ({
      id: `q-${Date.now()}-${i}`,
      order: i + 1,
      title: q.title,
      prompt: q.prompt,
      timeLimitSeconds: q.timeLimitSeconds,
      group: q.group ?? '',
      followUps: q.followUps ?? [],
      scoringGuide: q.scoringGuide ?? {standard: '', rubric: []},
      linkedDimensions: q.linkedDimensions ?? [],
    }));

    detail.questions = savedQuestions;
    // Update question count on template
    const tplIdx = templatesData.findIndex((t) => t.id === templateId);
    if (tplIdx !== -1) {
      templatesData[tplIdx].questionCount = savedQuestions.length;
      // Calculate total duration
      const totalSeconds = savedQuestions.reduce((sum, q) => sum + q.timeLimitSeconds, 0);
      templatesData[tplIdx].durationMinutes = Math.ceil(totalSeconds / 60);
    }

    persistTemplates();
    persistDetails();
    return savedQuestions;
  }
  // Delete existing questions and insert new ones
  await supabase.from('interview_questions').delete().eq('template_id', templateId);

  const questionsToInsert = questions.map((q, i) => ({
    template_id: templateId,
    title: q.title,
    prompt: q.prompt,
    sort_order: i + 1,
    time_limit_seconds: q.timeLimitSeconds,
    group_name: q.group ?? '',
    follow_ups: q.followUps ? JSON.stringify(q.followUps) : undefined,
    scoring_guide: q.scoringGuide ? JSON.stringify(q.scoringGuide) : undefined,
    linked_dimensions: q.linkedDimensions ? JSON.stringify(q.linkedDimensions) : undefined,
  }));

  const { data, error } = await db('interview_questions').insert(questionsToInsert).select() as unknown as { data: Record<string, unknown>[] | null; error: Error | null };
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => mapQuestion(row));
};

export const addInterviewQuestion = async (
  templateId: string,
  question: Partial<Omit<InterviewQuestion, 'id' | 'order'>>,
): Promise<InterviewQuestion | null> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const detail = templateDetailsMap[templateId];
    if (!detail) return null;

    const newQ: InterviewQuestion = {
      id: `q-${Date.now()}`,
      order: detail.questions.length + 1,
      title: question.title ?? '',
      prompt: question.prompt ?? '',
      timeLimitSeconds: question.timeLimitSeconds ?? 120,
      group: question.group ?? '',
      followUps: question.followUps ?? [],
      scoringGuide: question.scoringGuide ?? {standard: '', rubric: []},
      linkedDimensions: question.linkedDimensions ?? [],
    };
    detail.questions.push(newQ);

    // Update template summary
    const tplIdx = templatesData.findIndex((t) => t.id === templateId);
    if (tplIdx !== -1) {
      templatesData[tplIdx].questionCount = detail.questions.length;
      const totalSeconds = detail.questions.reduce((sum, q) => sum + q.timeLimitSeconds, 0);
      templatesData[tplIdx].durationMinutes = Math.ceil(totalSeconds / 60);
    }

    persistTemplates();
    persistDetails();
    return newQ;
  }
  const { data, error } = await db('interview_questions').insert({
    template_id: templateId,
    title: question.title,
    prompt: question.prompt,
    time_limit_seconds: question.timeLimitSeconds,
    group_name: question.group ?? '',
    follow_ups: question.followUps ? JSON.stringify(question.followUps) : undefined,
    scoring_guide: question.scoringGuide ? JSON.stringify(question.scoringGuide) : undefined,
    linked_dimensions: question.linkedDimensions ? JSON.stringify(question.linkedDimensions) : undefined,
  }).select().single() as unknown as { data: Record<string, unknown> | null; error: Error | null };
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Failed to save question');
  return mapQuestion(data as Record<string, unknown>);
};

export const updateInterviewQuestion = async (
  templateId: string,
  questionId: string,
  input: Partial<Omit<InterviewQuestion, 'id' | 'order'>>,
): Promise<InterviewQuestion | null> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const detail = templateDetailsMap[templateId];
    if (!detail) return null;

    const qIdx = detail.questions.findIndex((q) => q.id === questionId);
    if (qIdx === -1) return null;

    detail.questions[qIdx] = {...detail.questions[qIdx], ...input};

    // Update duration
    const tplIdx = templatesData.findIndex((t) => t.id === templateId);
    if (tplIdx !== -1) {
      const totalSeconds = detail.questions.reduce((sum, q) => sum + q.timeLimitSeconds, 0);
      templatesData[tplIdx].durationMinutes = Math.ceil(totalSeconds / 60);
    }

    persistTemplates();
    persistDetails();
    return detail.questions[qIdx];
  }
  const updateData: Record<string, unknown> = {};
  if (input.title !== undefined) updateData.title = input.title;
  if (input.prompt !== undefined) updateData.prompt = input.prompt;
  if (input.timeLimitSeconds !== undefined) updateData.time_limit_seconds = input.timeLimitSeconds;
  if (input.group !== undefined) updateData.group_name = input.group;
  if (input.followUps !== undefined) updateData.follow_ups = JSON.stringify(input.followUps);
  if (input.scoringGuide !== undefined) updateData.scoring_guide = JSON.stringify(input.scoringGuide);
  if (input.linkedDimensions !== undefined) updateData.linked_dimensions = JSON.stringify(input.linkedDimensions);

  const { data, error } = await db('interview_questions')
    .update(updateData)
    .eq('id', questionId)
    .select()
    .single() as unknown as { data: Record<string, unknown> | null; error: Error | null };
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Failed to update question');
  return mapQuestion(data as Record<string, unknown>);
};

export const deleteInterviewQuestion = async (
  templateId: string,
  questionId: string,
): Promise<void> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const detail = templateDetailsMap[templateId];
    if (!detail) return;

    detail.questions = detail.questions.filter((q) => q.id !== questionId);
    // Re-order
    detail.questions.forEach((q, i) => { q.order = i + 1; });

    // Update template summary
    const tplIdx = templatesData.findIndex((t) => t.id === templateId);
    if (tplIdx !== -1) {
      templatesData[tplIdx].questionCount = detail.questions.length;
      const totalSeconds = detail.questions.reduce((sum, q) => sum + q.timeLimitSeconds, 0);
      templatesData[tplIdx].durationMinutes = Math.ceil(totalSeconds / 60);
    }

    persistTemplates();
    persistDetails();
    return;
  }
  const { error } = await supabase.from('interview_questions').delete().eq('id', questionId);
  if (error) throw new Error(error.message);
};

// --- Session ---

export const getInterviewSession = async (sessionId: string): Promise<InterviewSession | null> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return null;
  }
  const { data, error } = await supabase
    .from('interview_sessions')
    .select('*')
    .eq('id', sessionId)
    .single() as { data: Record<string, unknown> | null; error: Error | null };
  if (error) return null;
  if (!data) return null;
  return {
    id: data.id as string,
    candidateId: (data.candidate_id ?? data.candidateId ?? '') as string,
    templateId: (data.template_id ?? data.templateId ?? '') as string,
    status: (data.status ?? 'created') as InterviewSessionStatus,
    startedAt: (data.started_at ?? data.startedAt) as string | undefined,
    submittedAt: (data.submitted_at ?? data.submittedAt) as string | undefined,
  };
};

export const createInterviewSession = async (
  candidateId: string,
  templateId: string,
): Promise<InterviewSession> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return {
      id: `sess-${Date.now()}`,
      candidateId,
      templateId,
      status: 'created',
    };
  }
  const { data, error } = await db('interview_sessions').insert({
    candidate_id: candidateId,
    template_id: templateId,
    status: 'created',
  }).select().single() as unknown as { data: Record<string, unknown> | null; error: Error | null };
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Failed to create session');
  return {
    id: data.id as string,
    candidateId: (data.candidate_id ?? data.candidateId ?? candidateId) as string,
    templateId: (data.template_id ?? data.templateId ?? templateId) as string,
    status: (data.status ?? 'created') as InterviewSessionStatus,
    startedAt: (data.started_at ?? data.startedAt) as string | undefined,
    submittedAt: (data.submitted_at ?? data.submittedAt) as string | undefined,
  };
};

export const updateSessionStatus = async (
  sessionId: string,
  status: InterviewSessionStatus,
): Promise<InterviewSession | null> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return {id: sessionId, candidateId: '', templateId: '', status};
  }
  const { data, error } = await db('interview_sessions')
    .update({ status })
    .eq('id', sessionId)
    .select()
    .single() as unknown as { data: Record<string, unknown> | null; error: Error | null };
  if (error || !data || !data.id) return null;
  return {
    id: data.id as string,
    candidateId: (data.candidate_id ?? data.candidateId ?? '') as string,
    templateId: (data.template_id ?? data.templateId ?? '') as string,
    status: (data.status ?? status) as InterviewSessionStatus,
    startedAt: (data.started_at ?? data.startedAt) as string | undefined,
    submittedAt: (data.submitted_at ?? data.submittedAt) as string | undefined,
  };
};

export const deleteInterviewSession = async (sessionId: string): Promise<void> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return;
  }
  const { error } = await supabase.from('interview_sessions').delete().eq('id', sessionId);
  if (error) throw new Error(error.message);
};

export const updateInterviewResultStatus = async (
  resultId: string,
  status: 'completed' | 'reviewed',
): Promise<InterviewResult | null> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return null;
  }
  const { data, error } = await db('interview_results')
    .update({ status })
    .eq('id', resultId)
    .select()
    .single() as unknown as { data: Record<string, unknown> | null; error: Error | null };
  if (error) throw new Error(error.message);
  return mapInterviewResult(data as Record<string, unknown>);
};

// --- Management, Results, Analytics ---

// Mock data for sessions (empty for production — populated by real API)
const MOCK_SESSIONS: InterviewManagementSession[] = [];

// Mock data for results (empty for production — populated by real API)
const MOCK_RESULTS: InterviewResult[] = [];

// Mock data for analytics (zero defaults — populated by real API)
const MOCK_ANALYTICS_SUMMARY: AnalyticsSummary = {
  totalInterviews: 0,
  completedInterviews: 0,
  passRate: 0,
  averageScore: 0,
  thisWeekCount: 0,
  thisMonthCount: 0,
  momTrend: { totalChange: 0, completedChange: 0, avgScoreChange: 0 },
};

const MOCK_SCORE_DISTRIBUTION: ScoreDistribution[] = [];

const MOCK_PASS_RATE_TREND: PassRateTrend[] = [];

const MOCK_POSITION_ANALYTICS: PositionAnalytics[] = [];

export const listManagementSessions = async (): Promise<InterviewManagementSession[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return MOCK_SESSIONS;
  }
  const { data, error } = await supabase
    .from('interview_sessions')
    .select(`
      id,
      candidate_id,
      candidate_name,
      candidate_email,
      position_name,
      position_id,
      template_id,
      template_name,
      start_time,
      status,
      progress_current,
      progress_total,
      total_score
    `)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return Array.from(new Map((data ?? []).map(r => [r.id as string, r])).values()).map(mapManagementSession);
};

export const listInterviewResults = async (): Promise<InterviewResult[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return Array.from(new Map(mockResultsData.map(r => [r.id, r])).values());
  }
  const { data, error } = await supabase.from('interview_results').select('*').order('interview_date', { ascending: false });
  if (error) throw new Error(error.message);
  return Array.from(new Map((data ?? []).map(r => [r.id as string, r])).values()).map(mapInterviewResult);
};

// Mutable copy of mock results that new results get pushed into
let mockResultsData: InterviewResult[] = [...MOCK_RESULTS];

export type CreateInterviewResultInput = {
  sessionId?: string;
  candidateId?: string;
  candidateName: string;
  candidateEmail: string;
  position: string;
  templateName: string;
  totalScore: number;
  grade: InterviewResult['grade'];
  gradeLabel: string;
  dimensions: { name: string; score: number; weight: number }[];
  duration: number;
};

export const createInterviewResult = async (input: CreateInterviewResultInput): Promise<InterviewResult> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const result: InterviewResult = {
      id: `r-${Date.now()}`,
      candidateId: `c-${Date.now()}`,
      candidateName: input.candidateName,
      candidateEmail: input.candidateEmail,
      position: input.position,
      templateName: input.templateName,
      interviewDate: new Date().toISOString(),
      totalScore: input.totalScore,
      grade: input.grade,
      gradeLabel: input.gradeLabel,
      dimensions: input.dimensions,
      duration: input.duration,
      status: 'completed',
    };
    mockResultsData.unshift(result);
    return result;
  }
  const { data, error } = await db('interview_results').insert({
    session_id: input.sessionId,
    candidate_id: input.candidateId,
    candidate_name: input.candidateName,
    candidate_email: input.candidateEmail,
    position: input.position,
    template_name: input.templateName,
    total_score: input.totalScore,
    grade: input.grade,
    grade_label: input.gradeLabel,
    dimensions: JSON.stringify(input.dimensions),
    duration: input.duration,
  }).select().single() as unknown as { data: Record<string, unknown> | null; error: Error | null };
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Failed to create result');
  return mapInterviewResult(data as Record<string, unknown>);
};

const mapAnalyticsSummary = (raw: Record<string, unknown>): AnalyticsSummary => ({
  totalInterviews: Number(raw.totalInterviews ?? 0),
  completedInterviews: Number(raw.completed ?? 0),
  passRate: Number(raw.passRate ?? 0),
  averageScore: Number(raw.avgScore ?? 0),
  thisWeekCount: Number(raw.thisWeekCount ?? raw.this_week_count ?? 0),
  thisMonthCount: Number(raw.thisMonthCount ?? raw.this_month_count ?? 0),
  momTrend: {
    totalChange: Number(((raw.momTrend as Record<string, unknown>)?.totalChange) ?? 0),
    completedChange: Number(((raw.momTrend as Record<string, unknown>)?.completedChange) ?? 0),
    avgScoreChange: Number(((raw.momTrend as Record<string, unknown>)?.avgScoreChange) ?? 0),
  },
});

export const getAnalyticsSummary = async (timeRange = 'all'): Promise<AnalyticsSummary> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return MOCK_ANALYTICS_SUMMARY;
  }
  const raw = await efetch<Record<string, unknown>>(`/analytics/interview/summary?timeRange=${encodeURIComponent(timeRange)}`);
  return mapAnalyticsSummary(raw);
};

export const getScoreDistribution = async (timeRange = 'all'): Promise<ScoreDistribution[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return MOCK_SCORE_DISTRIBUTION;
  }
  return efetch<ScoreDistribution[]>(`/analytics/interview/score-distribution?timeRange=${encodeURIComponent(timeRange)}`);
};

export const getPassRateTrend = async (timeRange = 'all'): Promise<PassRateTrend[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return MOCK_PASS_RATE_TREND;
  }
  const { data, error } = await supabase
    .from('interview_results')
    .select('interview_date, grade')
    .order('interview_date', { ascending: false });
  if (error) throw new Error(error.message);
  // Group by month and calculate pass rate
  const monthlyData: Record<string, { total: number; passed: number }> = {};
  for (const row of (data ?? [])) {
    const month = (row.interview_date ?? '').substring(0, 7);
    if (!monthlyData[month]) monthlyData[month] = { total: 0, passed: 0 };
    monthlyData[month].total++;
    if ((row.grade ?? '').toUpperCase() === 'A' || (row.grade ?? '').toUpperCase() === 'B+') {
      monthlyData[month].passed++;
    }
  }
  return Object.entries(monthlyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, stats]) => ({
      month,
      total: stats.total,
      passed: stats.passed,
      rate: stats.total > 0 ? stats.passed / stats.total : 0,
    }));
};

export const getPositionAnalytics = async (timeRange = 'all'): Promise<PositionAnalytics[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return MOCK_POSITION_ANALYTICS;
  }
  const { data, error } = await supabase
    .from('interview_results')
    .select('position, total_score, grade')
    .order('interview_date', { ascending: false });
  if (error) throw new Error(error.message);
  const positionData: Record<string, { total: number; scores: number[]; passed: number }> = {};
  for (const row of (data ?? [])) {
    const pos = (row.position ?? '') as string;
    if (!pos) continue;
    if (!positionData[pos]) positionData[pos] = { total: 0, scores: [], passed: 0 };
    positionData[pos].total++;
    positionData[pos].scores.push(Number(row.total_score ?? 0));
    if ((row.grade ?? '').toUpperCase() === 'A' || (row.grade ?? '').toUpperCase() === 'B+') {
      positionData[pos].passed++;
    }
  }
  return Object.entries(positionData).map(([position, stats]) => ({
    position,
    total: stats.total,
    passRate: stats.total > 0 ? stats.passed / stats.total : 0,
    averageScore: stats.scores.length > 0
      ? stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length
      : 0,
  }));
};

export const getDimensionAnalysis = async (timeRange = 'all'): Promise<DimensionAnalysis> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return {
      dimensions: [
        {name: '专业能力', avgScore: 78, maxScore: 100, avgPercent: 78, count: 25},
        {name: '沟通表达', avgScore: 65, maxScore: 100, avgPercent: 65, count: 25},
        {name: '应变能力', avgScore: 72, maxScore: 100, avgPercent: 72, count: 25},
        {name: '综合素质', avgScore: 80, maxScore: 100, avgPercent: 80, count: 25},
      ],
      questions: [
        {questionTitle: '请介绍你最有挑战的项目', avgScore: 62, maxScore: 100, belowThresholdCount: 8, totalCount: 25},
        {questionTitle: '描述一次你处理冲突的经历', avgScore: 58, maxScore: 100, belowThresholdCount: 12, totalCount: 25},
        {questionTitle: '你为什么选择这个行业', avgScore: 75, maxScore: 100, belowThresholdCount: 4, totalCount: 25},
      ],
      weakestDimension: '沟通表达',
      hardestQuestion: '描述一次你处理冲突的经历',
    };
  }
  return efetch<DimensionAnalysis>(`/analytics/interview/dimension-analysis?timeRange=${encodeURIComponent(timeRange)}`);
};

// ---------------------------------------------------------------------------
// AI Interview Scoring
// ---------------------------------------------------------------------------

const mapAnswerScore = (raw: Record<string, unknown>): AnswerScoreResult => ({
  id: raw.id as string,
  sessionId: (raw.session_id ?? raw.sessionId ?? '') as string,
  questionId: (raw.question_id ?? raw.questionId ?? null) as string | null,
  questionTitle: (raw.question_title ?? raw.questionTitle ?? '') as string,
  questionPrompt: (raw.question_prompt ?? raw.questionPrompt ?? '') as string,
  audioDuration: (raw.audio_duration ?? raw.audioDuration ?? 0) as number,
  transcript: (raw.transcript ?? null) as string | null,
  score: raw.score != null ? Number(raw.score) : null,
  maxScore: raw.max_score != null ? Number(raw.max_score) : raw.maxScore != null ? Number(raw.maxScore) : null,
  scoreReasoning: (raw.score_reasoning ?? raw.scoreReasoning ?? null) as string | null,
  dimensionScores: parseJsonField<Array<{dimension: string; score: number; maxScore: number; reasoning: string}>>(raw.dimension_scores ?? raw.dimensionScores, []),
  status: (raw.status ?? 'pending') as AnswerScoreResult['status'],
  errorMessage: (raw.error_message ?? raw.errorMessage ?? null) as string | null,
});

export const submitAnswerAudio = async (params: {
  sessionId: string;
  questionId: string;
  questionTitle: string;
  questionPrompt: string;
  audioDuration: number;
  scoringGuide?: Record<string, unknown>;
  linkedDimensions?: string[];
  audioBlob: Blob;
  transcript?: string;
}): Promise<AnswerScoreResult> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 2000));
    return {
      id: `as-${Date.now()}`,
      sessionId: params.sessionId,
      questionId: params.questionId,
      questionTitle: params.questionTitle,
      questionPrompt: params.questionPrompt,
      audioDuration: params.audioDuration,
      transcript: '[模拟转录] 候选人对该问题进行了回答，表达了自己的观点和经验。',
      score: 70 + Math.floor(Math.random() * 25),
      maxScore: 100,
      scoreReasoning: '候选人回答了问题的核心要点，表达清晰，逻辑性较强。',
      dimensionScores: [],
      status: 'completed',
      errorMessage: null,
    };
  }
  const formData = new FormData();
  formData.append('audio', params.audioBlob, 'answer.webm');
  formData.append('sessionId', params.sessionId);
  formData.append('questionId', params.questionId);
  formData.append('questionTitle', params.questionTitle);
  formData.append('questionPrompt', params.questionPrompt);
  formData.append('audioDuration', String(params.audioDuration));
  if (params.scoringGuide) formData.append('scoringGuide', JSON.stringify(params.scoringGuide));
  if (params.linkedDimensions) formData.append('linkedDimensions', JSON.stringify(params.linkedDimensions));
  if (params.transcript) formData.append('transcript', params.transcript);

  const data = await efetch<Record<string, unknown>>('/interview-scoring/transcribe-and-score', 'POST', formData);
  return mapAnswerScore(data);
};

export const getSessionAnswerScores = async (sessionId: string): Promise<AnswerScoreResult[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return [];
  }
  const { data, error } = await supabase
    .from('interview_answer_scores')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapAnswerScore);
};

export const aggregateInterviewResults = async (sessionId: string): Promise<InterviewResult> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 1500));
    return {
      id: `r-${Date.now()}`,
      candidateId: `c-mock`,
      candidateName: '当前候选人',
      candidateEmail: 'candidate@example.com',
      position: '未指定岗位',
      templateName: 'AI面试',
      interviewDate: new Date().toISOString(),
      totalScore: 75 + Math.floor(Math.random() * 15),
      grade: 'good',
      gradeLabel: '表现良好，建议进入下一轮',
      dimensions: [
        {name: '专业能力', score: 80, weight: 30},
        {name: '沟通表达', score: 78, weight: 25},
        {name: '应变能力', score: 75, weight: 25},
        {name: '综合素质', score: 82, weight: 20},
      ],
      duration: 10,
      status: 'completed',
    };
  }
  const data = await efetch<Record<string, unknown>>('/interview-scoring/aggregate/', 'POST', {
    sessionId,
  });
  return mapInterviewResult(data);
};

export const exportInterviewResultsCsv = async (): Promise<void> => {
  if (USE_MOCK_API) {
    throw new Error('导出功能需要连接后端服务');
  }
  const data = await efetch<{ csvContent: string }>('/analytics/interview/export-csv');
  const blob = new Blob([data.csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'interview_results.csv';
  a.click();
  URL.revokeObjectURL(url);
};