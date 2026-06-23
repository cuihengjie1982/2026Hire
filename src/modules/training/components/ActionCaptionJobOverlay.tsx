import {useEffect, useState} from 'react';
import {AlertTriangle, CheckCircle, Loader2, Sparkles} from 'lucide-react';
import {
  listActionCaptionJobs,
  subscribeActionCaptionJobs,
  type ActionCaptionJob,
} from '../actionCaptionJobs';

export const ActionCaptionJobOverlay = () => {
  const [jobs, setJobs] = useState<ActionCaptionJob[]>(() => listActionCaptionJobs());
  const visibleJobs = jobs.filter(job => job.status === 'running' || Date.now() - job.updatedAt < 12000);
  const runningCount = jobs.filter(job => job.status === 'running').length;

  useEffect(() => subscribeActionCaptionJobs(setJobs), []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (listActionCaptionJobs().some(job => job.status === 'running' && job.progress < 70)) {
        event.preventDefault();
        event.returnValue = '动作流正在抽取视频画面，刷新或关闭页面会中断提交。';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  if (!visibleJobs.length) return null;

  return (
    <div className="fixed right-6 bottom-28 z-[9998] w-80 space-y-2 pointer-events-none">
      {visibleJobs.slice(0, 3).map(job => {
        const isRunning = job.status === 'running';
        const isFailed = job.status === 'failed';
        return (
          <div key={job.id} className="rounded-xl border border-gray-200 bg-white shadow-lg p-3 pointer-events-auto">
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 ${isRunning ? 'text-indigo-600' : isFailed ? 'text-red-500' : 'text-emerald-500'}`}>
                {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : isFailed ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  {isRunning ? '动作流生成中' : isFailed ? '动作流生成失败' : '动作流已生成'}
                </p>
                <p className="text-xs text-gray-500 truncate mt-0.5">{job.courseTitle}</p>
                {isRunning ? (
                  <div className="mt-2">
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full bg-indigo-600 transition-all" style={{width: `${Math.max(4, job.progress)}%`}} />
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {job.progress < 70
                        ? `${job.progress}% · 正在抽取视频画面，请不要刷新或关闭浏览器标签页`
                        : `${job.progress}% · 已提交后台，切换系统页面不会中断`}
                    </p>
                  </div>
                ) : (
                  <p className={`text-xs mt-1 ${isFailed ? 'text-red-600' : 'text-emerald-600'}`}>
                    {isFailed ? (job.error || '请重新生成') : '回到视频分享页后会自动刷新状态'}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {runningCount > 3 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-lg p-3 text-xs text-gray-500">
          还有 {runningCount - 3} 个动作流任务正在生成
        </div>
      )}
    </div>
  );
};
