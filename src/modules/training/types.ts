export interface TrainingCourse {
  id: string;
  title: string;
  description: string;
  category: string;            // 专业能力/沟通表达/应变能力/综合素质...
  difficulty: '初级' | '中级' | '高级';
  durationMinutes: number;
  content: CourseSection[];
  materials: CourseMaterial[];
  assessmentConfig: AssessmentConfig;
  positionId?: string;
  positionName?: string;
  competencyDimension?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CourseSection {
  sectionTitle: string;
  contentType: 'text' | 'video' | 'link';
  contentUrl?: string;
  text?: string;
}

export interface CourseMaterial {
  title: string;
  url?: string;
  type: 'pdf' | 'video' | 'article' | 'exercise';
}

export interface AssessmentConfig {
  type: 'quiz' | 'ai_review' | 'manual';
  passingScore: number;
  questions?: {text: string; options?: string[]; answer?: string}[];
}

export interface TrainingEnrollment {
  id: string;
  candidateId: string;
  candidateName: string;
  courseId: string;
  courseTitle?: string;
  courseCategory?: string;
  status: 'enrolled' | 'in_progress' | 'completed' | 'failed';
  enrolledAt: string;
  completedAt?: string;
  progressPct: number;
  finalScore?: number;
  preInterviewScore?: number;
  postInterviewScore?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingAssessment {
  id: string;
  enrollmentId: string;
  score: number;
  passed: boolean;
  answers: {question: string; answer: string; score: number; feedback?: string}[];
  assessor?: string;
  feedback?: string;
  createdAt: string;
}

export interface TrainingStats {
  totalCourses: number;
  activeEnrollments: number;
  completedEnrollments: number;
  failedEnrollments: number;
  completionRate: number;
  avgScore: number;
}

export interface WeaknessAnalysis {
  totalAnalyzed: number;
  weaknesses: {
    dimension: string;
    frequency: number;
    avgScore: number;
    affectedCandidates: string[];
  }[];
}

export interface TrainingEffectiveness {
  totalCompleted: number;
  avgImprovement: number;
  improvementRate: number;
  byCategory: Record<string, {
    count: number;
    avgPre: number;
    avgPost: number;
    improved: number;
  }>;
}

export interface CourseRecommendation {
  dimensions: string[];
  recommendations: TrainingCourse[];
}

// ─── Learning Paths ─────────────────────────────────────────────────────

export interface LearningPath {
  id: string;
  title: string;
  description: string;
  category: string;
  level: '初级' | '中级' | '高级';
  isCertified: boolean;
  positionId?: string;
  coverImageUrl?: string;
  isActive: boolean;
  courses: PathCourse[];
  enrolledCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PathCourse {
  id: string;
  pathId: string;
  courseId: string;
  sortOrder: number;
  isRequired: boolean;
  course: TrainingCourse;
}

export interface PathEnrollment {
  id: string;
  pathId: string;
  candidateId: string;
  status: 'enrolled' | 'in_progress' | 'completed' | 'failed';
  enrolledAt: string;
  completedAt?: string;
  progressPct: number;
}
