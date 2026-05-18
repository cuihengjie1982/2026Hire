import {fetchJson, mockDelay} from '../../shared/lib/apiClient';
import {supabase} from '../../shared/lib/supabase';
import {USE_MOCK_API} from '../../shared/lib/runtime';
import {approvalRequestsFixture, interviewApprovalRequestsFixture, interviewApprovalHistoryFixture} from './fixtures';
import {type ApprovalRequestSummary, type InterviewApprovalRequest, type ApprovalStatus, type CreateInterviewApprovalInput} from './types';

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
    return approvalRequestsFixture;
  }

  const {data, error} = await supabase.from('approval_requests').select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as ApprovalRequestSummary[];
};

export const getApprovalRequest = async (
  approvalId: string,
): Promise<ApprovalRequestSummary | null> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return approvalRequestsFixture.find((item) => item.id === approvalId) ?? null;
  }

  const {data, error} = await supabase.from('approval_requests').select('*').eq('id', approvalId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as ApprovalRequestSummary | null;
};

// Interview Approval APIs
export const listInterviewApprovalRequests = async (): Promise<InterviewApprovalRequest[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return interviewApprovalRequestsFixture;
  }

  const {data, error} = await supabase.from('interview_approval_requests').select('*').eq('status', 'pending');
  if (error) throw new Error(error.message);
  return (data ?? []).map(parseInterviewApproval);
};

export const listInterviewApprovalHistory = async (): Promise<InterviewApprovalRequest[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return interviewApprovalHistoryFixture;
  }

  const {data, error} = await supabase.from('interview_approval_requests').select('*').neq('status', 'pending').order('created_at', {ascending: false});
  if (error) throw new Error(error.message);
  return (data ?? []).map(parseInterviewApproval);
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
    interviewApprovalRequestsFixture.unshift(request);
    return request;
  }
  const {data, error} = await supabase.from('interview_approval_requests').insert(input).select().single();
  if (error) throw new Error(error.message);
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
    const request = interviewApprovalRequestsFixture.find((r) => r.id === approvalId);
    if (!request) throw new Error('Approval request not found');

    request.status = decision;
    request.approverName = decidedBy;
    request.decidedAt = new Date().toISOString();
    request.decidedComment = comment;

    return request;
  }

  const {data, error} = await supabase.functions.invoke('cross-table-ops', {
    body: {
      action: 'approval-decide',
      approvalId,
      status: decision,
      comment,
      approverName: decidedBy,
    },
  });
  if (error) throw new Error(error.message);
  return parseInterviewApproval(data as Record<string, unknown>);
};

export const hireCandidate = async (approvalId: string): Promise<InterviewApprovalRequest> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const request = interviewApprovalHistoryFixture.find((r) => r.id === approvalId);
    if (!request) throw new Error('Approval request not found');
    request.status = 'hired';
    return request;
  }

  const {data, error} = await supabase.functions.invoke('cross-table-ops', {
    body: { action: 'hire-candidate', approvalId },
  });
  if (error) throw new Error(error.message);
  return parseInterviewApproval(data as Record<string, unknown>);
};