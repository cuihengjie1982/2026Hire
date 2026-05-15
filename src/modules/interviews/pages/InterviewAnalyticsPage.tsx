import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { FileText, TrendingUp, Users, CheckCircle, BarChart3, Calendar, ChevronDown, Download, AlertCircle } from 'lucide-react';
import {type ScoreDistribution, type PassRateTrend, type PositionAnalytics, type AnalyticsSummary, type DimensionAnalysis} from '../types';
import { getAnalyticsSummary, getScoreDistribution, getPassRateTrend, getPositionAnalytics, getDimensionAnalysis } from '../api';

interface InterviewAnalyticsPageProps {
  isEmbedded?: boolean;
  onTabChange?: (tab: 'config' | 'management' | 'results' | 'analytics') => void;
}

export const InterviewAnalyticsPage = ({ isEmbedded = false, onTabChange }: InterviewAnalyticsPageProps) => {
  const [timeRange, setTimeRange] = useState('thisMonth');
  const [summary, setSummary] = useState<AnalyticsSummary>({
    totalInterviews: 0, completedInterviews: 0, passRate: 0, averageScore: 0,
    thisWeekCount: 0, thisMonthCount: 0,
    momTrend: { totalChange: 0, completedChange: 0, avgScoreChange: 0 },
  });
  const [scoreDistribution, setScoreDistribution] = useState<ScoreDistribution[]>([]);
  const [passRateTrend, setPassRateTrend] = useState<PassRateTrend[]>([]);
  const [positionAnalytics, setPositionAnalytics] = useState<PositionAnalytics[]>([]);
  const [dimensionAnalysis, setDimensionAnalysis] = useState<DimensionAnalysis>({
    dimensions: [], questions: [], weakestDimension: '', hardestQuestion: '',
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [s, sd, prt, pa, da] = await Promise.all([
          getAnalyticsSummary(timeRange),
          getScoreDistribution(timeRange),
          getPassRateTrend(timeRange),
          getPositionAnalytics(timeRange),
          getDimensionAnalysis(timeRange),
        ]);
        setSummary(s);
        setScoreDistribution(sd);
        setPassRateTrend(prt);
        setPositionAnalytics(pa);
        setDimensionAnalysis(da);
      } catch (e) {
        console.error('Failed to load analytics:', e);
      }
    };
    load();
  }, [timeRange]);

  const timeRanges = [
    { value: 'thisWeek', label: '本周' },
    { value: 'thisMonth', label: '本月' },
    { value: 'thisQuarter', label: '本季度' },
    { value: 'thisYear', label: '本年' },
  ];

  const maxDistCount = scoreDistribution.length > 0 ? Math.max(...scoreDistribution.map(d => d.count)) : 1;
  const maxPassRate = passRateTrend.length > 0 ? Math.max(...passRateTrend.map(p => p.rate)) : 100;

  const formatMonth = (month: string) => {
    const [year, mon] = month.split('-');
    return `${parseInt(mon)}月`;
  };

  const renderTrend = (change: number) => {
    const isUp = change >= 0;
    return (
      <span className={isUp ? 'text-emerald-600' : 'text-red-500'} style={{fontWeight: 500}}>
        {isUp ? '+' : ''}{change}%
      </span>
    );
  };

  return (
    <div className={`${isEmbedded ? '' : 'min-h-screen bg-gradient-to-br from-[#F5F3FF] to-[#EBE0FF] dark:from-gray-900 dark:to-gray-800'} flex flex-col font-sans`}>
      {!isEmbedded && (
        <>
          {/* Top Bar */}
          <div className="p-6 flex items-center">
            <div className="w-8 h-8 bg-gradient-to-br from-[#1a4bc4] to-[#6366F1] rounded flex items-center justify-center mr-3">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900 dark:text-white">EM-BOX recruiting platform</span>
          </div>

          {/* Page Header */}
          <div className="text-center mb-8">
            <h1 className="text-[44px] font-extrabold text-gray-900 dark:text-white tracking-tight mb-4">数据分析</h1>
            <p className="text-[20px] text-gray-700 dark:text-gray-300">AI面试数据统计与分析</p>
          </div>

          {/* Main Navigation Tabs */}
          <div className="flex justify-center space-x-4 mb-8">
            {[
              { key: 'config', label: '[面试配置]' },
              { key: 'management', label: '[面试管理]' },
              { key: 'results', label: '[面试结果]' },
              { key: 'analytics', label: '[数据分析]' }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => onTabChange?.(tab.key as 'config' | 'management' | 'results' | 'analytics')}
                className={`px-6 py-2.5 rounded-lg text-lg font-bold transition-colors ${
                  tab.key === 'analytics'
                    ? 'bg-[#22d3ee] text-white shadow-md'
                    : 'bg-transparent text-gray-700 dark:text-gray-300 hover:bg-white/50 dark:hover:bg-gray-700/50 border border-transparent'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Main Content Area */}
      <div className={`${isEmbedded ? 'flex-1' : 'max-w-[1600px] w-full mx-auto bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl flex flex-1 mb-8 overflow-hidden border border-white'}`}>
        <div className="flex-1 p-6">
          {/* Time Range Filter */}
          <div className="flex justify-end mb-6">
            <div className="relative">
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="appearance-none bg-white border border-gray-200 rounded-lg pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#22d3ee]/20 focus:border-[#22d3ee] transition-all cursor-pointer"
              >
                {timeRanges.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-5 gap-4 mb-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-br from-[#22d3ee] to-[#06b6d4] rounded-xl p-5 text-white"
            >
              <div className="text-3xl font-bold">{summary.totalInterviews}</div>
              <div className="text-sm opacity-80 mt-1">总面试数</div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="bg-white rounded-xl border border-gray-100 p-5"
            >
              <div className="text-3xl font-bold text-gray-900">{summary.completedInterviews}</div>
              <div className="text-sm text-gray-500 mt-1">完成面试</div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-xl border border-gray-100 p-5"
            >
              <div className="text-3xl font-bold text-emerald-600">{summary.passRate}%</div>
              <div className="text-sm text-gray-500 mt-1">通过率</div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-white rounded-xl border border-gray-100 p-5"
            >
              <div className="text-3xl font-bold text-gray-900">{summary.averageScore}</div>
              <div className="text-sm text-gray-500 mt-1">平均分</div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-xl border border-gray-100 p-5"
            >
              <div className="text-3xl font-bold text-[#22d3ee]">{summary.thisWeekCount}</div>
              <div className="text-sm text-gray-500 mt-1">本周面试</div>
            </motion.div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* Score Distribution Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-xl border border-gray-100 p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">分数分布</h3>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <BarChart3 className="w-4 h-4" />
                  人数统计
                </div>
              </div>
              <div className="space-y-4">
                {scoreDistribution.map((dist, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-16 text-sm text-gray-600">{dist.range}</div>
                    <div className="flex-1 h-6 bg-gray-100 rounded-lg overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(dist.count / maxDistCount) * 100}%` }}
                        transition={{ delay: 0.2 + i * 0.1, duration: 0.5 }}
                        className="h-full bg-gradient-to-r from-[#22d3ee] to-[#06b6d4] rounded-lg"
                      />
                    </div>
                    <div className="w-10 text-sm font-medium text-gray-900 text-right">{dist.count}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Pass Rate Trend Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-white rounded-xl border border-gray-100 p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">通过率趋势</h3>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <TrendingUp className="w-4 h-4" />
                  月度数据
                </div>
              </div>
              <div className="flex items-end gap-2 h-32">
                {passRateTrend.map((trend, i) => (
                  <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${(trend.rate / maxPassRate) * 100}%` }}
                    transition={{ delay: 0.3 + i * 0.1, duration: 0.5 }}
                    className="flex-1 flex flex-col items-center"
                  >
                    <div className="w-full bg-gradient-to-t from-[#22d3ee] to-[#06b6d4] rounded-t-lg relative group">
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {trend.rate}%
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
              <div className="flex justify-between mt-2">
                {passRateTrend.map((trend, i) => (
                  <div key={i} className="text-xs text-gray-500">{formatMonth(trend.month)}</div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Position Analytics */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl border border-gray-100 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">岗位数据分析</h3>
              <button
                onClick={() => {
                  const csvContent = [
                    ['岗位', '面试总数', '通过率', '平均分'].join(','),
                    ...positionAnalytics.map(p => [p.position, p.total, `${p.passRate.toFixed(1)}%`, p.averageScore].join(',')),
                  ].join('\n');
                  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(blob);
                  link.download = `interview_analytics_${new Date().toISOString().split('T')[0]}.csv`;
                  link.click();
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-[#22d3ee] hover:bg-[#cffafe] rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                导出
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">岗位</th>
                    <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">面试总数</th>
                    <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">通过率</th>
                    <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">平均分</th>
                    <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">趋势</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {positionAnalytics.map((pos, i) => (
                    <motion.tr
                      key={i}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.25 + i * 0.05 }}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-gradient-to-br from-[#22d3ee] to-[#06b6d4] rounded-lg flex items-center justify-center">
                            <Users className="w-4 h-4 text-white" />
                          </div>
                          <span className="font-medium text-gray-900">{pos.position}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-gray-700">{pos.total}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-[#22d3ee] to-[#06b6d4] rounded-full"
                              style={{ width: `${pos.passRate}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-gray-900">{pos.passRate.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-bold text-[#22d3ee]">{pos.averageScore}</span>
                      </td>
                      <td className="px-4 py-4">
                        {pos.passRate >= 70 ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 text-sm">
                            <TrendingUp className="w-4 h-4" />
                            上升
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-600 text-sm">
                            <TrendingUp className="w-4 h-4 rotate-180" />
                            下降
                          </span>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* Dimension Analysis */}
          {dimensionAnalysis.dimensions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="bg-white rounded-xl border border-gray-100 p-6 mt-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">维度得分分析</h3>
                {dimensionAnalysis.weakestDimension && (
                  <div className="flex items-center gap-2 text-sm">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    <span className="text-amber-600 font-medium">最弱维度: {dimensionAnalysis.weakestDimension}</span>
                  </div>
                )}
              </div>
              <div className="space-y-4">
                {dimensionAnalysis.dimensions.map((dim, i) => (
                  <div key={i} className={`flex items-center gap-4 p-3 rounded-lg ${dim.name === dimensionAnalysis.weakestDimension ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
                    <div className="w-24 text-sm font-medium text-gray-700 shrink-0">{dim.name}</div>
                    <div className="flex-1">
                      <div className="h-6 bg-gray-200 rounded-lg overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${dim.avgPercent}%` }}
                          transition={{ delay: 0.3 + i * 0.1, duration: 0.5 }}
                          className={`h-full rounded-lg flex items-center justify-end pr-2 ${
                            dim.avgPercent >= 80 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' :
                            dim.avgPercent >= 60 ? 'bg-gradient-to-r from-[#22d3ee] to-[#06b6d4]' :
                            'bg-gradient-to-r from-red-400 to-red-500'
                          } text-white text-xs font-medium`}
                        >
                          {dim.avgPercent}%
                        </motion.div>
                      </div>
                    </div>
                    <div className="w-20 text-right text-sm text-gray-600">
                      {dim.avgScore}/{dim.maxScore}
                    </div>
                    <div className="w-16 text-right text-xs text-gray-400">
                      {dim.count}人
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Question Difficulty Ranking */}
          {dimensionAnalysis.questions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white rounded-xl border border-gray-100 p-6 mt-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">题目难度排行</h3>
                {dimensionAnalysis.hardestQuestion && (
                  <div className="flex items-center gap-2 text-sm">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    <span className="text-amber-600 font-medium">最难题: {dimensionAnalysis.hardestQuestion}</span>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">题目</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">平均得分</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">淘汰比例</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">作答人数</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {dimensionAnalysis.questions.map((q, i) => {
                      const failRate = q.totalCount > 0 ? Math.round((q.belowThresholdCount / q.totalCount) * 100) : 0;
                      const isHardest = q.questionTitle === dimensionAnalysis.hardestQuestion;
                      return (
                        <tr key={i} className={isHardest ? 'bg-red-50' : 'hover:bg-gray-50'}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {isHardest && <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />}
                              <span className="text-sm text-gray-900 font-medium">{q.questionTitle}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold ${q.avgScore >= q.maxScore * 0.7 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {q.avgScore}
                              </span>
                              <span className="text-xs text-gray-400">/{q.maxScore}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${failRate >= 40 ? 'bg-red-400' : failRate >= 20 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                                  style={{ width: `${failRate}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium text-gray-700">{failRate}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{q.totalCount}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* Candidate Analysis */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl border border-gray-100 p-6 mt-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">候选人分析</h3>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Users className="w-4 h-4" />
                详细数据
              </div>
            </div>
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-gray-50 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-[#cffafe] rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-[#22d3ee]" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{summary.totalInterviews}</div>
                    <div className="text-sm text-gray-500">候选人总数</div>
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  较上月 {renderTrend(summary.momTrend.totalChange)}
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{summary.completedInterviews}</div>
                    <div className="text-sm text-gray-500">面试通过数</div>
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  较上月 {renderTrend(summary.momTrend.completedChange)}
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{summary.averageScore > 0 ? Math.round(summary.averageScore * 10) / 10 : 0}</div>
                    <div className="text-sm text-gray-500">平均面试得分</div>
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  较上月 {renderTrend(summary.momTrend.avgScoreChange)}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};