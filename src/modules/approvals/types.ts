export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'hired';

export type ApprovalType = 'agent_publish' | 'config_publish' | 'outreach_launch' | 'interview_result';

export type ApprovalRequestSummary = {
  id: string;
  type: ApprovalType;
  status: ApprovalStatus;
  targetType: string;
  targetId: string;
  requesterName: string;
  approverName?: string;
  createdAt: string;
};

export type ApprovalDecision = {
  id: string;
  approvalRequestId: string;
  decision: Extract<ApprovalStatus, 'approved' | 'rejected'>;
  comment: string;
  decidedBy: string;
  decidedAt: string;
};

// Interview Result Approval types
export type InterviewApprovalRequest = {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  positionId: string;
  positionName: string;
  interviewScore: number;
  interviewGrade: 'excellent' | 'good' | 'qualified' | 'pending' | 'rejected';
  interviewGradeLabel: string;
  interviewDate: string;
  interviewDuration: number; // minutes
  dimensionScores: Array<{
    name: string;
    score: number;
    weight: number;
  }>;
  status: ApprovalStatus;
  requesterName: string;
  approverName?: string;
  decidedAt?: string;
  decidedComment?: string;
  createdAt: string;
};

export type CreateInterviewApprovalInput = {
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  positionId: string;
  positionName: string;
  interviewScore: number;
  interviewGrade: InterviewApprovalRequest['interviewGrade'];
  interviewGradeLabel: string;
  interviewDate: string;
  interviewDuration: number;
  dimensionScores: InterviewApprovalRequest['dimensionScores'];
};
