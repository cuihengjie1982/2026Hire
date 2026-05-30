import React, {useEffect, useState} from 'react';
import {motion} from 'motion/react';
import {
  BookOpen, Users, TrendingUp, BarChart3, Plus, Clock, Star,
  CheckCircle, XCircle, PlayCircle, ChevronRight, AlertTriangle,
  Target, Award, ArrowUpRight, Download, Loader2,
} from 'lucide-react';
import {
  listCourses, listEnrollments, createCourse, updateEnrollment, submitAssessment,
  getTrainingStats, getWeaknessAnalysis, getTrainingEffectiveness, exportEnrollmentsCSV,
  recommendCourses, createEnrollment,
  type TrainingCourse, type TrainingEnrollment, type TrainingStats,
  type WeaknessAnalysis, type TrainingEffectiveness,
  type CourseRecommendation,
} from '../api';

type TabId = 'courses' | 'enrollments' | 'analysis' | 'effectiveness';

const TABS: {id: TabId; label: string; icon: React.ElementType}[] = [
  {id: 'courses', label: '课程管理', icon: BookOpen},
  {id: 'enrollments', label: '培训记录', icon: Users},
  {id: 'analysis', label: '薄弱分析', icon: Target},
  {id: 'effectiveness', label: '效果统计', icon: TrendingUp},
];

const CATEGORY_COLORS: Record<string, string> = {
  '沟通表达': 'bg-blue-100 text-blue-700',
  '专业能力': 'bg-purple-100 text-purple-700',
  '应变能力': 'bg-orange-100 text-orange-700',
  '综合素质': 'bg-emerald-100 text-emerald-700',
  '综合': 'bg-gray-100 text-gray-700',
};

const STATUS_LABELS: Record<string, {label: string; color: string}> = {
  enrolled: {label: '已报名', color: 'bg-gray-100 text-gray-600'},
  in_progress: {label: '学习中', color: 'bg-blue-100 text-blue-600'},
  completed: {label: '已完成', color: 'bg-emerald-100 text-emerald-600'},
  failed: {label: '未通过', color: 'bg-red-100 text-red-600'},
};

const DIFFICULTY_LABELS: Record<string, {label: string; color: string}> = {
  '初级': {label: '初级', color: 'bg-green-100 text-green-700'},
  '中级': {label: '中级', color: 'bg-yellow-100 text-yellow-700'},
  '高级': {label: '高级', color: 'bg-red-100 text-red-700'},
};

