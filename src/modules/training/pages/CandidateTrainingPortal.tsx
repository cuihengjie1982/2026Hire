import {motion} from 'motion/react';
import {useEffect, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {
  BookOpen, CheckCircle, ChevronRight, Clock, GraduationCap,
  Loader2, XCircle, AlertCircle, TrendingUp, Award,
} from 'lucide-react';

interface PortalEnrollment {
  id: string;
  candidate_id: string;
  candidate_name: string;
  course_id: string;
  course_title: string;
  course_category: string;
  course_description: string;
  difficulty: string;
  duration_minutes: number;
  status: 'enrolled' | 'in_progress' | 'completed' | 'failed';
  enrolled_at: string;
  completed_at: string | null;
  progress_pct: number;
  final_score: number | null;
  pre_interview_score: number | null;
  post_interview_score: number | null;
  notes: string | null;
  assessments: PortalAssessment[];
}

interface PortalAssessment {
  id: string;
  enrollment_id: string;
  score: number;
  passed: boolean;
  answers: unknown[];
  assessor: string | null;
  feedback: string | null;
  created_at: string;
}

interface PortalData {
  candidate: {id: string; name: string; email: string; phone: string} | null;
  enrollments: PortalEnrollment[];
}

const STATUS_LABELS: Record<string, string> = {
  enrolled: '已报名',
  in_progress: '学习中',
  completed: '已完成',
  failed: '未通过',
};

const STATUS_COLORS: Record<string, string> = {
  enrolled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  '初级': 'bg-green-100 text-green-700',
  '中级': 'bg-amber-100 text-amber-700',
  '高级': 'bg-red-100 text-red-700',
};

const formatDate = (d: string | null) => {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit'});
};

export const CandidateTrainingPortal = () => {
  const [searchParams] = useSearchParams();
  const candidateId = searchParams.get('cid') ?? '';
  const token = searchParams.get('token') ?? '';

  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!candidateId) {
      setError('缺少候选人 ID 参数 (cid)');
      setLoading(false);
      return;
    }

    const qs = token ? `?token=${encodeURIComponent(token)}` : '';
    fetch(`/api/training/portal/${encodeURIComponent(candidateId)}${qs}`)
      .then(r => {
        if (!r.ok) throw new Error(r.status === 403 ? '访问被拒绝' : '加载失败');
        return r.json();
      })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [candidateId, token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  const candidate = data?.candidate;
  const enrollments = data?.enrollments ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-100 rounded-xl">
              <GraduationCap className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">培训学习中心</h1>
              {candidate && (
                <p className="text-sm text-gray-500">欢迎，{candidate.name}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      {enrollments.length > 0 && (
        <div className="max-w-4xl mx-auto px-6 pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">培训课程</p>
              <p className="text-2xl font-bold text-gray-900">{enrollments.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">已完成</p>
              <p className="text-2xl font-bold text-green-600">
                {enrollments.filter(e => e.status === 'completed').length}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">学习中</p>
              <p className="text-2xl font-bold text-amber-600">
                {enrollments.filter(e => e.status === 'enrolled' || e.status === 'in_progress').length}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">平均分</p>
              <p className="text-2xl font-bold text-indigo-600">
                {(() => {
                  const scores = enrollments.filter(e => e.final_score != null).map(e => e.final_score!);
                  return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : '-';
                })()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Enrollments list */}
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
        {enrollments.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">暂无培训记录</p>
            <p className="text-sm text-gray-400 mt-1">联系您的招聘负责人获取培训安排</p>
          </div>
        ) : (
          enrollments.map((enrollment, idx) => (
            <motion.div
              key={enrollment.id}
              initial={{opacity: 0, y: 12}}
              animate={{opacity: 1, y: 0}}
              transition={{delay: idx * 0.05}}
              className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
            >
              {/* Card header */}
              <button
                className="w-full text-left p-5 hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedId(expandedId === enrollment.id ? null : enrollment.id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 truncate">{enrollment.course_title}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[enrollment.status]}`}>
                        {STATUS_LABELS[enrollment.status]}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{enrollment.course_category}</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${DIFFICULTY_COLORS[enrollment.difficulty] ?? 'bg-gray-100 text-gray-600'}`}>
                        {enrollment.difficulty}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {enrollment.duration_minutes} 分钟
                      </span>
                    </div>
                  </div>
                  <ChevronRight
                    className={`w-5 h-5 text-gray-400 mt-1 transition-transform flex-shrink-0 ${
                      expandedId === enrollment.id ? 'rotate-90' : ''
                    }`}
                  />
                </div>

                {/* Progress bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>学习进度</span>
                    <span>{enrollment.progress_pct}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{width: 0}}
                      animate={{width: `${enrollment.progress_pct}%`}}
                      transition={{duration: 0.5, delay: idx * 0.05}}
                      className={`h-full rounded-full ${
                        enrollment.status === 'failed' ? 'bg-red-400' :
                        enrollment.status === 'completed' ? 'bg-green-400' : 'bg-indigo-400'
                      }`}
                    />
                  </div>
                </div>
              </button>

              {/* Expanded details */}
              {expandedId === enrollment.id && (
                <motion.div
                  initial={{height: 0, opacity: 0}}
                  animate={{height: 'auto', opacity: 1}}
                  className="border-t border-gray-100 p-5 space-y-4 bg-gray-50/50"
                >
                  {/* Course description */}
                  {enrollment.course_description && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">课程简介</p>
                      <p className="text-sm text-gray-700">{enrollment.course_description}</p>
                    </div>
                  )}

                  {/* Score comparison */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
                      <p className="text-xs text-gray-500 mb-1">培训前面试分</p>
                      <p className="text-lg font-bold text-gray-700">
                        {enrollment.pre_interview_score != null ? enrollment.pre_interview_score : '-'}
                      </p>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
                      <p className="text-xs text-gray-500 mb-1">考核分</p>
                      <p className={`text-lg font-bold ${
                        enrollment.final_score != null && enrollment.final_score >= 60 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {enrollment.final_score != null ? enrollment.final_score : '-'}
                      </p>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
                      <p className="text-xs text-gray-500 mb-1">培训后面试分</p>
                      <p className="text-lg font-bold text-gray-700">
                        {enrollment.post_interview_score != null ? enrollment.post_interview_score : '-'}
                      </p>
                    </div>
                  </div>

                  {/* Improvement indicator */}
                  {enrollment.pre_interview_score != null && enrollment.post_interview_score != null && (
                    <div className="flex items-center gap-2 text-sm">
                      <TrendingUp className="w-4 h-4 text-green-500" />
                      <span className="text-gray-600">提升：</span>
                      <span className="font-semibold text-green-600">
                        +{(enrollment.post_interview_score - enrollment.pre_interview_score).toFixed(1)} 分
                      </span>
                    </div>
                  )}

                  {/* Assessments */}
                  {enrollment.assessments.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-2">考核记录</p>
                      <div className="space-y-2">
                        {enrollment.assessments.map(a => (
                          <div key={a.id} className="bg-white rounded-lg border border-gray-200 p-3">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                {a.passed ? (
                                  <CheckCircle className="w-4 h-4 text-green-500" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-red-400" />
                                )}
                                <span className="text-sm font-medium text-gray-700">
                                  {a.passed ? '通过' : '未通过'}
                                </span>
                              </div>
                              <span className="text-sm font-bold text-gray-900">{a.score} 分</span>
                            </div>
                            {a.feedback && (
                              <p className="text-xs text-gray-500 mt-1">{a.feedback}</p>
                            )}
                            <p className="text-xs text-gray-400 mt-1">{formatDate(a.created_at)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {enrollment.notes && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">备注</p>
                      <p className="text-sm text-gray-600">{enrollment.notes}</p>
                    </div>
                  )}

                  {/* Dates */}
                  <div className="flex gap-4 text-xs text-gray-400">
                    <span>报名：{formatDate(enrollment.enrolled_at)}</span>
                    {enrollment.completed_at && <span>完成：{formatDate(enrollment.completed_at)}</span>}
                  </div>
                </motion.div>
              )}
            </motion.div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="max-w-4xl mx-auto px-6 pb-8 text-center">
        <p className="text-xs text-gray-400">
          EM-BOX 智能招聘管理系统 · 培训学习中心
        </p>
      </div>
    </div>
  );
};
