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
