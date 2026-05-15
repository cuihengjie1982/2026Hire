export type ContactChannel = 'wechat' | 'email' | 'phone';

export type ContactStatus = 'pending' | 'contacted' | 'responded' | 'interview_scheduled' | 'hired' | 'rejected';

export interface Contact {
  id: string;
  candidateId: string;
  candidateName: string;
  positionId: string;
  positionName: string;
  projectId: string;
  projectName: string;
  outreachPerson: string;
  channel: ContactChannel;
  reason: string;
  status: ContactStatus;
  createdAt: string;
  updatedAt: string;
}
