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
  type ConversationSession,
  type ConversationMessage,
  type ConversationScore,
  type CandidateQuestion,
} from './types';

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
  interviewMode: (raw.interview_mode ?? raw.interviewMode ?? 'audio_sequential') as InterviewTemplateSummary['interviewMode'],
  conversationalConfig: parseJsonField<InterviewTemplateSummary['conversationalConfig']>(raw.conversational_config ?? raw.conversationalConfig, undefined),
});

/**
 * Normalize followUps from the database. The DB stores either:
 * - Array of strings: `["追问1", "追问2"]`
 * - Array of objects: `[{prompt: "...", condition: "..."}]`
 * Always return an array of strings (the prompt text).
 */
const normalizeFollowUps = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw.map(item => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object' && 'prompt' in item) return String((item as Record<string, unknown>).prompt ?? '');
    return String(item);
  });
};

const mapQuestion = (raw: Record<string, unknown>): InterviewQuestion => ({
  id: raw.id as string,
  order: (raw.sort_order ?? raw.order ?? 0) as number,
  title: raw.title as string,
  prompt: raw.prompt as string,
  timeLimitSeconds: (raw.time_limit_seconds ?? raw.timeLimitSeconds ?? 120) as number,
  group: (raw.group_name ?? raw.group ?? '') as string,
  followUps: normalizeFollowUps(parseJsonField<unknown>(raw.follow_ups ?? raw.followUps, [])),
  scoringGuide: parseJsonField<InterviewQuestion['scoringGuide']>(raw.scoring_guide ?? raw.scoringGuide, {standard: '', rubric: []}),
  linkedDimensions: parseJsonField<string[]>(raw.linked_dimensions ?? raw.linkedDimensions, []),
  questionType: (raw.question_type ?? raw.questionType ?? 'core') as InterviewQuestion['questionType'],
  triggerCondition: parseJsonField<Record<string, unknown>>(raw.trigger_condition ?? raw.triggerCondition, {}),
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
  const data = await efetch<Record<string, unknown>[]>('/interviews/templates');
  return Array.from(new Map((data ?? []).map(r => [r.id as string, r])).values()).map(mapTemplateSummary);
};

export const getInterviewTemplateDetail = async (
  templateId: string,
): Promise<InterviewTemplateDetail | null> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return templateDetailsMap[templateId] || null;
  }
  const templateData = await efetch<Record<string, unknown>>(`/interviews/templates?id=${encodeURIComponent(templateId)}`);
  if (!templateData?.id) return null;

  const questionsData = await efetch<Record<string, unknown>[]>(`/interviews/questions?template_id=${encodeURIComponent(templateId)}`);

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
      interviewMode: 'audio_sequential',
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
  const data = await efetch<Record<string, unknown>>('/interviews/templates', 'POST', {
    name: input.name,
    positionId: input.positionId,
    durationMinutes: input.durationMinutes,
    status: input.status,
    scoringConfig: input.scoringConfig,
    gradeRules: input.gradeRules,
  });
  return mapTemplateSummary(data);
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
  const data = await efetch<Record<string, unknown>>('/interviews/templates', 'PATCH', {
    id: templateId,
    name: input.name,
    positionId: input.positionId,
    status: input.status,
    durationMinutes: input.durationMinutes,
    scoringConfig: input.scoringConfig,
    gradeRules: input.gradeRules,
  });
  return mapTemplateSummary(data);
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
  await efetch('/interviews/templates', 'DELETE', { id: templateId });
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
  const data = await efetch<Record<string, unknown>[]>('/interviews/questions', 'POST', {
    templateId,
    questions: questions.map((q, i) => ({
      title: q.title,
      prompt: q.prompt,
      timeLimitSeconds: q.timeLimitSeconds,
      group: q.group ?? '',
      followUps: q.followUps ?? [],
      scoringGuide: q.scoringGuide ?? {standard: '', rubric: []},
      linkedDimensions: q.linkedDimensions ?? [],
    })),
  });
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
  const data = await efetch<Record<string, unknown>>('/interviews/questions', 'POST', {
    templateId,
    title: question.title,
    prompt: question.prompt,
    timeLimitSeconds: question.timeLimitSeconds,
    group: question.group ?? '',
    followUps: question.followUps ?? [],
    scoringGuide: question.scoringGuide ?? {standard: '', rubric: []},
    linkedDimensions: question.linkedDimensions ?? [],
  });
  return mapQuestion(data);
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
  const data = await efetch<Record<string, unknown>>('/interviews/questions', 'PATCH', {
    id: questionId,
    title: input.title,
    prompt: input.prompt,
    timeLimitSeconds: input.timeLimitSeconds,
    group: input.group,
    followUps: input.followUps,
    scoringGuide: input.scoringGuide,
    linkedDimensions: input.linkedDimensions,
  });
  return mapQuestion(data);
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
  await efetch('/interviews/questions', 'DELETE', { id: questionId });
};