export const TrainingAcademyPage = () => {
  const [activeTab, setActiveTab] = useState<TabId>('courses');
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [enrollmentList, setEnrollmentList] = useState<TrainingEnrollment[]>([]);
  const [weaknessData, setWeaknessData] = useState<WeaknessAnalysis | null>(null);
  const [effectiveness, setEffectiveness] = useState<TrainingEffectiveness | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateCourse, setShowCreateCourse] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, c, e, w, eff] = await Promise.all([
        getTrainingStats(),
        listCourses(),
        listEnrollments(),
        getWeaknessAnalysis(),
        getTrainingEffectiveness(),
      ]);
      setStats(s);
      setCourses(c.items);
      setEnrollmentList(e.items);
      setWeaknessData(w);
      setEffectiveness(eff);
    } catch (err) {
      console.error('Failed to load training data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCourse = async (input: {
    title: string; category: string; difficulty: string; description: string;
    durationMinutes?: number; content?: {sectionTitle: string; contentType: string; text?: string; contentUrl?: string}[];
    materials?: {title: string; type: string; url?: string}[];
    assessmentConfig?: {type: string; passingScore: number};
    competencyDimension?: string;
  }) => {
    try {
      await createCourse({
        ...input,
        difficulty: input.difficulty as '初级' | '中级' | '高级',
        content: input.content?.map(s => ({...s, contentType: s.contentType as 'text' | 'video' | 'link'})),
        materials: input.materials?.map(m => ({...m, type: m.type as 'pdf' | 'video' | 'article' | 'exercise'})),
      } as Parameters<typeof createCourse>[0]);
      const c = await listCourses();
      setCourses(c.items);
      setShowCreateCourse(false);
    } catch (err) {
      console.error('Failed to create course:', err);
    }
  };

  const handleScoreSubmit = async (enrollmentId: string, score: number) => {
    try {
      await submitAssessment(enrollmentId, {score});
      const e = await listEnrollments();
      setEnrollmentList(e.items);
      const s = await getTrainingStats();
      setStats(s);
    } catch (err) {
      console.error('Failed to submit assessment:', err);
    }
  };

  if (loading) {
    return (
      <div className="max-w-[1500px] mx-auto w-full p-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="h-7 w-44 rounded-lg bg-gray-100 animate-pulse" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-28 rounded-xl bg-gray-100 animate-pulse" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1500px] mx-auto w-full p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-[#1a4bc4] to-[#6366F1] rounded-xl flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">培训学堂</h1>
            <p className="text-sm text-gray-500">面试薄弱点分析 → 针对性培训 → 提升通过率</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard icon={BookOpen} label="活跃课程" value={stats.totalCourses} color="blue" />
          <StatsCard icon={PlayCircle} label="在训学员" value={stats.activeEnrollments} color="purple" />
          <StatsCard icon={CheckCircle} label="已完成" value={stats.completedEnrollments} color="emerald" />
          <StatsCard icon={TrendingUp} label="完成率" value={`${stats.completionRate}%`} color="orange" />
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
                isActive ? 'bg-white text-[#1a4bc4] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <motion.div key={activeTab} initial={{opacity: 0, y: 8}} animate={{opacity: 1, y: 0}} transition={{duration: 0.2}}>
        {activeTab === 'courses' && (
          <CoursesTab
            courses={courses}
            onAdd={() => setShowCreateCourse(true)}
          />
        )}
        {activeTab === 'enrollments' && (
          <EnrollmentsTab
            enrollments={enrollmentList}
            onScore={handleScoreSubmit}
            onExport={() => exportEnrollmentsCSV()}
          />
        )}
        {activeTab === 'analysis' && weaknessData && (
          <AnalysisTab data={weaknessData} courses={courses} />
        )}
        {activeTab === 'effectiveness' && effectiveness && (
          <EffectivenessTab data={effectiveness} />
        )}
      </motion.div>

      {/* Create Course Modal */}
      {showCreateCourse && (
        <CreateCourseModal
          onClose={() => setShowCreateCourse(false)}
          onSubmit={handleCreateCourse}
        />
      )}
    </div>
  );
};

// ─── Sub-components ──────────────────────────────────────────────────────

