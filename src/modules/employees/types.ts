// Employee recruitment profile types

export interface EmployeeProfile {
  id: string;
  candidateId: string;
  name: string;
  email: string;
  phone: string;
  status: 'active' | 'onboarding' | 'probation' | 'terminated' | 'resigned';
  hireDate: string;
  terminationDate?: string;
  terminationReason?: string;
  projectId?: string;
  positionId?: string;
  department?: string;
  manager?: string;
  education?: string;
  major?: string;
  certifications?: {name: string; date?: string}[];
  skills?: {name: string; level: number}[];
  personality?: Record<string, unknown>;
  commuteDistance?: number;
  familyStatus?: string;
  interviewScore?: number;
  interviewGrade?: string;
  interviewWeaknesses?: string[];
  avgPerformance?: number;
  retentionDays?: number;
  trainingScore?: number;
  createdAt: string;
  updatedAt: string;
  // Joined from candidate
  resumeScore?: number;
  resumeGrade?: string;
}

export interface PerformanceRecord {
  id: string;
  employeeId: string;
  period: string;          // e.g. '2026-Q1', '2026-06'
  score: number;
  rating?: string;         // S/A/B/C/D
  dimensions: {dimension: string; score: number; note?: string}[];
  strengths?: string[];
  weaknesses?: string[];
  notes?: string;
  reviewer?: string;
  createdAt: string;
}

export interface CompetencyModel {
  id: string;
  positionId: string;
  positionName?: string;
  name: string;
  dimensions: {name: string; weight: number; description: string}[];
  sourceType: 'manual' | 'ai_derived' | 'statistical';
  derivedFrom?: {
    employee_ids?: string[];
    sample_size?: number;
    avg_score?: string;
    common_weaknesses?: {name: string; count: number}[];
  };
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeStats {
  totalActive: number;
  avgPerformance: number;
  avgRetentionDays: number;
  statusBreakdown: Record<string, number>;
  gradeDistribution: Record<string, number>;
}

export interface CreateEmployeeInput {
  candidateId: string;
  name: string;
  email?: string;
  phone?: string;
  status?: string;
  hireDate?: string;
  projectId?: string;
  positionId?: string;
  department?: string;
  manager?: string;
  education?: string;
  major?: string;
  certifications?: {name: string; date?: string}[];
  skills?: {name: string; level: number}[];
  personality?: Record<string, unknown>;
  commuteDistance?: number;
  familyStatus?: string;
  interviewScore?: number;
  interviewGrade?: string;
  interviewWeaknesses?: string[];
}

export interface CreatePerformanceInput {
  period: string;
  score: number;
  rating?: string;
  dimensions?: {dimension: string; score: number; note?: string}[];
  strengths?: string[];
  weaknesses?: string[];
  notes?: string;
  reviewer?: string;
}

// Version history entry
export interface ProfileHistoryEntry {
  id: string;
  employeeId: string;
  action: 'create' | 'update' | 'delete' | 'status_change';
  fieldName: string | null;
  fieldLabel: string | null;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string | null;
  changedByEmail: string | null;
  changedAt: string;
}

export interface ProfileHistoryResponse {
  items: ProfileHistoryEntry[];
  total: number;
  page: number;
  pageSize: number;
}

// Custom field definition
export interface CustomFieldDef {
  id: string;
  fieldKey: string;
  fieldLabel: string;
  fieldType: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean';
  options?: {label: string; value: string}[];
  sortOrder: number;
  isActive: boolean;
  source: 'manual' | 'excel_import';
  createdAt: string;
  updatedAt: string;
}

// Custom field value (per employee)
export interface CustomFieldValue {
  id: string;
  employeeId: string;
  fieldId: string;
  fieldKey?: string;
  fieldLabel?: string;
  fieldType?: string;
  valueText?: string | null;
  valueNum?: number | null;
  valueDate?: string | null;
  valueJson?: unknown;
}

// Create custom field input
export interface CreateCustomFieldInput {
  fieldKey: string;
  fieldLabel: string;
  fieldType?: string;
  options?: {label: string; value: string}[];
  source?: 'manual' | 'excel_import';
}

// Unified scorecard
export interface EmployeeScorecard {
  id: string;
  employeeId: string;
  interviewScoreLatest: number | null;
  interviewGradeLatest: string | null;
  interviewDateLatest: string | null;
  interviewCount: number;
  trainingScoreAvg: number | null;
  trainingCoursesTotal: number;
  trainingCoursesPassed: number;
  trainingCompletionRate: number | null;
  performanceScoreAvg: number | null;
  performanceReviewCount: number;
  performanceLatestRating: string | null;
  compositeScore: number | null;
  compositeGrade: string | null;
  competencyGapScore: number | null;
  lastRecomputedAt: string;
}

// Training recommendation
export interface TrainingRecommendation {
  id: string;
  employeeId: string;
  courseId: string;
  courseTitle?: string;
  reason: 'weakness' | 'competency_gap' | 'performance' | 'manual';
  reasonDetail: string | null;
  priority: number;
  status: 'pending' | 'enrolled' | 'completed' | 'dismissed';
  enrolledAt: string | null;
  completedAt: string | null;
  createdAt: string;
}