// --- Session ---

export const getInterviewSession = async (sessionId: string): Promise<InterviewSession | null> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return null;
  }
  const data = await efetch<Record<string, unknown>>(`/interviews/sessions?id=${encodeURIComponent(sessionId)}`);
  if (!data?.id) return null;
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
  const data = await efetch<Record<string, unknown>>('/interviews/sessions', 'POST', {
    candidateId,
    templateId,
  });
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
  const data = await efetch<Record<string, unknown>>('/interviews/sessions', 'PATCH', { id: sessionId, status });
  if (!data || !data.id) return null;
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
  await efetch('/interviews/sessions', 'DELETE', { id: sessionId });
};

export const updateInterviewResultStatus = async (
  resultId: string,
  status: 'completed' | 'reviewed',
): Promise<InterviewResult | null> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return null;
  }
  const data = await efetch<Record<string, unknown>>('/interviews/results', 'PATCH', { id: resultId, status });
  return mapInterviewResult(data);
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
  const data = await efetch<Record<string, unknown>[]>('/interviews/sessions');
  return Array.from(new Map((data ?? []).map(r => [r.id as string, r])).values()).map(mapManagementSession);
};

export const listInterviewResults = async (): Promise<InterviewResult[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return Array.from(new Map(mockResultsData.map(r => [r.id, r])).values());
  }
  const data = await efetch<Record<string, unknown>[]>('/interviews/results');
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
  const data = await efetch<Record<string, unknown>>('/interviews/results', 'POST', {
    sessionId: input.sessionId,
    candidateId: input.candidateId,
    candidateName: input.candidateName,
    candidateEmail: input.candidateEmail,
    position: input.position,
    templateName: input.templateName,
    totalScore: input.totalScore,
    grade: input.grade,
    gradeLabel: input.gradeLabel,
    dimensions: input.dimensions,
    duration: input.duration,
  });
  return mapInterviewResult(data);
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
  const data = await efetch<Record<string, unknown>[]>('/interviews/results');
  // Group by month and calculate pass rate
  const monthlyData: Record<string, { total: number; passed: number }> = {};
  for (const row of (data ?? [])) {
    const month = ((row.interview_date ?? row.interviewDate ?? '') as string).substring(0, 7);
    if (!monthlyData[month]) monthlyData[month] = { total: 0, passed: 0 };
    monthlyData[month].total++;
    const grade = String(row.grade ?? '').toUpperCase();
    if (grade === 'A' || grade === 'B+') {
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
  const data = await efetch<Record<string, unknown>[]>('/interviews/results');
  const positionData: Record<string, { total: number; scores: number[]; passed: number }> = {};
  for (const row of (data ?? [])) {
    const pos = (row.position ?? '') as string;
    if (!pos) continue;
    if (!positionData[pos]) positionData[pos] = { total: 0, scores: [], passed: 0 };
    positionData[pos].total++;
    positionData[pos].scores.push(Number(row.total_score ?? row.totalScore ?? 0));
    const grade = String(row.grade ?? '').toUpperCase();
    if (grade === 'A' || grade === 'B+') {
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
  const data = await efetch<Record<string, unknown>[]>(`/interviews/answer-scores?session_id=${encodeURIComponent(sessionId)}`);
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

// ============================================================================
// Conversational Interview API
// ============================================================================

/** Create or resume a conversational interview session */
export const createConvSession = async (
  sessionId: string,
  action: 'start' | 'resume' = 'start',
): Promise<ConversationSession> => {
  if (USE_MOCK_API) {
    const mockMessages: ConversationMessage[] = [
      {
        id: 'mock-1', convSessionId: 'mock-conv-1', role: 'interviewer',
        content: '你好！欢迎参加今天的面试。我是 AI 面试官小e，很高兴认识你。请先简单介绍一下你自己。',
        messageType: 'icebreaker', questionId: null, createdAt: new Date().toISOString(),
      },
    ];
    return {
      convSessionId: 'mock-conv-1', status: 'active', currentTopic: '自我介绍',
      topicsCovered: [], messages: mockMessages, isResumed: false,
      config: {
        maxDurationMinutes: 30, icebreakerMessage: '', closingMessage: '',
        allowCandidateQuestions: true, candidateQuestionPrompt: '你有什么问题想问吗？',
        maxFollowUpsPerTopic: 2, transcriptLanguage: 'zh-CN',
      },
    };
  }
  return efetch<ConversationSession>('/conversational-interview/sessions', 'POST', { sessionId, action });
};

/** Send a message in a conversational interview and get AI reply */
export const sendConversationMessage = async (
  convSessionId: string,
  content: string,
): Promise<{
  message: ConversationMessage;
  conversationState: { currentTopic: string | null; topicsCovered: number; shouldClose: boolean };
}> => {
  if (USE_MOCK_API) {
    return {
      message: {
        id: 'mock-ai-msg', convSessionId, role: 'interviewer',
        content: '感谢你的介绍！这是一个模拟的 AI 回复。在实际面试中，AI 会根据你的回答进行追问或过渡到下一个话题。',
        messageType: 'text', questionId: null, createdAt: new Date().toISOString(),
      },
      conversationState: { currentTopic: '工作经验', topicsCovered: 1, shouldClose: false },
    };
  }
  return efetch('/conversational-interview/messages', 'POST', { convSessionId, content });
};

/**
 * Stream AI response via SSE (Server-Sent Events).
 * Returns a cleanup function to abort the stream.
 */
export const streamConversationMessage = (
  convSessionId: string,
  content: string,
  onToken: (token: string) => void,
  onDone: (data: { messageId: string | null; conversationState: { currentTopic: string | null; shouldClose: boolean } }) => void,
  onError: (error: string) => void,
): () => void => {
  const base = USE_MOCK_API ? '' : API_BASE_URL;
  const params = new URLSearchParams({ convSessionId, content });
  const url = `${base}/functions/v1/embox-api/conversational-interview/messages/stream?${params}`;

  const controller = new AbortController();

  fetch(url, {
    headers: { Authorization: `Bearer ${getAuthToken() ?? ''}` },
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok) {
      onError(`HTTP ${res.status}`);
      return;
    }
    const reader = res.body?.getReader();
    if (!reader) { onError('No response body'); return; }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: token')) {
          const dataLine = lines[lines.indexOf(line) + 1];
          if (dataLine?.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(dataLine.slice(6));
              if (parsed.text) onToken(parsed.text);
            } catch { /* skip malformed events */ }
          }
        } else if (line.startsWith('event: done')) {
          const dataLine = lines[lines.indexOf(line) + 1];
          if (dataLine?.startsWith('data: ')) {
            try {
              onDone(JSON.parse(dataLine.slice(6)));
            } catch { onDone({ messageId: null, conversationState: { currentTopic: null, shouldClose: false } }); }
          }
        } else if (line.startsWith('event: error')) {
          const dataLine = lines[lines.indexOf(line) + 1];
          if (dataLine?.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(dataLine.slice(6));
              onError(parsed.message || 'Stream error');
            } catch { onError('Stream error'); }
          }
        }
      }
    }
  }).catch((e: Error) => {
    if (e.name !== 'AbortError') onError(e.message);
  });

  return () => controller.abort();
};

