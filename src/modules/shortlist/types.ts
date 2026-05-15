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
