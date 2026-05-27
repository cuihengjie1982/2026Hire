import {fetchJson, getItemsFromPayload} from '../../shared/lib/apiClient';
import {USE_MOCK_API} from '../../shared/lib/runtime';
import {
  type EmployeeProfile,
  type PerformanceRecord,
  type CompetencyModel,
  type EmployeeStats,
  type CreateEmployeeInput,
  type CreatePerformanceInput,
} from './types';

// ─── Mappers ────────────────────────────────────────────────────────────

const mapEmployee = (raw: Record<string, unknown>): EmployeeProfile => ({
  id: String(raw.id ?? ''),
  candidateId: String(raw.candidate_id ?? raw.candidateId ?? ''),
  name: String(raw.name ?? ''),
  email: String(raw.email ?? ''),
  phone: String(raw.phone ?? ''),
  status: String(raw.status ?? 'active') as EmployeeProfile['status'],
  hireDate: String(raw.hire_date ?? raw.hireDate ?? ''),
  terminationDate: raw.termination_date ? String(raw.termination_date) : undefined,
  terminationReason: raw.termination_reason ? String(raw.termination_reason) : undefined,
  projectId: raw.project_id ? String(raw.project_id) : undefined,
  positionId: raw.position_id ? String(raw.position_id) : undefined,
  department: raw.department ? String(raw.department) : undefined,
  manager: raw.manager ? String(raw.manager) : undefined,
  education: raw.education ? String(raw.education) : undefined,
  major: raw.major ? String(raw.major) : undefined,
  certifications: raw.certifications as {name: string; date?: string}[] | undefined,
  skills: raw.skills as {name: string; level: number}[] | undefined,
  personality: raw.personality as Record<string, unknown> | undefined,
  commuteDistance: raw.commute_distance as number | undefined,
  familyStatus: raw.family_status ? String(raw.family_status) : undefined,
  interviewScore: raw.interview_score as number | undefined,
  interviewGrade: raw.interview_grade ? String(raw.interview_grade) : undefined,
  interviewWeaknesses: raw.interview_weaknesses as string[] | undefined,
  avgPerformance: raw.avg_performance as number | undefined,
  retentionDays: raw.retention_days as number | undefined,
  trainingScore: raw.training_score as number | undefined,
  createdAt: String(raw.created_at ?? ''),
  updatedAt: String(raw.updated_at ?? ''),
  resumeScore: raw.resume_score as number | undefined,
  resumeGrade: raw.resume_grade ? String(raw.resume_grade) : undefined,
});

const mapPerformance = (raw: Record<string, unknown>): PerformanceRecord => ({
  id: String(raw.id ?? ''),
  employeeId: String(raw.employee_id ?? raw.employeeId ?? ''),
  period: String(raw.period ?? ''),
  score: Number(raw.score ?? 0),
  rating: raw.rating ? String(raw.rating) : undefined,
  dimensions: (raw.dimensions ?? []) as {dimension: string; score: number; note?: string}[],
  strengths: (raw.strengths ?? []) as string[],
  weaknesses: (raw.weaknesses ?? []) as string[],
  notes: raw.notes ? String(raw.notes) : undefined,
  reviewer: raw.reviewer ? String(raw.reviewer) : undefined,
  createdAt: String(raw.created_at ?? ''),
});

const mapCompetencyModel = (raw: Record<string, unknown>): CompetencyModel => ({
  id: String(raw.id ?? ''),
  positionId: String(raw.position_id ?? raw.positionId ?? ''),
  positionName: raw.position_name ? String(raw.position_name) : undefined,
  name: String(raw.name ?? ''),
  dimensions: (raw.dimensions ?? []) as {name: string; weight: number; description: string}[],
  sourceType: String(raw.source_type ?? raw.sourceType ?? 'manual') as CompetencyModel['sourceType'],
  derivedFrom: raw.derived_from as CompetencyModel['derivedFrom'],
  version: Number(raw.version ?? 1),
  isActive: Boolean(raw.is_active ?? raw.isActive ?? true),
  createdAt: String(raw.created_at ?? ''),
  updatedAt: String(raw.updated_at ?? ''),
});