const StatsCard = ({icon: Icon, label, value, color}: {
  icon: React.ElementType; label: string; value: number | string; color: string;
}) => {
  const bgMap: Record<string, string> = {
    blue: 'from-blue-500/10 to-blue-500/5',
    purple: 'from-purple-500/10 to-purple-500/5',
    emerald: 'from-emerald-500/10 to-emerald-500/5',
    orange: 'from-orange-500/10 to-orange-500/5',
  };
  const iconMap: Record<string, string> = {
    blue: 'text-blue-500', purple: 'text-purple-500',
    emerald: 'text-emerald-500', orange: 'text-orange-500',
  };

  return (
    <div className={`bg-gradient-to-br ${bgMap[color]} rounded-xl p-4 border border-gray-100`}>
      <div className="flex items-center gap-3">
        <Icon className={`w-5 h-5 ${iconMap[color]}`} />
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
};

const CoursesTab = ({courses, onAdd}: {courses: TrainingCourse[]; onAdd: () => void}) => {
  const [filter, setFilter] = useState('');
  const filtered = filter ? courses.filter(c => c.category === filter) : courses;
  const categories = [...new Set(courses.map(c => c.category))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button onClick={() => setFilter('')} className={`px-3 py-1.5 rounded-lg text-sm ${!filter ? 'bg-[#1a4bc4] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            全部
          </button>
          {categories.map(cat => (
            <button key={cat} onClick={() => setFilter(cat)} className={`px-3 py-1.5 rounded-lg text-sm ${filter === cat ? 'bg-[#1a4bc4] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {cat}
            </button>
          ))}
        </div>
        <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm hover:bg-[#153da0] transition-colors">
          <Plus className="w-4 h-4" /> 新建课程
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(course => (
          <div key={course.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">{course.title}</h3>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{course.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[course.category] ?? 'bg-gray-100 text-gray-600'}`}>
                {course.category}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${(DIFFICULTY_LABELS[course.difficulty]?.color ?? 'bg-gray-100 text-gray-600')}`}>
                {DIFFICULTY_LABELS[course.difficulty]?.label ?? course.difficulty}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{course.durationMinutes} 分钟</span>
              <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{course.content.length} 章节</span>
              <span className="flex items-center gap-1"><Star className="w-3 h-3" />及格 {course.assessmentConfig.passingScore}分</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const EnrollmentsTab = ({enrollments, onScore, onExport}: {enrollments: TrainingEnrollment[]; onScore: (id: string, score: number) => void; onExport: () => void}) => {
  const [statusFilter, setStatusFilter] = useState('');
  const [scoringId, setScoringId] = useState<string | null>(null);
  const [scoreInput, setScoreInput] = useState('');

  const filtered = statusFilter ? enrollments.filter(e => e.status === statusFilter) : enrollments;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
        {['', 'enrolled', 'in_progress', 'completed', 'failed'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm ${statusFilter === s ? 'bg-[#1a4bc4] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {s === '' ? '全部' : (STATUS_LABELS[s]?.label ?? s)}
          </button>
        ))}
      </div>
      <button onClick={onExport} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors">
        <Download className="w-4 h-4" /> 导出 CSV
      </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-gray-500 font-medium">学员</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">课程</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">状态</th>
              <th className="text-center px-4 py-3 text-gray-500 font-medium">进度</th>
              <th className="text-center px-4 py-3 text-gray-500 font-medium">培训前</th>
              <th className="text-center px-4 py-3 text-gray-500 font-medium">考核分</th>
              <th className="text-center px-4 py-3 text-gray-500 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(enrollment => {
              const st = STATUS_LABELS[enrollment.status] ?? {label: enrollment.status, color: 'bg-gray-100 text-gray-600'};
              const isScoring = scoringId === enrollment.id;
              return (
                <tr key={enrollment.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{enrollment.candidateName}</td>
                  <td className="px-4 py-3">
                    <div className="text-gray-900">{enrollment.courseTitle}</div>
                    <div className="text-xs text-gray-400">{enrollment.courseCategory}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${st.color}`}>{st.label}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-[#1a4bc4] rounded-full" style={{width: `${enrollment.progressPct}%`}} />
                      </div>
                      <span className="text-xs text-gray-500">{enrollment.progressPct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{enrollment.preInterviewScore ?? '-'}</td>
                  <td className="px-4 py-3 text-center font-medium">
                    {enrollment.finalScore !== undefined ? (
                      <span className={enrollment.finalScore >= 60 ? 'text-emerald-600' : 'text-red-500'}>
                        {enrollment.finalScore}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {(enrollment.status === 'enrolled' || enrollment.status === 'in_progress') && !isScoring && (
                      <button onClick={() => { setScoringId(enrollment.id); setScoreInput(''); }}
                        className="text-xs px-3 py-1.5 bg-[#1a4bc4] text-white rounded-lg hover:bg-[#153da0]">
                        录入考核
                      </button>
                    )}
                    {isScoring && (
                      <div className="flex items-center gap-2 justify-center">
                        <input type="number" min="0" max="100" value={scoreInput}
                          onChange={e => setScoreInput(e.target.value)}
                          className="w-16 px-2 py-1 border rounded text-center text-sm"
                          placeholder="分数" />
                        <button onClick={() => {
                          const s = parseFloat(scoreInput);
                          if (!isNaN(s) && s >= 0 && s <= 100) { onScore(enrollment.id, s); setScoringId(null); }
                        }} className="text-xs px-2 py-1 bg-emerald-500 text-white rounded hover:bg-emerald-600">
                          确认
                        </button>
                        <button onClick={() => setScoringId(null)} className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded hover:bg-gray-300">
                          取消
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
            暂无培训记录
          </div>
        )}
      </div>
    </div>
  );
};

const AnalysisTab = ({data, courses}: {data: WeaknessAnalysis; courses: TrainingCourse[]}) => {
  const maxFreq = data.weaknesses.length > 0 ? Math.max(...data.weaknesses.map(w => w.frequency)) : 1;
  const [candidateIdInput, setCandidateIdInput] = useState('');
  const [candidateNameInput, setCandidateNameInput] = useState('');
  const [recommendation, setRecommendation] = useState<CourseRecommendation | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRecommend = async () => {
    if (!candidateIdInput.trim()) return;
    setLoading(true);
    try {
      const result = await recommendCourses(candidateIdInput);
      setRecommendation(result);
    } catch { setRecommendation(null); }
    finally { setLoading(false); }
  };

  const handleEnroll = async (courseId: string) => {
    if (!candidateIdInput.trim() || !candidateNameInput.trim()) return;
    try {
      await createEnrollment({
        candidateId: candidateIdInput,
        candidateName: candidateNameInput,
        courseId,
      });
      setRecommendation(prev => prev ? {...prev, recommendations: prev.recommendations.filter(c => c.id !== courseId)} : null);
    } catch { /* already enrolled */ }
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-5 border border-amber-200">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          <span className="font-semibold text-amber-800">面试薄弱点分析</span>
        </div>
        <p className="text-sm text-amber-700">
          基于 <strong>{data.totalAnalyzed}</strong> 份面试不通过记录分析，发现以下高频薄弱维度
        </p>
      </div>

      {/* Weakness Bars */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Target className="w-4 h-4 text-red-500" /> 薄弱维度排名
        </h3>
        {data.weaknesses.map((w, i) => {
          const matchingCourses = courses.filter(c => c.category === w.dimension || c.competencyDimension === w.dimension);
          return (
            <div key={w.dimension} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 text-xs flex items-center justify-center font-bold">{i + 1}</span>
                  <span className="font-medium text-gray-900">{w.dimension}</span>
                  <span className="text-xs text-gray-400">平均分 {w.avgScore}</span>
                </div>
                <span className="text-sm text-red-500 font-medium">{w.frequency} 人次</span>
              </div>
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-full transition-all"
                  style={{width: `${(w.frequency / maxFreq) * 100}%`}} />
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-400">
                  受影响: {w.affectedCandidates.slice(0, 4).join('、')}{w.affectedCandidates.length > 4 ? ` 等${w.affectedCandidates.length}人` : ''}
                </div>
                {matchingCourses.length > 0 && (
                  <span className="text-xs text-[#1a4bc4] flex items-center gap-1">
                    <BookOpen className="w-3 h-3" /> {matchingCourses.length} 门相关课程
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Course Recommendation */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Award className="w-4 h-4 text-[#1a4bc4]" /> 智能推荐课程
        </h3>
        <p className="text-sm text-gray-500">输入候选人 ID 和姓名，系统根据面试薄弱维度自动推荐匹配课程</p>
        <div className="flex items-center gap-3">
          <input value={candidateIdInput} onChange={e => setCandidateIdInput(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
            placeholder="候选人 ID" />
          <input value={candidateNameInput} onChange={e => setCandidateNameInput(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
            placeholder="候选人姓名" />
          <button onClick={handleRecommend} disabled={loading || !candidateIdInput.trim()}
            className="px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm hover:bg-[#153da0] disabled:opacity-50 whitespace-nowrap">
            {loading ? '分析中...' : '推荐课程'}
          </button>
        </div>

        {recommendation && (
          <div className="space-y-3 mt-4">
            {recommendation.dimensions.length > 0 && (
              <div className="flex gap-2">
                <span className="text-sm text-gray-500">薄弱维度:</span>
                {recommendation.dimensions.map(d => (
                  <span key={d} className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">{d}</span>
                ))}
              </div>
            )}
            {recommendation.recommendations.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {recommendation.recommendations.map(course => (
                  <div key={course.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{course.title}</div>
                      <div className="text-xs text-gray-500">{course.category} · {course.difficulty}</div>
                    </div>
                    <button onClick={() => handleEnroll(course.id)}
                      className="px-3 py-1.5 bg-[#1a4bc4] text-white rounded-lg text-xs hover:bg-[#153da0] whitespace-nowrap">
                      报名
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">该候选人无薄弱维度或暂无匹配课程</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const EffectivenessTab = ({data}: {data: TrainingEffectiveness}) => {
  return (
    <div className="space-y-6">
      {/* Overall */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
          <div className="text-3xl font-bold text-gray-900">{data.totalCompleted}</div>
          <div className="text-sm text-gray-500 mt-1">培训完成人次</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
          <div className="text-3xl font-bold text-emerald-600">+{data.avgImprovement}</div>
          <div className="text-sm text-gray-500 mt-1">平均分数提升</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
          <div className="text-3xl font-bold text-[#1a4bc4]">{data.improvementRate}%</div>
          <div className="text-sm text-gray-500 mt-1">提升率</div>
        </div>
      </div>

      {/* By Category */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#1a4bc4]" /> 各维度培训效果
        </h3>
        <div className="space-y-4">
          {Object.entries(data.byCategory).map(([category, stat]) => {
            const improvement = stat.avgPost - stat.avgPre;
            const barWidth = Math.min(100, (stat.avgPost / 100) * 100);
            return (
              <div key={category} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[category] ?? 'bg-gray-100 text-gray-600'}`}>
                      {category}
                    </span>
                    <span className="text-xs text-gray-400">{stat.count} 人次</span>
                  </div>
                  <div className="flex items-center gap-1 text-sm">
                    <span className="text-gray-400">{stat.avgPre}</span>
                    <ArrowUpRight className="w-3 h-3 text-emerald-500" />
                    <span className="font-medium text-emerald-600">{stat.avgPost}</span>
                    <span className="text-xs text-emerald-500">(+{improvement.toFixed(1)})</span>
                  </div>
                </div>
                <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gray-300 rounded-full" style={{width: `${(stat.avgPre / 100) * 100}%`}} />
                  <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-[#1a4bc4] to-[#6366F1] rounded-full transition-all"
                    style={{width: `${barWidth}%`}} />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">提升率: {stat.count > 0 ? Math.round((stat.improved / stat.count) * 100) : 0}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const CreateCourseModal = ({onClose, onSubmit}: {
  onClose: () => void;
  onSubmit: (input: {
    title: string; category: string; difficulty: string; description: string;
    durationMinutes?: number; content?: {sectionTitle: string; contentType: string; text?: string; contentUrl?: string}[];
    materials?: {title: string; type: string; url?: string}[];
    assessmentConfig?: {type: string; passingScore: number};
    competencyDimension?: string;
  }) => Promise<void>;
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('沟通表达');
  const [difficulty, setDifficulty] = useState('初级');
  const [desc, setDesc] = useState('');
  const [duration, setDuration] = useState(30);
  const [sections, setSections] = useState<{sectionTitle: string; contentType: string; text: string; contentUrl: string}[]>([]);
  const [materials, setMaterials] = useState<{title: string; type: string; url: string}[]>([]);
  const [passingScore, setPassingScore] = useState(60);
  const [assessType, setAssessType] = useState('quiz');
  const [competencyDim, setCompetencyDim] = useState('');
  const [showContentEditor, setShowContentEditor] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addSection = () => setSections(s => [...s, {sectionTitle: '', contentType: 'text', text: '', contentUrl: ''}]);
  const updateSection = (i: number, field: string, val: string) => {
    setSections(s => s.map((sec, idx) => idx === i ? {...sec, [field]: val} : sec));
  };
  const removeSection = (i: number) => setSections(s => s.filter((_, idx) => idx !== i));

  const addMaterial = () => setMaterials(m => [...m, {title: '', type: 'article', url: ''}]);
  const updateMaterial = (i: number, field: string, val: string) => {
    setMaterials(m => m.map((mat, idx) => idx === i ? {...mat, [field]: val} : mat));
  };
  const removeMaterial = (i: number) => setMaterials(m => m.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    if (!title.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit({
        title, category, difficulty, description: desc,
        durationMinutes: duration,
        content: sections.filter(s => s.sectionTitle.trim()).map(s => ({
          sectionTitle: s.sectionTitle,
          contentType: s.contentType as 'text' | 'video' | 'link',
          text: s.text,
          contentUrl: s.contentUrl,
        })),
        materials: materials.filter(m => m.title.trim()).map(m => ({
          title: m.title,
          type: m.type as 'pdf' | 'video' | 'article' | 'exercise',
          url: m.url,
        })),
        assessmentConfig: {type: assessType, passingScore},
        competencyDimension: competencyDim || undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <motion.div initial={{opacity: 0, scale: 0.95}} animate={{opacity: 1, scale: 1}}
        className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">新建培训课程</h3>
        <div className="space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">课程标题 *</label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]" placeholder="输入课程标题" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">时长 (分钟)</label>
              <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">分类维度</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]">
                <option value="沟通表达">沟通表达</option>
                <option value="专业能力">专业能力</option>
                <option value="应变能力">应变能力</option>
                <option value="综合素质">综合素质</option>
                <option value="综合">综合</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">难度</label>
              <select value={difficulty} onChange={e => setDifficulty(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]">
                <option value="初级">初级</option>
                <option value="中级">中级</option>
                <option value="高级">高级</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">胜任力维度</label>
              <input value={competencyDim} onChange={e => setCompetencyDim(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]" placeholder="可选" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">课程描述</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]" placeholder="描述课程内容和学习目标" />
          </div>

          {/* Content Sections Toggle */}
          <div className="border-t pt-4">
            <button onClick={() => setShowContentEditor(v => !v)}
              className="flex items-center gap-2 text-sm font-medium text-[#1a4bc4] hover:text-[#153da0]">
              <ChevronRight className={`w-4 h-4 transition-transform ${showContentEditor ? 'rotate-90' : ''}`} />
              课程章节内容 ({sections.length})
            </button>
            {showContentEditor && (
              <div className="mt-3 space-y-3">
                {sections.map((sec, i) => (
                  <div key={i} className="flex items-start gap-2 bg-gray-50 p-3 rounded-lg">
                    <div className="flex-1 space-y-2">
                      <input value={sec.sectionTitle} onChange={e => updateSection(i, 'sectionTitle', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm" placeholder="章节标题" />
                      <div className="flex gap-2">
                        <select value={sec.contentType} onChange={e => updateSection(i, 'contentType', e.target.value)}
                          className="px-2 py-1 border rounded text-sm">
                          <option value="text">文字</option>
                          <option value="video">视频</option>
                          <option value="link">链接</option>
                        </select>
                        {sec.contentType === 'text' ? (
                          <textarea value={sec.text} onChange={e => updateSection(i, 'text', e.target.value)}
                            className="flex-1 px-2 py-1 border rounded text-sm" rows={2} placeholder="文字内容" />
                        ) : (
                          <input value={sec.contentUrl} onChange={e => updateSection(i, 'contentUrl', e.target.value)}
                            className="flex-1 px-2 py-1 border rounded text-sm" placeholder="URL" />
                        )}
                      </div>
                    </div>
                    <button onClick={() => removeSection(i)} className="text-red-400 hover:text-red-600 text-xs mt-1">删除</button>
                  </div>
                ))}
                <button onClick={addSection} className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
                  + 添加章节
                </button>
              </div>
            )}
          </div>

          {/* Materials */}
          <div className="border-t pt-4">
            <button onClick={() => {}} className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-2">
              参考资料 ({materials.length})
            </button>
            {materials.map((mat, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <input value={mat.title} onChange={e => updateMaterial(i, 'title', e.target.value)}
                  className="flex-1 px-2 py-1 border rounded text-sm" placeholder="参考资料标题" />
                <select value={mat.type} onChange={e => updateMaterial(i, 'type', e.target.value)}
                  className="px-2 py-1 border rounded text-sm">
                  <option value="article">文章</option>
                  <option value="pdf">PDF</option>
                  <option value="video">视频</option>
                  <option value="exercise">练习</option>
                </select>
                <input value={mat.url} onChange={e => updateMaterial(i, 'url', e.target.value)}
                  className="w-40 px-2 py-1 border rounded text-sm" placeholder="URL (可选)" />
                <button onClick={() => removeMaterial(i)} className="text-red-400 hover:text-red-600 text-xs">删除</button>
              </div>
            ))}
            <button onClick={addMaterial} className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
              + 添加参考资料
            </button>
          </div>

          {/* Assessment Config */}
          <div className="border-t pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">考核方式</label>
                <select value={assessType} onChange={e => setAssessType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]">
                  <option value="quiz">测验</option>
                  <option value="ai_review">AI 评审</option>
                  <option value="manual">人工评审</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">及格分数</label>
                <input type="number" min="0" max="100" value={passingScore} onChange={e => setPassingScore(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
          <button onClick={handleSubmit}
            className="px-4 py-2 text-sm bg-[#1a4bc4] text-white rounded-lg hover:bg-[#153da0] disabled:opacity-50 flex items-center gap-2"
            disabled={!title.trim() || isSubmitting}>
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? '创建中...' : '创建课程'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default TrainingAcademyPage;
