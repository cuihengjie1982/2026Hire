import {type Contact} from '../contacts/types';

export interface ShortlistEntry {
  id: string;
  candidateId: string;
  candidateName: string;
  role: string;
  positionId: string;
  positionName: string;
  projectId: string;
  projectName: string;
  fitScore: number;
  grade: string;
  nextStep: string;
}

export interface CreateShortlistEntryInput {
  candidateId: string;
  candidateName: string;
  role: string;
  positionId: string;
  positionName: string;
  projectId: string;
  projectName: string;
  fitScore: number;
  grade: string;
}

export interface BatchAddShortlistResult {
  added: number;
  skipped: {candidateId: string; reason: string}[];
  entries: ShortlistEntry[];
}

export type PromoteShortlistInput = {
  nextStep: string;
  outreachPerson?: string;
  channel?: 'wechat' | 'email' | 'phone';
  reason?: string;
};

export type PromoteShortlistResult = {
  entry: ShortlistEntry;
  contact?: Contact;
};