// ─── Mock data store ────────────────────────────────────────────────────

let mockEmployees: EmployeeProfile[] = (() => {
  try {
    const r = localStorage.getItem('em-box.mock.employees');
    return r ? JSON.parse(r) : [];
  } catch { return []; }
})();
const saveEmployees = () => localStorage.setItem('em-box.mock.employees', JSON.stringify(mockEmployees));

let mockPerformance: PerformanceRecord[] = (() => {
  try {
    const r = localStorage.getItem('em-box.mock.performance');
    return r ? JSON.parse(r) : [];
  } catch { return []; }
})();
const savePerformance = () => localStorage.setItem('em-box.mock.performance', JSON.stringify(mockPerformance));

let mockCompetencyModels: CompetencyModel[] = (() => {
  try {
    const r = localStorage.getItem('em-box.mock.competency');
    return r ? JSON.parse(r) : [];
  } catch { return []; }
})();
const saveCompetency = () => localStorage.setItem('em-box.mock.competency', JSON.stringify(mockCompetencyModels));

const mockDelay = () => new Promise<void>(r => setTimeout(r, 200 + Math.random() * 300));

// ─── Employee Profiles ─────────────────────────────────────────────────

export const listEmployees = async (filters?: {
  status?: string;
  projectId?: string;
  positionId?: string;
  page?: number;
  pageSize?: number;
}): Promise<{items: EmployeeProfile[]; total: number; page: number; pageSize: number}> => {
  if (USE_MOCK_API) {
    await mockDelay();
    let filtered = [...mockEmployees];
    if (filters?.status) filtered = filtered.filter(e => e.status === filters.status);
    if (filters?.projectId) filtered = filtered.filter(e => e.projectId === filters.projectId);
    if (filters?.positionId) filtered = filtered.filter(e => e.positionId === filters.positionId);
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 50;
    return {
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
      total: filtered.length, page, pageSize,
    };
  }

  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.projectId) params.set('projectId', filters.projectId);
  if (filters?.positionId) params.set('positionId', filters.positionId);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));

  const qs = params.toString();
  const payload = await fetchJson<Record<string, unknown>>(`/api/employees${qs ? `?${qs}` : ''}`);
  return {
    items: getItemsFromPayload<Record<string, unknown>>(payload).map(mapEmployee),
    total: (payload.total as number) ?? 0,
    page: (payload.page as number) ?? 1,
    pageSize: (payload.pageSize as number) ?? 50,
  };
};

export const getEmployee = async (id: string): Promise<EmployeeProfile> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const emp = mockEmployees.find(e => e.id === id);
    if (!emp) throw new Error('Employee not found');
    return emp;
  }
  const raw = await fetchJson<Record<string, unknown>>(`/api/employees/${id}`);
  return mapEmployee(raw);
};

export const getEmployeeStats = async (): Promise<EmployeeStats> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const active = mockEmployees.filter(e => e.status === 'active');
    return {
      totalActive: active.length,
      avgPerformance: active.length > 0 ? active.reduce((s, e) => s + (e.avgPerformance ?? 0), 0) / active.length : 0,
      avgRetentionDays: active.length > 0 ? Math.round(active.reduce((s, e) => s + (e.retentionDays ?? 0), 0) / active.length) : 0,
      statusBreakdown: mockEmployees.reduce((acc, e) => { acc[e.status] = (acc[e.status] ?? 0) + 1; return acc; }, {} as Record<string, number>),
      gradeDistribution: mockEmployees.reduce((acc, e) => { if (e.interviewGrade) acc[e.interviewGrade] = (acc[e.interviewGrade] ?? 0) + 1; return acc; }, {} as Record<string, number>),
    };
  }
  return fetchJson<EmployeeStats>('/api/employees/stats');
};

