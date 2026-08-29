import React, {useState, useEffect, useCallback} from 'react';
import {RefreshCw, Loader2, TrendingUp, Award, GraduationCap, Target} from 'lucide-react';
import {getScorecard, recomputeScore, type EmployeeScorecard} from '../api';

interface ScoreCardViewProps {
  employeeId: string;
}

function ScoreNumber({value, label, icon: Icon, color}: {
  value: string | number | null; label: string; icon: React.ElementType; color: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
  };
  return (
    <div className={`rounded-xl p-3 border ${colorMap[color] ?? colorMap.blue}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 opacity-60" />
        <span className="text-xs opacity-70">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value ?? '-'}</div>
    </div>
  );
}

function GradeBadge({grade}: {grade: string | null}) {
  if (!grade) return <span className="text-fg-faint">-</span>;
  const colors: Record<string, string> = {
    S: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    A: 'bg-green-100 text-green-700 border-green-300',
    B: 'bg-blue-100 text-blue-700 border-blue-300',
    C: 'bg-amber-100 text-amber-700 border-amber-300',
    D: 'bg-red-100 text-red-700 border-red-300',
  };
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm font-bold ${colors[grade] ?? colors.B}`}>
      {grade}
    </span>
  );
}

export default function ScoreCardView({employeeId}: ScoreCardViewProps) {
  const [card, setCard] = useState<EmployeeScorecard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCard(await getScorecard(employeeId));
    } catch (e) {
      console.error('Failed to load scorecard', e);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  const handleRecompute = async () => {
    setRefreshing(true);
    try {
      setCard(await recomputeScore(employeeId));
    } catch (e) {
      console.error('Failed to recompute', e);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return <div className="text-xs text-fg-faint py-2">加载评分卡...</div>;

  if (!card) {
    return (
      <div className="mt-3 border-t border-border pt-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-fg-secondary">综合评分</h4>
        </div>
        <div className="text-center py-4 text-sm text-fg-faint">
          暂无评分数据
          <button onClick={handleRecompute} disabled={refreshing}
            className="ml-2 text-blue-500 hover:underline disabled:opacity-50 text-xs">
            {refreshing ? '计算中...' : '立即计算'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-fg-secondary">综合评分</h4>
        <button onClick={handleRecompute} disabled={refreshing}
          className="flex items-center gap-1 text-xs text-[#1a4bc4] hover:underline disabled:opacity-50">
          {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          重新计算
        </button>
      </div>

      {/* Composite score + grade */}
      <div className="flex items-center gap-4 mb-4 bg-surface-muted rounded-xl p-4">
        <div className="text-center">
          <div className="text-3xl font-bold text-fg">{card.compositeScore?.toFixed(1) ?? '-'}</div>
          <div className="text-xs text-fg-muted mt-1">综合评分</div>
        </div>
        <GradeBadge grade={card.compositeGrade} />
        <div className="flex-1 text-xs text-fg-faint">
          加权公式：30% 面试 + 30% 培训 + 40% 绩效
        </div>
      </div>

      {/* Score breakdown */}
      <div className="grid grid-cols-3 gap-3">
        <ScoreNumber
          value={card.interviewScoreLatest?.toFixed(1) ?? null}
          label={`面试 (${card.interviewGradeLatest ?? '-'})`}
          icon={Award}
          color="blue"
        />
        <ScoreNumber
          value={card.trainingScoreAvg?.toFixed(1) ?? null}
          label={`培训 (${card.trainingCoursesPassed}/${card.trainingCoursesTotal})`}
          icon={GraduationCap}
          color="green"
        />
        <ScoreNumber
          value={card.performanceScoreAvg?.toFixed(1) ?? null}
          label={`绩效 (${card.performanceLatestRating ?? '-'})`}
          icon={TrendingUp}
          color="amber"
        />
      </div>

      {/* Training completion */}
      {card.trainingCompletionRate != null && (
        <div className="mt-3 flex items-center gap-2 text-xs text-fg-muted">
          <Target className="w-3.5 h-3.5" />
          培训完成率：{card.trainingCompletionRate.toFixed(0)}%
          {card.trainingCoursesTotal > 0 && (
            <span>({card.trainingCoursesPassed}/{card.trainingCoursesTotal} 门)</span>
          )}
        </div>
      )}
    </div>
  );
}
