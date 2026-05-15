export type CommChannel = 'wechat' | 'email' | 'phone' | 'interview' | 'other' | 'sms';
export type CommStatus = 'pending' | 'contacted' | 'responded' | 'failed';

export type OutreachRecord = {
  id: string;
  candidateId: string;
  candidateName: string;
  positionId?: string;
  positionName?: string;
  channel: CommChannel;
  status: CommStatus;
  content?: string;
  smsProviderRef?: string;
  smsStatus?: string;
  createdAt: string;
};

export type CreateOutreachRecordInput = {
  candidateId: string;
  candidateName: string;
  positionId?: string;
  positionName?: string;
  channel: CommChannel;
  content?: string;
};

export type SmsTemplate = {
  id: string;
  name: string;
  templateId: string;
  signName?: string;
  content?: string;
  parameters: string[];
};

export type SendSmsInput = {
  candidateId: string;
  templateId: string;
  templateParamSet: string[];
  positionId?: string;
  positionName?: string;
};