export const createEmployee = async (input: CreateEmployeeInput): Promise<EmployeeProfile> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const emp: EmployeeProfile = {
      id: Date.now().toString(),
      candidateId: input.candidateId,
      name: input.name,
      email: input.email ?? '',
      phone: input.phone ?? '',
      status: (input.status ?? 'active') as EmployeeProfile['status'],
      hireDate: input.hireDate ?? new Date().toISOString().slice(0, 10),
      projectId: input.projectId,
      positionId: input.positionId,
      department: input.department,
      manager: input.manager,
      education: input.education,
      major: input.major,
      certifications: input.certifications ?? [],
      skills: input.skills ?? [],
      personality: input.personality,
      commuteDistance: input.commuteDistance,
      familyStatus: input.familyStatus,
      interviewScore: input.interviewScore,
      interviewGrade: input.interviewGrade,
      interviewWeaknesses: input.interviewWeaknesses,
      retentionDays: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockEmployees.push(emp);
    saveEmployees();
    return emp;
  }

  // Convert camelCase → snake_case for API
  const body: Record<string, unknown> = {
    candidateId: input.candidateId,
    name: input.name,
    email: input.email,
    phone: input.phone,
    status: input.status,
    hireDate: input.hireDate,
    projectId: input.projectId,
    positionId: input.positionId,
    department: input.department,
    manager: input.manager,
    education: input.education,
    major: input.major,
    certifications: input.certifications,
    skills: input.skills,
    personality: input.personality,
    commuteDistance: input.commuteDistance,
    familyStatus: input.familyStatus,
    interviewScore: input.interviewScore,
    interviewGrade: input.interviewGrade,
    interviewWeaknesses: input.interviewWeaknesses,
  };
  const raw = await fetchJson<Record<string, unknown>>('/api/employees', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return mapEmployee(raw);
};

