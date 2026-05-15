export type InterviewTemplateStatus = 'draft' | 'active' | 'inactive';

export type ScoringDimension = {
  id: string;
  name: string;
  maxScore: number;
};

export type ScoringConfig = {
  dimensions: ScoringDimension[];
  baseScore: number;
  baseRequirements: string[];
};

export type GradeRule = {
  grade: string;
  minScore: number;
  maxScore: number;
  label: string;
};

export type InterviewQuestion = {
  id: string;
  order: number;
  title: string;
  prompt: string;
  timeLimitSeconds: number;
  group: string;
  followUps: string[];
  scoringGuide: {
    standard: string;
    rubric: {label: string; score: string}[];
  };
  linkedDimensions: string[];
};

export type InterviewTemplateSummary = {
  id: string;
  positionId: string;
  name: string;
  version: number;
  status: InterviewTemplateStatus;
  durationMinutes: number;
  questionCount: number;
  scoringConfig: ScoringConfig;
  gradeRules: GradeRule[];
};

export type InterviewTemplateDetail = {
  template: InterviewTemplateSummary;
  questions: InterviewQuestion[];
};

export type InterviewSessionStatus =
  | 'created'
  | 'in_progress'
  | 'submitted'
  | 'scored'
  | 'closed';

export type InterviewSession = {
  id: string;
  candidateId: string;
  templateId: string;
  status: InterviewSessionStatus;
  startedAt?: string;
  submittedAt?: string;
};

// Interview Management Types
export type InterviewManagementSession = {
  id: string;
  candidateName: string;
  candidateEmail: string;
  position: string;
  positionId: string;
  templateId: string;
  templateName: string;
  candidateId: string;
  startTime: string;
  status: 'pending' | 'in_progress' | 'paused' | 'completed' | 'cancelled';
  progress: {
    current: number;
    total: number;
  };
  score?: number;
};

// Interview Results Types
export type InterviewResult = {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  position: string;
  templateName: string;
  interviewDate: string;
  totalScore: number;
  grade: 'excellent' | 'good' | 'qualified' | 'pending' | 'rejected';
  gradeLabel: string;
  dimensions: {
    name: string;
    score: number;
    weight: number;
  }[];
  duration: number;
  status: 'completed' | 'reviewed';
};

// Interview Analytics Types
export type AnalyticsSummary = {
  totalInterviews: number;
  completedInterviews: number;
  passRate: number;
  averageScore: number;
  thisWeekCount: number;
  thisMonthCount: number;
  momTrend: {
    totalChange: number;
    completedChange: number;
    avgScoreChange: number;
  };
};

export type ScoreDistribution = {
  range: string;
  count: number;
};

export type PassRateTrend = {
  month: string;
  total: number;
  passed: number;
  rate: number;
};

export type PositionAnalytics = {
  position: string;
  total: number;
  passRate: number;
  averageScore: number;
};

export type DimensionAnalysis = {
  dimensions: Array<{
    name: string;
    avgScore: number;
    maxScore: number;
    avgPercent: number;
    count: number;
  }>;
  questions: Array<{
    questionTitle: string;
    avgScore: number;
    maxScore: number;
    belowThresholdCount: number;
    totalCount: number;
  }>;
  weakestDimension: string;
  hardestQuestion: string;
};

// Per-question AI scoring result
export type AnswerScoreResult = {
  id: string;
  sessionId: string;
  questionId: string | null;
  questionTitle: string;
  questionPrompt: string;
  audioDuration: number;
  transcript: string | null;
  score: number | null;
  maxScore: number | null;
  scoreReasoning: string | null;
  dimensionScores: Array<{dimension: string; score: number; maxScore: number; reasoning: string}>;
  status: 'pending' | 'transcribing' | 'scoring' | 'completed' | 'failed';
  errorMessage: string | null;
};
