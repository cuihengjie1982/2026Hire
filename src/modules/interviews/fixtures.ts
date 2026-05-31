import {
  type InterviewTemplateSummary, type InterviewTemplateDetail,
  type InterviewSession, type InterviewManagementSession,
  type InterviewResult, type AnalyticsSummary,
  type ScoreDistribution, type PassRateTrend, type PositionAnalytics,
} from './types';

export const interviewTemplatesFixture: InterviewTemplateSummary[] = [];
export const interviewTemplateDetailFixture: InterviewTemplateDetail = {
  template: {id: '', positionId: '', name: '', version: 0, durationMinutes: 0, questionCount: 0, status: 'draft' as const, scoringConfig: {dimensions: [], baseScore: 50, baseRequirements: []}, gradeRules: [], interviewMode: 'audio_sequential' as const},
  questions: [],
};
export const interviewSessionFixture: InterviewSession = {
  id: '', candidateId: '', templateId: '', status: 'created',
};
export const managementSessionsFixture: InterviewManagementSession[] = [];
export const interviewResultsFixture: InterviewResult[] = [];
export const analyticsSummaryFixture: AnalyticsSummary = {
  totalInterviews: 0, completedInterviews: 0, passRate: 0, averageScore: 0,
  thisWeekCount: 0, thisMonthCount: 0,
  momTrend: { totalChange: 0, completedChange: 0, avgScoreChange: 0 },
};
export const scoreDistributionFixture: ScoreDistribution[] = [];
export const passRateTrendFixture: PassRateTrend[] = [];
export const positionAnalyticsFixture: PositionAnalytics[] = [];