export const updateEmployee = async (
  id: string,
  updates: Partial<CreateEmployeeInput & {
    terminationDate?: string;
    terminationReason?: string;
    avgPerformance?: number;
    trainingScore?: number;
  }>,
): Promise<EmployeeProfile> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const idx = mockEmployees.findIndex(e => e.id === id);
    if (idx === -1) throw new Error('Employee not found');
    mockEmployees[idx] = {
      ...mockEmployees[idx],
      ...updates,
      status: (updates.status ?? mockEmployees[idx].status) as EmployeeProfile['status'],
      updatedAt: new Date().toISOString(),
    };
    saveEmployees();
    return mockEmployees[idx];
  }

  const raw = await fetchJson<Record<string, unknown>>(`/api/employees/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return mapEmployee(raw);
};

export const deleteEmployee = async (id: string): Promise<void> => {
  if (USE_MOCK_API) {
    await mockDelay();
    mockEmployees = mockEmployees.filter(e => e.id !== id);
    saveEmployees();
    return;
  }
  await fetchJson(`/api/employees/${id}`, {method: 'DELETE'});
};

// ─── Performance Records ───────────────────────────────────────────────

export const listPerformance = async (employeeId: string): Promise<PerformanceRecord[]> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return mockPerformance.filter(p => p.employeeId === employeeId);
  }
  const rows = await fetchJson<Record<string, unknown>[]>(`/api/employees/${employeeId}/performance`);
  return rows.map(mapPerformance);
};

export const addPerformance = async (
  employeeId: string,
  input: CreatePerformanceInput,
): Promise<PerformanceRecord> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const record: PerformanceRecord = {
      id: Date.now().toString(),
      employeeId,
      ...input,
      dimensions: input.dimensions ?? [],
      strengths: input.strengths ?? [],
      weaknesses: input.weaknesses ?? [],
      createdAt: new Date().toISOString(),
    };
    mockPerformance.push(record);
    savePerformance();

    // Update employee's avgPerformance
    const empIdx = mockEmployees.findIndex(e => e.id === employeeId);
    if (empIdx !== -1) {
      const empRecords = mockPerformance.filter(p => p.employeeId === employeeId);
      mockEmployees[empIdx].avgPerformance = empRecords.reduce((s, r) => s + r.score, 0) / empRecords.length;
      saveEmployees();
    }
    return record;
  }

  const raw = await fetchJson<Record<string, unknown>>(`/api/employees/${employeeId}/performance`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return mapPerformance(raw);
};

// ─── Competency Models ──────────────────────────────────────────────────

export const listCompetencyModels = async (positionId?: string): Promise<CompetencyModel[]> => {
  if (USE_MOCK_API) {
    await mockDelay();
    let filtered = mockCompetencyModels.filter(m => m.isActive);
    if (positionId) filtered = filtered.filter(m => m.positionId === positionId);
    return filtered;
  }

  const qs = positionId ? `?positionId=${encodeURIComponent(positionId)}` : '';
  const rows = await fetchJson<Record<string, unknown>[]>(`/api/employees/competency-models${qs}`);
  return rows.map(mapCompetencyModel);
};

export const createCompetencyModel = async (input: {
  positionId: string;
  name: string;
  dimensions?: {name: string; weight: number; description: string}[];
  sourceType?: string;
  derivedFrom?: Record<string, unknown>;
}): Promise<CompetencyModel> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const model: CompetencyModel = {
      id: Date.now().toString(),
      positionId: input.positionId,
      name: input.name,
      dimensions: input.dimensions ?? [],
      sourceType: (input.sourceType as CompetencyModel['sourceType']) ?? 'manual',
      derivedFrom: input.derivedFrom as CompetencyModel['derivedFrom'],
      version: 1,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockCompetencyModels.push(model);
    saveCompetency();
    return model;
  }

  const raw = await fetchJson<Record<string, unknown>>('/api/employees/competency-models', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return mapCompetencyModel(raw);
};

export const deriveCompetencyModel = async (
  positionId: string,
  topN = 5,
): Promise<CompetencyModel> => {
  if (USE_MOCK_API) {
    await mockDelay();
    // Simple mock: create a generic model
    return createCompetencyModel({
      positionId,
      name: `岗位胜任力模型 (Mock)`,
      dimensions: [
        {name: '专业技能', weight: 30, description: '核心岗位技能'},
        {name: '沟通能力', weight: 20, description: '团队协作沟通'},
        {name: '问题解决', weight: 25, description: '分析和解决复杂问题'},
        {name: '学习能力', weight: 15, description: '快速学习新技术'},
        {name: '责任心', weight: 10, description: '工作责任心和主动性'},
      ],
      sourceType: 'ai_derived',
      derivedFrom: {sample_size: 0, avg_score: '0'},
    });
  }

  const raw = await fetchJson<Record<string, unknown>>(`/api/employees/competency-models/derive/${positionId}`, {
    method: 'POST',
    body: JSON.stringify({topN}),
  });
  return mapCompetencyModel(raw);
};

export const updateCompetencyModel = async (
  id: string,
  updates: {name?: string; dimensions?: {name: string; weight: number; description: string}[]; isActive?: boolean},
): Promise<CompetencyModel> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const idx = mockCompetencyModels.findIndex(m => m.id === id);
    if (idx === -1) throw new Error('Competency model not found');
    mockCompetencyModels[idx] = {...mockCompetencyModels[idx], ...updates, updatedAt: new Date().toISOString()};
    saveCompetency();
    return mockCompetencyModels[idx];
  }

  const raw = await fetchJson<Record<string, unknown>>(`/api/employees/competency-models/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return mapCompetencyModel(raw);
};

export const deleteCompetencyModel = async (id: string): Promise<void> => {
  if (USE_MOCK_API) {
    await mockDelay();
    mockCompetencyModels = mockCompetencyModels.filter(m => m.id !== id);
    saveCompetency();
    return;
  }
  await fetchJson(`/api/employees/competency-models/${id}`, {method: 'DELETE'});
};