/** Complete a conversational interview session */
export const completeConversation = async (
  convSessionId: string,
): Promise<{ status: string; messageCount: number; durationMinutes: number }> => {
  if (USE_MOCK_API) {
    return { status: 'completed', messageCount: 12, durationMinutes: 15 };
  }
  return efetch('/conversational-interview/complete', 'POST', { convSessionId });
};

/** Score a completed conversational interview */
export const scoreConversation = async (
  convSessionId: string,
): Promise<ConversationScore> => {
  if (USE_MOCK_API) {
    return {
      scoreId: 'mock-score-1', resultId: 'mock-result-1', overallScore: 78,
      grade: 'qualified', gradeLabel: '合格',
      dimensionScores: [
        { dimension: '专业能力', score: 22, maxScore: 30, reasoning: '基础知识扎实', evidence: ['面试记录#3'] },
        { dimension: '沟通表达', score: 20, maxScore: 25, reasoning: '表达清晰', evidence: ['面试记录#1'] },
        { dimension: '逻辑思维', score: 16, maxScore: 20, reasoning: '逻辑较好', evidence: ['面试记录#5'] },
        { dimension: '综合素质', score: 20, maxScore: 25, reasoning: '整体不错', evidence: ['面试记录#7'] },
      ],
      strengths: [{ title: '沟通能力强', description: '表达清晰有条理', evidence: ['#1'] }],
      weaknesses: [{ title: '专业深度不足', description: '对某些专业领域理解较浅', evidence: ['#3'] }],
      summary: '候选人整体表现良好，建议进入下一轮面试。',
      status: 'completed',
    };
  }
  return efetch<ConversationScore>('/conversational-interview/score', 'POST', { convSessionId });
};

/** Candidate asks a question about the company/role */
export const askCandidateQuestion = async (
  convSessionId: string,
  question: string,
): Promise<{ questionId: string; message: ConversationMessage }> => {
  if (USE_MOCK_API) {
    return {
      questionId: 'mock-q-1',
      message: {
        id: 'mock-ai-qa', convSessionId, role: 'interviewer',
        content: '这是一个很好的问题！关于这个岗位，我们提供有竞争力的薪资和良好的发展空间。具体细节建议与 HR 进一步沟通。',
        messageType: 'candidate_question', questionId: null, createdAt: new Date().toISOString(),
      },
    };
  }
  return efetch('/conversational-interview/candidate-question', 'POST', { convSessionId, question });
};