import {fetchJson, getItemsFromPayload} from '../../shared/lib/apiClient';
import {USE_MOCK_API} from '../../shared/lib/runtime';
import {
  type EmployeeProfile,
  type PerformanceRecord,
  type CompetencyModel,
  type EmployeeStats,
  type CreateEmployeeInput,
  type CreatePerformanceInput,
  type ProfileHistoryEntry,
  type ProfileHistoryResponse,
  type CustomFieldDef,
  type CustomFieldValue,
  type CreateCustomFieldInput,
  type EmployeeScorecard,
  type TrainingRecommendation,
} from './types';

export type {EmployeeProfile, PerformanceRecord, CompetencyModel, EmployeeStats, CreateEmployeeInput, CreatePerformanceInput, ProfileHistoryEntry, ProfileHistoryResponse, CustomFieldDef, CustomFieldValue, CreateCustomFieldInput, EmployeeScorecard, TrainingRecommendation};

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

// ─── Version History ────────────────────────────────────────────────────

const mapHistoryEntry = (raw: Record<string, unknown>): ProfileHistoryEntry => ({
  id: String(raw.id ?? ''),
  employeeId: String(raw.employee_id ?? raw.employeeId ?? ''),
  action: String(raw.action ?? 'update') as ProfileHistoryEntry['action'],
  fieldName: raw.field_name ? String(raw.field_name) : null,
  fieldLabel: raw.field_label ? String(raw.field_label) : null,
  oldValue: raw.old_value != null ? String(raw.old_value) : null,
  newValue: raw.new_value != null ? String(raw.new_value) : null,
  changedBy: raw.changed_by ? String(raw.changed_by) : null,
  changedByEmail: raw.changed_by_email ? String(raw.changed_by_email) : null,
  changedAt: String(raw.changed_at ?? ''),
});

const HISTORY_KEY = 'em-box.mock.employee-history';

const loadHistory = (): ProfileHistoryEntry[] => {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
  } catch { return []; }
};
const saveHistory = (items: ProfileHistoryEntry[]) => {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
};

export const getEmployeeHistory = async (
  employeeId: string,
  page = 1,
  pageSize = 20,
): Promise<ProfileHistoryResponse> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const all = loadHistory().filter(h => h.employeeId === employeeId);
    const start = (page - 1) * pageSize;
    return {
      items: all.slice(start, start + pageSize),
      total: all.length,
      page,
      pageSize,
    };
  }

  const raw = await fetchJson<Record<string, unknown>>(
    `/api/employees/${employeeId}/history?page=${page}&pageSize=${pageSize}`,
  );
  return {
    items: ((raw.items ?? []) as Record<string, unknown>[]).map(mapHistoryEntry),
    total: Number(raw.total ?? 0),
    page: Number(raw.page ?? 1),
    pageSize: Number(raw.pageSize ?? 20),
  };
};

// ─── Custom Fields ────────────────────────────────────────────────────

const CUSTOM_FIELDS_KEY = 'em-box.mock.custom-fields';

const loadCustomFields = (): CustomFieldDef[] => {
  try { return JSON.parse(localStorage.getItem(CUSTOM_FIELDS_KEY) ?? '[]'); } catch { return []; }
};
const saveCustomFields = (items: CustomFieldDef[]) => {
  localStorage.setItem(CUSTOM_FIELDS_KEY, JSON.stringify(items));
};

const mapCustomFieldDef = (raw: Record<string, unknown>): CustomFieldDef => ({
  id: String(raw.id ?? ''),
  fieldKey: String(raw.field_key ?? raw.fieldKey ?? ''),
  fieldLabel: String(raw.field_label ?? raw.fieldLabel ?? ''),
  fieldType: String(raw.field_type ?? raw.fieldType ?? 'text') as CustomFieldDef['fieldType'],
  options: (raw.options ?? []) as {label: string; value: string}[],
  sortOrder: Number(raw.sort_order ?? raw.sortOrder ?? 0),
  isActive: raw.is_active !== false && raw.isActive !== false,
  source: String(raw.source ?? 'manual') as CustomFieldDef['source'],
  createdAt: String(raw.created_at ?? ''),
  updatedAt: String(raw.updated_at ?? ''),
});

export const listCustomFields = async (): Promise<CustomFieldDef[]> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return loadCustomFields().filter(f => f.isActive);
  }
  const raw = await fetchJson<Record<string, unknown>[]>('/api/employees/custom-fields');
  return (raw ?? []).map(mapCustomFieldDef);
};

