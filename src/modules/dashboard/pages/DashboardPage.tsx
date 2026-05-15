import {motion, AnimatePresence} from 'motion/react';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  Folder,
  Plus,
  Search,
  Trophy,
  Upload,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {useEffect, useMemo, useState, useCallback} from 'react';
import {listCandidates, getTalentStats} from '../../talent/api';
import {listInterviewResults} from '../../interviews/api';
import {listApprovalRequests} from '../../approvals/api';
import {listOutreachRecords} from '../../outreach/api';
import {listAgents} from '../../agents/api';
import {getItemsFromPayload} from '../../../shared/lib/apiClient';
import {getUserName} from '../../../shared/lib/runtime';
import type {InterviewResult} from '../../interviews/types';
import type {ApprovalRequestSummary} from '../../approvals/types';
import type {OutreachRecord} from '../../outreach/types';
import type {Agent} from '../../agents/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TimeRange = 'today' | 'week' | 'month' | 'custom';

type DateRange = {
  start: Date;
  end: Date;
};

type StatCard = {
  label: string;
  value: string | number;
  icon: typeof Users;
  color: string;
  iconBg: string;
  change?: string;
};

type QuickAction = {
  label: string;
  icon: typeof Plus;
  color: string;
  path: string;
};

type TodayTask = {
  id: string;
  title: string;
  subtitle: string;
  status: 'pending' | 'done' | 'urgent';
  icon: typeof Clock;
  path: string;
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const RANGE_LABELS: Record<TimeRange, string> = {
  today: '今日',
  week: '本周',
  month: '本月',
  custom: '自定义',
};

function getDateRange(range: TimeRange, customStart?: Date, customEnd?: Date): DateRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (range) {
    case 'today':
      return {start: today, end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)};
    case 'week': {
      const day = today.getDay() || 7; // Monday = 1
      const monday = new Date(today.getTime() - (day - 1) * 24 * 60 * 60 * 1000);
      const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000 - 1);
      return {start: monday, end: sunday};
    }
    case 'month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return {start: first, end: last};
    }
    case 'custom': {
      const s = customStart ?? today;
      const e = customEnd ? new Date(customEnd.getFullYear(), customEnd.getMonth(), customEnd.getDate(), 23, 59, 59, 999) : new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);
      return {start: s, end: e};
    }
  }
}

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatRangeLabel(range: DateRange): string {
  return `${range.start.toLocaleDateString('zh-CN', {month: 'short', day: 'numeric'})} — ${range.end.toLocaleDateString('zh-CN', {month: 'short', day: 'numeric'})}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const DashboardPage = () => {
  const navigate = useNavigate();
  const [allResults, setAllResults] = useState<InterviewResult[]>([]);
  const [allCandidateCount, setAllCandidateCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [userName] = useState(() => getUserName() ?? '用户');

  // Dynamic task counts
  const [taskCounts, setTaskCounts] = useState({
    pendingApprovals: 0,
    pendingReviewResumes: 0,
    pendingOutreach: 0,
    runningAgents: 0,
  });

  // Time range state
  const [timeRange, setTimeRange] = useState<TimeRange>('today');
  const [customStart, setCustomStart] = useState<string>(formatDateISO(new Date()));
  const [customEnd, setCustomEnd] = useState<string>(formatDateISO(new Date()));
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  // Computed date range
  const dateRange = useMemo(() => {
    if (timeRange === 'custom') {
      return getDateRange(
        'custom',
        new Date(customStart),
        new Date(customEnd),
      );
    }
    return getDateRange(timeRange);
  }, [timeRange, customStart, customEnd]);

  // Filter results by date range
  const filteredResults = useMemo(() => {
    return allResults.filter((r) => {
      const d = new Date(r.interviewDate).getTime();
      return d >= dateRange.start.getTime() && d <= dateRange.end.getTime();
    });
  }, [allResults, dateRange]);

  // Derived stats from filtered data
  const stats = useMemo((): StatCard[] => {
    const total = filteredResults.length;
    const passed = filteredResults.filter((r) => r.grade === 'excellent' || r.grade === 'good').length;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
    const avgScore = total > 0
      ? filteredResults.reduce((sum, r) => sum + r.totalScore, 0) / total
      : 0;

    return [
      {
        label: '面试场次',
        value: total,
        icon: Video,
        color: 'text-purple-600 dark:text-purple-400',
        iconBg: 'bg-purple-100 dark:bg-purple-900/40',
      },
      {
        label: '通过率',
        value: `${passRate}%`,
        icon: Trophy,
        color: 'text-emerald-600 dark:text-emerald-400',
        iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
      },
      {
        label: '平均分',
        value: avgScore.toFixed(1),
        icon: BarChart3,
        color: 'text-amber-600 dark:text-amber-400',
        iconBg: 'bg-amber-100 dark:bg-amber-900/40',
      },
      {
        label: '人才库总量',
        value: allCandidateCount,
        icon: Users,
        color: 'text-blue-600 dark:text-blue-400',
        iconBg: 'bg-blue-100 dark:bg-blue-900/40',
      },
    ];
  }, [filteredResults, allCandidateCount]);

  const recentInterviews = useMemo(() => filteredResults.slice(0, 5), [filteredResults]);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [candidates, results, approvalsRaw, talentStats, outreachRecords, agentsRaw] = await Promise.all([
          listCandidates(),
          listInterviewResults(),
          listApprovalRequests().catch(() => [] as ApprovalRequestSummary[]),
          getTalentStats().catch(() => ({pendingReview: 0})),
          listOutreachRecords().catch(() => [] as OutreachRecord[]),
          listAgents().catch(() => [] as Agent[]),
        ]);

        setAllCandidateCount(candidates.length);
        setAllResults(results);

        const approvals = getItemsFromPayload<ApprovalRequestSummary>(approvalsRaw);
        const agents = Array.isArray(agentsRaw) ? agentsRaw : [];

        setTaskCounts({
          pendingApprovals: approvals.filter((a) => a.status === 'pending').length,
          pendingReviewResumes: talentStats.pendingReview ?? 0,
          pendingOutreach: (outreachRecords as OutreachRecord[]).filter((r) => r.status === 'pending').length,
          runningAgents: agents.filter((a: Agent) => a.status === 'running').length,
        });
      } catch {
        // keep defaults
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleTimeRangeChange = useCallback((range: TimeRange) => {
    if (range === 'custom') {
      setShowCustomPicker(true);
    } else {
      setShowCustomPicker(false);
    }
    setTimeRange(range);
  }, []);

  const quickActions: QuickAction[] = [
    {label: '导入简历', icon: Upload, color: 'bg-blue-600 hover:bg-blue-700', path: '/talent'},
    {label: '发起面试', icon: Video, color: 'bg-purple-600 hover:bg-purple-700', path: '/interviews/templates'},
    {label: '查看入围', icon: FileText, color: 'bg-emerald-600 hover:bg-emerald-700', path: '/shortlist'},
    {label: '审批中心', icon: CheckCircle2, color: 'bg-orange-600 hover:bg-orange-700', path: '/approvals'},
  ];

  const todayTasks: TodayTask[] = useMemo(() => {
    const tasks: TodayTask[] = [];

    if (taskCounts.pendingApprovals > 0) {
      tasks.push({
        id: 't1',
        title: '审核面试结果',
        subtitle: `${taskCounts.pendingApprovals} 份面试结果待审批`,
        status: taskCounts.pendingApprovals >= 3 ? 'urgent' : 'pending',
        icon: Clock,
        path: '/approvals',
      });
    }

    if (taskCounts.pendingReviewResumes > 0) {
      tasks.push({
        id: 't2',
        title: '导入候选人简历',
        subtitle: `${taskCounts.pendingReviewResumes} 份简历待解析`,
        status: 'pending',
        icon: Upload,
        path: '/talent',
      });
    }

    if (taskCounts.pendingOutreach > 0) {
      tasks.push({
        id: 't3',
        title: '面试邀请跟进',
        subtitle: `${taskCounts.pendingOutreach} 位候选人未回复`,
        status: 'pending',
        icon: UserPlus,
        path: '/outreach',
      });
    }

    if (taskCounts.runningAgents > 0) {
      tasks.push({
        id: 't4',
        title: '查看 AI 代理运行',
        subtitle: `${taskCounts.runningAgents} 个代理正在运行中`,
        status: 'done',
        icon: Bot,
        path: '/agents',
      });
    }

    return tasks;
  }, [taskCounts]);

  const statusStyles: Record<TodayTask['status'], {badge: string; dot: string}> = {
    urgent: {badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', dot: 'bg-red-500'},
    pending: {badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', dot: 'bg-amber-500'},
    done: {badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', dot: 'bg-emerald-500'},
  };

  const statusLabels: Record<TodayTask['status'], string> = {
    urgent: '紧急',
    pending: '待办',
    done: '已完成',
  };

  const gradeColorMap: Record<string, string> = {
    excellent: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    good: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    qualified: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    pending: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  const gradeLabelMap: Record<string, string> = {
    excellent: '优秀',
    good: '良好',
    qualified: '合格',
    pending: '待评',
    rejected: '不合格',
  };

  return (
    <motion.div
      initial={{opacity: 0, y: 8}}
      animate={{opacity: 1, y: 0}}
      className="max-w-[1400px] mx-auto w-full p-6 space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">欢迎回来，{userName}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            <Calendar className="w-4 h-4 inline mr-1 -mt-0.5" />
            {new Date().toLocaleDateString('zh-CN', {year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'})}
          </p>
        </div>

        {/* Time range selector */}
        <div className="flex items-center gap-2">
          {/* Pill tabs */}
          {(['today', 'week', 'month'] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => handleTimeRangeChange(range)}
              className={`
                px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all
                ${timeRange === range && !showCustomPicker
                  ? 'bg-[#1a4bc4] text-white shadow-sm'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                }
              `}
            >
              {RANGE_LABELS[range]}
            </button>
          ))}

          {/* Custom range button + dropdown */}
          <div className="relative">
            <button
              onClick={() => handleTimeRangeChange('custom')}
              className={`
                px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1
                ${showCustomPicker
                  ? 'bg-[#1a4bc4] text-white shadow-sm'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                }
              `}
            >
              {RANGE_LABELS.custom}
              <ChevronDown className={`w-3 h-3 transition-transform ${showCustomPicker ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showCustomPicker && (
                <motion.div
                  initial={{opacity: 0, y: -4, scale: 0.97}}
                  animate={{opacity: 1, y: 0, scale: 1}}
                  exit={{opacity: 0, y: -4, scale: 0.97}}
                  transition={{duration: 0.12}}
                  className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 shadow-xl p-4 z-30"
                >
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">起始日期</label>
                      <input
                        type="date"
                        value={customStart}
                        max={customEnd}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]/30 focus:border-[#1a4bc4] transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">结束日期</label>
                      <input
                        type="date"
                        value={customEnd}
                        min={customStart}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]/30 focus:border-[#1a4bc4] transition-colors"
                      />
                    </div>
                    <div className="pt-1 flex items-center justify-between">
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        {formatRangeLabel(getDateRange('custom', new Date(customStart), new Date(customEnd)))}
                      </span>
                      <button
                        onClick={() => setShowCustomPicker(false)}
                        className="text-xs text-[#1a4bc4] dark:text-blue-400 font-medium hover:underline"
                      >
                        确定
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Active range indicator */}
      <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
        <Clock className="w-3.5 h-3.5" />
        <span>
          当前查看: {formatRangeLabel(dateRange)}
          {filteredResults.length > 0 && ` · ${filteredResults.length} 条面试记录`}
        </span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({length: 4}).map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 animate-pulse">
              <div className="h-4 w-20 bg-gray-100 dark:bg-gray-700 rounded mb-3" />
              <div className="h-8 w-16 bg-gray-100 dark:bg-gray-700 rounded" />
            </div>
          ))
        ) : (
          stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {stat.label}
                  </span>
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${stat.iconBg}`}>
                    <Icon className={`w-4.5 h-4.5 ${stat.color}`} />
                  </div>
                </div>
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                {stat.change && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{stat.change}</p>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Recent Interviews + Quick Actions */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Actions */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">快捷操作</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={() => navigate(action.path)}
                    className={`${action.color} text-white rounded-xl p-4 flex flex-col items-center gap-2 transition-all hover:shadow-lg active:scale-[0.98]`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs font-medium">{action.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recent Interviews (filtered) */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                面试结果
                <span className="text-gray-400 dark:text-gray-500 font-normal ml-1">
                  ({RANGE_LABELS[timeRange]})
                </span>
              </h2>
              <button
                onClick={() => navigate('/interviews/results')}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium flex items-center gap-1"
              >
                查看全部 <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            {recentInterviews.length === 0 ? (
              <div className="px-5 py-10 text-center text-gray-400 dark:text-gray-500">
                <Video className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">
                  {loading ? '加载中...' : `${RANGE_LABELS[timeRange]}暂无面试记录`}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {recentInterviews.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer"
                    onClick={() => navigate('/interviews/results')}
                  >
                    <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-sm font-bold text-gray-600 dark:text-gray-300">
                      {(r.candidateName || '?')[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{r.candidateName}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{r.position} · {r.templateName}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{r.totalScore}分</p>
                      <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full ${gradeColorMap[r.grade] || 'bg-gray-100 text-gray-600'}`}>
                        {gradeLabelMap[r.grade] || r.grade}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Today's Tasks */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">今日待办</h2>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {todayTasks.length === 0 ? (
                <div className="px-5 py-10 text-center text-gray-400 dark:text-gray-500">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{loading ? '加载中...' : '暂无待办事项'}</p>
                </div>
              ) : (
                todayTasks.map((task) => {
                const Icon = task.icon;
                const style = statusStyles[task.status];
                return (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer"
                    onClick={() => navigate(task.path)}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${task.status === 'done' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
                      <Icon className={`w-4 h-4 ${task.status === 'done' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${task.status === 'done' ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-white'}`}>
                        {task.title}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{task.subtitle}</p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${style.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                      {statusLabels[task.status]}
                    </span>
                  </div>
                );
              })
              )}
            </div>
          </div>

          {/* Navigation Shortcuts */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">常用功能</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                {label: '候选人搜索', icon: Search, path: '/search'},
                {label: '项目管理', icon: Folder, path: '/projects'},
                {label: 'AI 代理', icon: Bot, path: '/agents'},
                {label: '数据洞察', icon: BarChart3, path: '/insights'},
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    onClick={() => navigate(item.path)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-500 transition-all text-xs font-medium"
                  >
                    <Icon className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
