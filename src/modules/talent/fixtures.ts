import {type CandidateCard, type TalentStats} from './types';

// No fixture candidates - data comes from real resume imports only
export const candidatesFixture: CandidateCard[] = [];

export const talentStatsFixture: TalentStats = {
  totalCount: 0,
  monthlyNew: 0,
  pendingReview: 0,
  gradeDistribution: {A: 0, B: 0, C: 0, D: 0, F: 0},
};