export const createCustomField = async (input: CreateCustomFieldInput): Promise<CustomFieldDef> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const fields = loadCustomFields();
    const existing = fields.find(f => f.fieldKey === input.fieldKey);
    if (existing) {
      existing.fieldLabel = input.fieldLabel;
      existing.fieldType = (input.fieldType ?? 'text') as CustomFieldDef['fieldType'];
      existing.options = input.options ?? [];
      existing.isActive = true;
      saveCustomFields(fields);
      return existing;
    }
    const newField: CustomFieldDef = {
      id: `mock-cf-${Date.now()}`,
      fieldKey: input.fieldKey,
      fieldLabel: input.fieldLabel,
      fieldType: (input.fieldType ?? 'text') as CustomFieldDef['fieldType'],
      options: input.options ?? [],
      sortOrder: 0,
      isActive: true,
      source: input.source ?? 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    fields.push(newField);
    saveCustomFields(fields);
    return newField;
  }
  const raw = await fetchJson<Record<string, unknown>>('/api/employees/custom-fields', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return mapCustomFieldDef(raw);
};

export const updateCustomField = async (
  id: string,
  updates: Partial<Pick<CustomFieldDef, 'fieldLabel' | 'fieldType' | 'options' | 'isActive' | 'sortOrder'>>,
): Promise<CustomFieldDef> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const fields = loadCustomFields();
    const idx = fields.findIndex(f => f.id === id);
    if (idx === -1) throw new Error('Custom field not found');
    fields[idx] = {...fields[idx], ...updates, updatedAt: new Date().toISOString()};
    saveCustomFields(fields);
    return fields[idx];
  }
  const raw = await fetchJson<Record<string, unknown>>(`/api/employees/custom-fields/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return mapCustomFieldDef(raw);
};

export const deleteCustomField = async (id: string): Promise<void> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const fields = loadCustomFields();
    const idx = fields.findIndex(f => f.id === id);
    if (idx !== -1) {
      fields[idx].isActive = false;
      saveCustomFields(fields);
    }
    return;
  }
  await fetchJson(`/api/employees/custom-fields/${id}`, {method: 'DELETE'});
};

// Custom field values for a specific employee
const mapCustomFieldValue = (raw: Record<string, unknown>): CustomFieldValue => ({
  id: String(raw.id ?? ''),
  employeeId: String(raw.employee_id ?? raw.employeeId ?? ''),
  fieldId: String(raw.field_id ?? raw.fieldId ?? ''),
  fieldKey: raw.field_key ? String(raw.field_key) : undefined,
  fieldLabel: raw.field_label ? String(raw.field_label) : undefined,
  fieldType: raw.field_type ? String(raw.field_type) : undefined,
  valueText: raw.value_text != null ? String(raw.value_text) : null,
  valueNum: raw.value_num != null ? Number(raw.value_num) : null,
  valueDate: raw.value_date ? String(raw.value_date) : null,
  valueJson: raw.value_json,
});

export const getCustomValues = async (employeeId: string): Promise<CustomFieldValue[]> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const key = `em-box.mock.custom-values-${employeeId}`;
    try { return JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { return []; }
  }
  const raw = await fetchJson<Record<string, unknown>[]>(`/api/employees/${employeeId}/custom-values`);
  return (raw ?? []).map(mapCustomFieldValue);
};

export const updateCustomValues = async (
  employeeId: string,
  values: Array<{fieldId: string; value: unknown}>,
): Promise<CustomFieldValue[]> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const key = `em-box.mock.custom-values-${employeeId}`;
    const existing: CustomFieldValue[] = (() => { try { return JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { return []; } })();
    const fields = loadCustomFields();

    for (const item of values) {
      const def = fields.find(f => f.id === item.fieldId);
      const idx = existing.findIndex(v => v.fieldId === item.fieldId);
      const val: CustomFieldValue = {
        id: idx >= 0 ? existing[idx].id : `mock-cv-${Date.now()}-${item.fieldId}`,
        employeeId,
        fieldId: item.fieldId,
        fieldKey: def?.fieldKey,
        fieldLabel: def?.fieldLabel,
        fieldType: def?.fieldType,
        valueText: def?.fieldType === 'text' || def?.fieldType === 'select' ? String(item.value ?? '') : null,
        valueNum: def?.fieldType === 'number' ? Number(item.value) : null,
        valueDate: def?.fieldType === 'date' ? String(item.value ?? '') : null,
        valueJson: def?.fieldType === 'multiselect' || def?.fieldType === 'boolean' ? item.value : null,
      };
      if (idx >= 0) existing[idx] = val;
      else existing.push(val);
    }
    localStorage.setItem(key, JSON.stringify(existing));
    return existing;
  }
  const raw = await fetchJson<Record<string, unknown>[]>(`/api/employees/${employeeId}/custom-values`, {
    method: 'PATCH',
    body: JSON.stringify({values}),
  });
  return (raw ?? []).map(mapCustomFieldValue);
};

// ─── Scorecard ────────────────────────────────────────────────────

const mapScorecard = (raw: Record<string, unknown>): EmployeeScorecard => ({
  id: String(raw.id ?? ''),
  employeeId: String(raw.employee_id ?? raw.employeeId ?? ''),
  interviewScoreLatest: raw.interview_score_latest as number | null,
  interviewGradeLatest: raw.interview_grade_latest as string | null,
  interviewDateLatest: raw.interview_date_latest as string | null,
  interviewCount: Number(raw.interview_count ?? 0),
  trainingScoreAvg: raw.training_score_avg as number | null,
  trainingCoursesTotal: Number(raw.training_courses_total ?? 0),
  trainingCoursesPassed: Number(raw.training_courses_passed ?? 0),
  trainingCompletionRate: raw.training_completion_rate as number | null,
  performanceScoreAvg: raw.performance_score_avg as number | null,
  performanceReviewCount: Number(raw.performance_review_count ?? 0),
  performanceLatestRating: raw.performance_latest_rating as string | null,
  compositeScore: raw.composite_score as number | null,
  compositeGrade: raw.composite_grade as string | null,
  competencyGapScore: raw.competency_gap_score as number | null,
  lastRecomputedAt: String(raw.last_recomputed_at ?? ''),
});

export const getScorecard = async (employeeId: string): Promise<EmployeeScorecard | null> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return null;
  }
  const raw = await fetchJson<Record<string, unknown>>(`/api/employees/${employeeId}/scorecard`);
  return raw ? mapScorecard(raw) : null;
};

export const recomputeScore = async (employeeId: string): Promise<EmployeeScorecard | null> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return null;
  }
  const raw = await fetchJson<Record<string, unknown>>(`/api/employees/${employeeId}/recompute-score`, {
    method: 'POST',
  });
  return raw ? mapScorecard(raw) : null;
};

// ─── Training Recommendations ────────────────────────────────────

const mapRecommendation = (raw: Record<string, unknown>): TrainingRecommendation => ({
  id: String(raw.id ?? ''),
  employeeId: String(raw.employee_id ?? raw.employeeId ?? ''),
  courseId: String(raw.course_id ?? raw.courseId ?? ''),
  courseTitle: raw.course_title ? String(raw.course_title) : raw.title ? String(raw.title) : undefined,
  reason: String(raw.reason ?? 'manual') as TrainingRecommendation['reason'],
  reasonDetail: raw.reason_detail ? String(raw.reason_detail) : null,
  priority: Number(raw.priority ?? 5),
  status: String(raw.status ?? 'pending') as TrainingRecommendation['status'],
  enrolledAt: raw.enrolled_at ? String(raw.enrolled_at) : null,
  completedAt: raw.completed_at ? String(raw.completed_at) : null,
  createdAt: String(raw.created_at ?? ''),
});

export const getTrainingRecommendations = async (employeeId: string): Promise<TrainingRecommendation[]> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return [];
  }
  const raw = await fetchJson<Record<string, unknown>[]>(`/api/employees/${employeeId}/training-recommendations`);
  return (raw ?? []).map(mapRecommendation);
};

export const generateRecommendations = async (employeeId: string): Promise<{generated: number; recommendations: TrainingRecommendation[]}> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return {generated: 0, recommendations: []};
  }
  const raw = await fetchJson<Record<string, unknown>>(`/api/employees/${employeeId}/generate-recommendations`, {
    method: 'POST',
  });
  return {
    generated: Number(raw.generated ?? 0),
    recommendations: ((raw.recommendations ?? []) as Record<string, unknown>[]).map(mapRecommendation),
  };
};

export const updateRecommendationStatus = async (
  employeeId: string,
  recId: string,
  status: 'pending' | 'enrolled' | 'completed' | 'dismissed',
): Promise<void> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return;
  }
  await fetchJson(`/api/employees/${employeeId}/training-recommendations/${recId}`, {
    method: 'PATCH',
    body: JSON.stringify({status}),
  });
};
