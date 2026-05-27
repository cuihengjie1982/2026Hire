import type {TrainingCourse, TrainingEnrollment} from './types';

export const courseFixtures: TrainingCourse[] = [
  {
    id: 'c1',
    title: '结构化表达与沟通技巧',
    description: '学习 STAR 法则、逻辑化表达，提升面试中的沟通能力',
    category: '沟通表达',
    difficulty: '初级',
    durationMinutes: 45,
    content: [
      {sectionTitle: 'STAR 法则详解', contentType: 'text', text: 'STAR 法则是结构化面试回答的黄金标准...'},
      {sectionTitle: '逻辑化表达练习', contentType: 'text', text: '通过案例练习将复杂经历转化为清晰表达...'},
    ],
    materials: [
      {title: 'STAR 法则模板', type: 'pdf'},
      {title: '沟通技巧视频教程', type: 'video'},
    ],
    assessmentConfig: {type: 'quiz', passingScore: 60},
    competencyDimension: '沟通表达',
    isActive: true,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
  },
  {
    id: 'c2',
    title: '技术面试核心能力提升',
    description: '针对专业技术面试中常见薄弱点进行强化训练',
    category: '专业能力',
    difficulty: '中级',
    durationMinutes: 60,
    content: [
      {sectionTitle: '常见技术面试题解析', contentType: 'text', text: '分析高频技术面试题的答题思路...'},
      {sectionTitle: '项目经验梳理', contentType: 'text', text: '如何将项目经验转化为有说服力的回答...'},
    ],
    materials: [
      {title: '技术面试高频题库', type: 'exercise'},
    ],
    assessmentConfig: {type: 'ai_review', passingScore: 70},
    competencyDimension: '专业能力',
    isActive: true,
    createdAt: '2026-05-10T00:00:00Z',
    updatedAt: '2026-05-10T00:00:00Z',
  },
  {
    id: 'c3',
    title: '压力面试与应变能力训练',
    description: '模拟压力场景，学习快速思考和临场应变技巧',
    category: '应变能力',
    difficulty: '高级',
    durationMinutes: 40,
    content: [
      {sectionTitle: '压力面试常见套路', contentType: 'text', text: '识别压力面试中的常见陷阱...'},
      {sectionTitle: '情绪管理技巧', contentType: 'text', text: '在高压环境下保持冷静的方法...'},
    ],
    materials: [
      {title: '模拟面试场景', type: 'exercise'},
    ],
    assessmentConfig: {type: 'quiz', passingScore: 60},
    competencyDimension: '应变能力',
    isActive: true,
    createdAt: '2026-05-15T00:00:00Z',
    updatedAt: '2026-05-15T00:00:00Z',
  },
  {
    id: 'c4',
    title: '综合素质面试准备',
    description: '职业规划、团队协作、领导力等软素质提升',
    category: '综合素质',
    difficulty: '初级',
    durationMinutes: 35,
    content: [
      {sectionTitle: '职业规划表述', contentType: 'text', text: '如何清晰表达职业规划...'},
      {sectionTitle: '团队协作案例', contentType: 'text', text: '用案例展示团队协作能力...'},
    ],
    materials: [
      {title: '软素质面试指南', type: 'article'},
    ],
    assessmentConfig: {type: 'quiz', passingScore: 60},
    competencyDimension: '综合素质',
    isActive: true,
    createdAt: '2026-05-20T00:00:00Z',
    updatedAt: '2026-05-20T00:00:00Z',
  },
];

export const enrollmentFixtures: TrainingEnrollment[] = [
  {
    id: 'e1', candidateId: 'cand1', candidateName: '张三',
    courseId: 'c1', courseTitle: '结构化表达与沟通技巧', courseCategory: '沟通表达',
    status: 'completed', enrolledAt: '2026-05-05T00:00:00Z', completedAt: '2026-05-08T00:00:00Z',
    progressPct: 100, finalScore: 82, preInterviewScore: 45, postInterviewScore: 71,
    createdAt: '2026-05-05T00:00:00Z', updatedAt: '2026-05-08T00:00:00Z',
  },
  {
    id: 'e2', candidateId: 'cand2', candidateName: '李四',
    courseId: 'c2', courseTitle: '技术面试核心能力提升', courseCategory: '专业能力',
    status: 'in_progress', enrolledAt: '2026-05-10T00:00:00Z',
    progressPct: 60, preInterviewScore: 38,
    createdAt: '2026-05-10T00:00:00Z', updatedAt: '2026-05-12T00:00:00Z',
  },
  {
    id: 'e3', candidateId: 'cand3', candidateName: '王五',
    courseId: 'c1', courseTitle: '结构化表达与沟通技巧', courseCategory: '沟通表达',
    status: 'enrolled', enrolledAt: '2026-05-20T00:00:00Z',
    progressPct: 0, preInterviewScore: 52,
    createdAt: '2026-05-20T00:00:00Z', updatedAt: '2026-05-20T00:00:00Z',
  },
];
