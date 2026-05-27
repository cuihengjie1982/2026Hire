import {USE_MOCK_API, API_BASE_URL, getAuthToken} from '../../shared/lib/runtime';
import {approvalRequestsFixture, interviewApprovalRequestsFixture, interviewApprovalHistoryFixture} from './fixtures';
import {type ApprovalRequestSummary, type InterviewApprovalRequest, type ApprovalStatus, type CreateInterviewApprovalInput} from './types';

const efetch = async <T>(path: string, method = 'GET', body?: Record<string, unknown>): Promise<T> => {
  const base = USE_MOCK_API ? '' : API_BASE_URL;
  const res = await fetch(`${base}/functions/v1/embox-api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken() ?? ''}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `API error ${res.status}`);
  return data as T;
};

// localStorage-backed mock stores
let approvalRequestsData: ApprovalRequestSummary[] = (() => { try { const r = localStorage.getItem('em-box.mock.approvals'); return r ? JSON.parse(r) : [...approvalRequestsFixture]; } catch { return [...approvalRequestsFixture]; } })();
let interviewApprovalRequestsData: InterviewApprovalRequest[] = (() => { try { const r = localStorage.getItem('em-box.mock.approval-requests'); return r ? JSON.parse(r) : [...interviewApprovalRequestsFixture]; } catch { return [...interviewApprovalRequestsFixture]; } })();
let interviewApprovalHistoryData: InterviewApprovalRequest[] = (() => { try { const r = localStorage.getItem('em-box.mock.approval-history'); return r ? JSON.parse(r) : [...interviewApprovalHistoryFixture]; } catch { return [...interviewApprovalHistoryFixture]; } })();
const saveApprovalRequests = () => localStorage.setItem('em-box.mock.approvals', JSON.stringify(approvalRequestsData));
const saveInterviewApprovalRequests = () => localStorage.setItem('em-box.mock.approval-requests', JSON.stringify(interviewApprovalRequestsData));
const saveInterviewApprovalHistory = () => localStorage.setItem('em-box.mock.approval-history', JSON.stringify(interviewApprovalHistoryData));
const saveAllApprovals = () => { saveApprovalRequests(); saveInterviewApprovalRequests(); saveInterviewApprovalHistory(); };

// ---------------------------------------------------------------------------
// Response mappers: snake_case API → camelCase frontend types
// ---------------------------------------------------------------------------

const parseInterviewApproval = (raw: Record<string, unknown>): InterviewApprovalRequest => ({
  id: String(raw.id ?? ''),
  candidateId: String(raw.candidate_id ?? raw.candidateId ?? ''),
  candidateName: String(raw.candidate_name ?? raw.candidateName ?? ''),
  candidateEmail: String(raw.candidate_email ?? raw.candidateEmail ?? ''),
  positionId: String(raw.position_id ?? raw.positionId ?? ''),
  positionName: String(raw.position_name ?? raw.positionName ?? ''),
  interviewScore: Number(raw.interview_score ?? raw.interviewScore ?? 0),
  interviewGrade: (raw.interview_grade ?? raw.interviewGrade ?? 'pending') as InterviewApprovalRequest['interviewGrade'],
  interviewGradeLabel: String(raw.interview_grade_label ?? raw.interviewGradeLabel ?? ''),
  interviewDate: String(raw.interview_date ?? raw.interviewDate ?? ''),
  interviewDuration: Number(raw.interview_duration ?? raw.interviewDuration ?? 0),
  dimensionScores: parseJsonField<Array<{name: string; score: number; weight: string | number}>>(
    raw.dimension_scores ?? raw.dimensionScores, [],
  ).map(d => ({...d, weight: Number(d.weight)})),
  status: (raw.status ?? 'pending') as ApprovalStatus,
  requesterName: String(raw.requester_name ?? raw.requesterName ?? ''),
  approverName: (raw.approver_name ?? raw.approverName) as string | undefined,
  decidedAt: (raw.decided_at ?? raw.decidedAt) as string | undefined,
  decidedComment: (raw.decided_comment ?? raw.decidedComment) as string | undefined,
  createdAt: String(raw.created_at ?? raw.createdAt ?? ''),
});

const parseJsonField = <T>(val: unknown, fallback: T): T => {
  if (val == null) return fallback;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return val as T;
};

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const listApprovalRequests = async (): Promise<ApprovalRequestSummary[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return Array.from(new Map(approvalRequestsData.map(a => [a.id, a])).values());
  }

  const data = await efetch<Record<string, unknown>[]>('/approvals');
  return Array.from(new Map((data ?? []).map(r => [r.id as string, r])).values()) as unknown as ApprovalRequestSummary[];
};

export const getApprovalRequest = async (
  approvalId: string,
): Promise<ApprovalRequestSummary | null> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return approvalRequestsData.find(item => item.id === approvalId) ?? null;
  }

  return efetch<ApprovalRequestSummary | null>(`/approvals?id=${encodeURIComponent(approvalId)}`);
};

// Interview Approval APIs
export const listInterviewApprovalRequests = async (): Promise<InterviewApprovalRequest[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return Array.from(new Map(interviewApprovalRequestsData.map(r => [r.id, r])).values());
  }

  const data = await efetch<Record<string, unknown>[]>('/approvals?status=pending');
  return Array.from(new Map((data ?? []).map(r => [r.id as string, r])).values()).map(parseInterviewApproval);
};

export const listInterviewApprovalHistory = async (): Promise<InterviewApprovalRequest[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return Array.from(new Map(interviewApprovalHistoryData.map(r => [r.id, r])).values());
  }

  const data = await efetch<Record<string, unknown>[]>('/approvals?status_neq=pending');
  return Array.from(new Map((data ?? []).map(r => [r.id as string, r])).values()).map(parseInterviewApproval);
};

export const createInterviewApprovalRequest = async (
  input: CreateInterviewApprovalInput,
): Promise<InterviewApprovalRequest> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const request: InterviewApprovalRequest = {
      id: `ia-${Date.now()}`,
      ...input,
      status: 'pending',
      requesterName: 'AI面试系统',
      createdAt: new Date().toISOString(),
    };
    interviewApprovalRequestsData.unshift(request);
    saveInterviewApprovalRequests();
    return request;
  }
  const data = await efetch<Record<string, unknown>>('/approvals', 'POST', {
    candidateId: input.candidateId,
    candidateName: input.candidateName,
    candidateEmail: input.candidateEmail,
    positionId: input.positionId,
    positionName: input.positionName,
    interviewScore: input.interviewScore,
    interviewGrade: input.interviewGrade,
    interviewGradeLabel: input.interviewGradeLabel,
    interviewDate: input.interviewDate,
    interviewDuration: input.interviewDuration,
    dimensionScores: input.dimensionScores,
  });
  return parseInterviewApproval(data);
};

export const decideInterviewApproval = async (
  approvalId: string,
  decision: Extract<ApprovalStatus, 'approved' | 'rejected'>,
  comment: string,
  decidedBy: string,
): Promise<InterviewApprovalRequest> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const request = interviewApprovalRequestsData.find((r) => r.id === approvalId);
    if (!request) throw new Error('Approval request not found');

    request.status = decision;
    request.approverName = decidedBy;
    request.decidedAt = new Date().toISOString();
    request.decidedComment = comment;

    saveAllApprovals();
    return request;
  }

  const data = await efetch<Record<string, unknown>>('/approvals', 'PATCH', {
    id: approvalId,
    status: decision,
    comment,
    approverName: decidedBy,
  });
  return parseInterviewApproval(data);
};

export const hireCandidate = async (approvalId: string): Promise<InterviewApprovalRequest> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const request = interviewApprovalHistoryData.find((r) => r.id === approvalId);
    if (!request) throw new Error('Approval request not found');
    request.status = 'hired';
    saveInterviewApprovalHistory();
    return request;
  }

  const data = await efetch<Record<string, unknown>>('/cross-table-ops/hire-candidate', 'POST', { action: 'hire-candidate', approvalId });
  return parseInterviewApproval(data);
};