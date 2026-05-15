import type {ParsedResumeInfo} from '../../shared/lib/mineruClient';
import type {ScoreResult} from '../../shared/lib/resumeScorer';

export type CandidateGrade = string;

export interface CandidateCard {
  id: string;
  name: string;
  location: string;
  source: string;
  sourceColor: string;
  roles: string[];
  tags: string[];
  fitScore: number[];
  scoreColor: string;
  grade: CandidateGrade;
  gradeColor: string;
  reason: string;
  projectId?: string;
  projectName?: string;
  positionId?: string;
  positionName?: string;
  // MinerU parsed resume data
  rawResumeMd?: string;
  resumeParsedInfo?: ParsedResumeInfo;
  // Full scoring result from resumeScorer
  scoreResult?: ScoreResult;
  // Original resume file data for download
  originalFileBase64?: string;
  originalFileName?: string;
  // Honors & certificates
  honors?: string[];
}

export interface TalentStats {
  totalCount: number;
  monthlyNew: number;
  pendingReview: number;
  gradeDistribution: {
    A: number;
    B: number;
    C: number;
    D: number;
    F: number;
  };
}

export interface GroupedCandidates {
  key: string;
  label: string;
  count: number;
  candidates: CandidateCard[];
}
