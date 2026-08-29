import React, {useState, useEffect, useCallback} from 'react';
import {Sparkles, Loader2, CheckCircle, XCircle, BookOpen, RefreshCw} from 'lucide-react';
import {
  getTrainingRecommendations,
  generateRecommendations,
  updateRecommendationStatus,
  type TrainingRecommendation,
} from '../api';

interface TrainingRecommendationsProps {
  employeeId: string;
}

const reasonLabels: Record<string, {label: string; color: string}> = {
  weakness: {label: '薄弱点', color: 'bg-amber-50 text-amber-600'},
  competency_gap: {label: '胜任力差距', color: 'bg-blue-50 text-blue-600'},
  performance: {label: '绩效提升', color: 'bg-purple-50 text-purple-600'},
  manual: {label: '手动推荐', color: 'bg-surface-muted text-fg-muted'},
};

const statusActions: Record<string, {label: string; color: string}> = {
  pending: {label: '待报名', color: 'text-fg-muted'},
  enrolled: {label: '已报名', color: 'text-blue-500'},
  completed: {label: '已完成', color: 'text-green-500'},
  dismissed: {label: '已忽略', color: 'text-fg-faint'},
};

export default function TrainingRecommendations({employeeId}: TrainingRecommendationsProps) {
  const [recs, setRecs] = useState<TrainingRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRecs(await getTrainingRecommendations(employeeId));
    } catch (e) {
      console.error('Failed to load recommendations', e);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await generateRecommendations(employeeId);
      setRecs(result.recommendations);
    } catch (e) {
      console.error('Failed to generate', e);
    } finally {
      setGenerating(false);
    }
  };

  const handleStatusChange = async (recId: string, status: 'enrolled' | 'completed' | 'dismissed') => {
    setUpdating(recId);
    try {
      await updateRecommendationStatus(employeeId, recId, status);
      setRecs(prev => prev.map(r => r.id === recId ? {...r, status} : r));
    } catch (e) {
      console.error('Failed to update status', e);
    } finally {
      setUpdating(null);
    }
  };

  if (loading) return <div className="text-xs text-fg-faint py-2">加载培训推荐...</div>;

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-fg-secondary">推荐培训</h4>
        <button onClick={handleGenerate} disabled={generating}
          className="flex items-center gap-1 text-xs text-[#1a4bc4] hover:underline disabled:opacity-50">
          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {generating ? '生成中...' : '智能推荐'}
        </button>
      </div>

      {recs.length === 0 ? (
        <div className="text-center py-3 text-xs text-fg-faint">
          暂无推荐 — 点击「智能推荐」根据弱项自动匹配课程
        </div>
      ) : (
        <div className="space-y-2">
          {recs.map(rec => {
            const reasonInfo = reasonLabels[rec.reason] ?? reasonLabels.manual;
            const statusInfo = statusActions[rec.status] ?? statusActions.pending;
            const isUpdating = updating === rec.id;

            return (
              <div key={rec.id} className="flex items-center gap-3 bg-surface-muted rounded-lg p-2.5">
                <BookOpen className="w-4 h-4 text-fg-faint flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-fg-secondary truncate">{rec.courseTitle ?? '未知课程'}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${reasonInfo.color}`}>{reasonInfo.label}</span>
                    {rec.reasonDetail && <span className="text-[11px] text-fg-faint truncate">{rec.reasonDetail}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className={`text-[11px] font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                  {rec.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleStatusChange(rec.id, 'enrolled')}
                        disabled={isUpdating}
                        className="p-1 text-blue-400 hover:text-blue-600 disabled:opacity-50"
                        title="报名"
                      >
                        {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => handleStatusChange(rec.id, 'dismissed')}
                        disabled={isUpdating}
                        className="p-1 text-fg-faint hover:text-fg-muted disabled:opacity-50"
                        title="忽略"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  {rec.status === 'enrolled' && (
                    <button
                      onClick={() => handleStatusChange(rec.id, 'completed')}
                      disabled={isUpdating}
                      className="p-1 text-green-400 hover:text-green-600 disabled:opacity-50"
                      title="标记完成"
                    >
                      {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
