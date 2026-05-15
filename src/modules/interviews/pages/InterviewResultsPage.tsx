import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Search, ChevronDown, Download, Eye, FileText, User, Mail, CheckCircle, AlertCircle, XCircle, HelpCircle, Star, Loader2 } from 'lucide-react';
import {type InterviewResult} from '../types';
import { listInterviewResults, updateInterviewResultStatus, exportInterviewResultsCsv } from '../api';
import { listPositions } from '../../positions/api';
import type { PositionSummary } from '../../positions/types';

interface InterviewResultsPageProps {
  isEmbedded?: boolean;
  onTabChange?: (tab: 'config' | 'management' | 'results' | 'analytics') => void;
}

export const InterviewResultsPage = ({ isEmbedded = false, onTabChange }: InterviewResultsPageProps) => {
  const [results, setResults] = useState<InterviewResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [positionFilter, setPositionFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [selectedResult, setSelectedResult] = useState<InterviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<string | null>(null);

  // Dynamic positions from API
  const [positions, setPositions] = useState<PositionSummary[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await listInterviewResults();
        setResults(data);
      } catch (e) {
        console.error('Failed to load results:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
    listPositions().then(setPositions).catch(() => {});
  }, []);

  const grades = [
    { value: 'all', label: '全部等级' },
    { value: 'excellent', label: '优秀 (A/S)' },
    { value: 'good', label: '良好 (B+)' },
    { value: 'qualified', label: '合格 (B)' },
    { value: 'pending', label: '待观察 (C)' },
    { value: 'rejected', label: '不合格' },
  ];

  // Dynamic position options: derive unique positions from results data + API positions
  const positionOptions = (() => {
    const fromResults = results.map(r => r.position).filter(Boolean);
    const fromApi = positions.map(p => p.name);
    const unique = [...new Set([...fromApi, ...fromResults])].sort();
    return unique;
  })();

  const filteredResults = results.filter(result => {
    const matchesSearch = result.candidateName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      result.candidateEmail.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPosition = positionFilter === 'all' || result.position === positionFilter;
    const matchesGrade = gradeFilter === 'all' || result.grade === gradeFilter;
    return matchesSearch && matchesPosition && matchesGrade;
  });

  const handleExport = async () => {
    try {
      await exportInterviewResultsCsv();
    } catch {
      // Fallback to client-side export
      const csvContent = [
        ['候选人', '邮箱', '岗位', '面试日期', '总分', '等级', '时长(分钟)', '状态'].join(','),
        ...filteredResults.map(r => [
          r.candidateName,
          r.candidateEmail,
          r.position,
          r.interviewDate,
          r.totalScore,
          r.gradeLabel || r.grade,
          r.duration,
          r.status === 'reviewed' ? '已审核' : '待审核',
        ].join(','))
      ].join('\n');

      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `interview_results_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
    }
  };

  const handleReview = async (resultId: string) => {
    setReviewing(resultId);
    try {
      const updated = await updateInterviewResultStatus(resultId, 'reviewed');
      if (updated) {
        setResults(prev => prev.map(r => r.id === resultId ? { ...r, status: 'reviewed' as const } : r));
        if (selectedResult?.id === resultId) {
          setSelectedResult(prev => prev ? { ...prev, status: 'reviewed' as const } : null);
        }
      }
    } catch (e) {
      console.error('Failed to review result:', e);
    } finally {
      setReviewing(null);
    }
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'excellent': return { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle };
      case 'good': return { bg: 'bg-[#cffafe]', text: 'text-[#22d3ee]', icon: Star };
      case 'qualified': return { bg: 'bg-blue-100', text: 'text-blue-700', icon: CheckCircle };
      case 'pending': return { bg: 'bg-amber-100', text: 'text-amber-700', icon: HelpCircle };
      case 'rejected': return { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle };
      default: return { bg: 'bg-gray-100', text: 'text-gray-700', icon: AlertCircle };
    }
  };

  const getGradeLabel = (grade: string) => {
    switch (grade) {
      case 'excellent': return '优秀';
      case 'good': return '良好';
      case 'qualified': return '合格';
      case 'pending': return '待观察';
      case 'rejected': return '不合格';
      default: return grade;
    }
  };

  const formatDate = (date: string) => {
    if (!date) return '—';
    const d = new Date(date);
    return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const passCount = results.filter(r => r.grade === 'excellent' || r.grade === 'good' || r.grade === 'qualified').length;
  const totalCount = results.length;
  const passRate = totalCount > 0 ? ((passCount / totalCount) * 100).toFixed(1) : '0';
  const avgScore = totalCount > 0 ? Math.round(results.reduce((sum, r) => sum + r.totalScore, 0) / totalCount) : 0;

  return (
    <div className={`${isEmbedded ? '' : 'min-h-screen bg-gradient-to-br from-[#F5F3FF] to-[#EBE0FF] dark:from-gray-900 dark:to-gray-800'} flex flex-col font-sans`}>
      {!isEmbedded && (
        <>
          <div className="p-6 flex items-center">
            <div className="w-8 h-8 bg-gradient-to-br from-[#1a4bc4] to-[#6366F1] rounded flex items-center justify-center mr-3">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900 dark:text-white">EM-BOX recruiting platform</span>
          </div>
          <div className="text-center mb-8">
            <h1 className="text-[44px] font-extrabold text-gray-900 dark:text-white tracking-tight mb-4">面试结果</h1>
            <p className="text-[20px] text-gray-700 dark:text-gray-300">查看候选人面试评估结果</p>
          </div>
          <div className="flex justify-center space-x-4 mb-8">
            {[
              { key: 'config', label: '面试配置' },
              { key: 'management', label: '面试管理' },
              { key: 'results', label: '面试结果' },
              { key: 'analytics', label: '数据分析' }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => onTabChange?.(tab.key as 'config' | 'management' | 'results' | 'analytics')}
                className={`px-6 py-2.5 rounded-lg text-lg font-bold transition-colors ${
                  tab.key === 'results'
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

      <div className={`${isEmbedded ? 'flex-1' : 'max-w-[1600px] w-full mx-auto bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl flex flex-1 mb-8 overflow-hidden border border-white'}`}>
        <div className="flex-1 p-6">
          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="搜索候选人姓名或邮箱..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#22d3ee]/20 focus:border-[#22d3ee] transition-all placeholder-gray-400"
                />
              </div>
              <div className="relative">
                <select
                  value={positionFilter}
                  onChange={(e) => setPositionFilter(e.target.value)}
                  className="appearance-none bg-white border border-gray-200 rounded-lg pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#22d3ee]/20 focus:border-[#22d3ee] transition-all cursor-pointer"
                >
                  <option value="all">全部岗位</option>
                  {positionOptions.map(pos => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
              </div>
              <div className="relative">
                <select
                  value={gradeFilter}
                  onChange={(e) => setGradeFilter(e.target.value)}
                  className="appearance-none bg-white border border-gray-200 rounded-lg pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#22d3ee]/20 focus:border-[#22d3ee] transition-all cursor-pointer"
                >
                  {grades.map(g => (
                    <option key={g.value} value={g.value}>{g.label}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
              </div>
              <button
                onClick={handleExport}
                disabled={filteredResults.length === 0}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Download className="w-4 h-4" />
                导出结果
              </button>
            </div>
          </div>

          {/* Results Table */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {loading ? (
              <div className="text-center py-16">
                <Loader2 className="w-8 h-8 text-[#22d3ee] animate-spin mx-auto mb-4" />
                <p className="text-gray-500">加载中...</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">候选人</th>
                    <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">邮箱</th>
                    <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">应聘岗位</th>
                    <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">面试日期</th>
                    <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">总分</th>
                    <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">等级</th>
                    <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">面试时长</th>
                    <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">状态</th>
                    <th className="px-4 py-3 text-center text-sm font-bold text-gray-700">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredResults.map((result, index) => {
                    const gradeStyle = getGradeColor(result.grade);
                    const GradeIcon = gradeStyle.icon;
                    return (
                      <motion.tr
                        key={result.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: index * 0.03 }}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gradient-to-br from-[#22d3ee] to-[#06b6d4] rounded-full flex items-center justify-center">
                              <User className="w-4 h-4 text-white" />
                            </div>
                            <span className="font-medium text-gray-900">{result.candidateName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{result.candidateEmail || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{result.position || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{formatDate(result.interviewDate)}</td>
                        <td className="px-4 py-3">
                          <span className="font-bold text-[#22d3ee] text-lg">{result.totalScore}</span>
                          <span className="text-gray-400 text-sm">分</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium ${gradeStyle.bg} ${gradeStyle.text}`}>
                            <GradeIcon className="w-3.5 h-3.5" />
                            {getGradeLabel(result.grade)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{result.duration}分钟</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            result.status === 'reviewed' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'
                          }`}>
                            {result.status === 'reviewed' ? '已审核' : '待审核'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => setSelectedResult(result)}
                              className="flex items-center gap-1.5 px-3 py-1.5 border border-[#22d3ee] text-[#22d3ee] hover:bg-[#cffafe] rounded-lg text-sm font-medium transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              查看
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {!loading && filteredResults.length === 0 && (
              <div className="text-center py-16">
                <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">{results.length === 0 ? '暂无面试结果' : '没有找到匹配的结果'}</p>
              </div>
            )}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4 mt-6">
            <div className="bg-gradient-to-br from-[#22d3ee] to-[#06b6d4] rounded-xl p-5 text-white">
              <div className="text-3xl font-bold">{totalCount}</div>
              <div className="text-sm opacity-80 mt-1">面试总数</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="text-3xl font-bold text-gray-900">{passCount}</div>
              <div className="text-sm text-gray-500 mt-1">通过人数</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="text-3xl font-bold text-emerald-600">{passRate}%</div>
              <div className="text-sm text-gray-500 mt-1">通过率</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="text-3xl font-bold text-gray-900">{avgScore}</div>
              <div className="text-sm text-gray-500 mt-1">平均分</div>
            </div>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">面试详细报告</h3>
                <button
                  onClick={() => setSelectedResult(null)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <span className="text-gray-400 text-xl">&times;</span>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Candidate Info */}
              <div className="bg-gray-50 rounded-xl p-5">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-[#22d3ee] to-[#06b6d4] rounded-full flex items-center justify-center">
                    <User className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <div className="font-bold text-xl text-gray-900">{selectedResult.candidateName}</div>
                    <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                      <Mail className="w-3.5 h-3.5" />
                      {selectedResult.candidateEmail || '—'}
                    </div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-3xl font-bold text-[#22d3ee]">{selectedResult.totalScore}</div>
                    <div className="text-sm text-gray-500">综合得分</div>
                  </div>
                </div>
              </div>

              {/* Basic Info */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-500 mb-1">应聘岗位</div>
                  <div className="font-medium text-gray-900">{selectedResult.position || '—'}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-500 mb-1">面试时间</div>
                  <div className="font-medium text-gray-900">{formatDate(selectedResult.interviewDate)}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-500 mb-1">面试时长</div>
                  <div className="font-medium text-gray-900">{selectedResult.duration}分钟</div>
                </div>
              </div>

              {/* Grade */}
              <div className="flex items-center justify-between bg-gray-50 rounded-xl p-5">
                <div>
                  <div className="text-lg font-bold text-gray-900">{getGradeLabel(selectedResult.grade)}</div>
                  <div className="text-sm text-gray-500 mt-1">{selectedResult.gradeLabel}</div>
                </div>
                <div className={`px-4 py-2 rounded-lg ${getGradeColor(selectedResult.grade).bg} ${getGradeColor(selectedResult.grade).text}`}>
                  <span className="font-bold">{selectedResult.totalScore}分</span>
                </div>
              </div>

              {/* Dimension Scores */}
              {selectedResult.dimensions.length > 0 && (
                <div>
                  <div className="font-bold text-gray-900 mb-3">各维度得分</div>
                  <div className="space-y-3">
                    {selectedResult.dimensions.map((dim, i) => {
                      const maxScore = dim.weight || 100;
                      const pct = maxScore > 0 ? Math.min(100, (dim.score / maxScore) * 100) : 0;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <div className="w-28 text-sm text-gray-600 truncate" title={dim.name}>{dim.name}</div>
                          <div className="flex-1">
                            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-[#22d3ee] to-[#06b6d4] rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                          <div className="w-20 text-sm font-medium text-gray-900 text-right">{dim.score}/{maxScore}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Approval Status */}
              <div className="bg-gray-50 rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-500 mb-1">审核状态</div>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
                      selectedResult.status === 'reviewed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {selectedResult.status === 'reviewed' ? (
                        <><CheckCircle className="w-4 h-4" /> 已审核</>
                      ) : (
                        <><AlertCircle className="w-4 h-4" /> 待审核</>
                      )}
                    </span>
                  </div>
                  {selectedResult.status !== 'reviewed' && (
                    <button
                      onClick={() => handleReview(selectedResult.id)}
                      disabled={reviewing === selectedResult.id}
                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {reviewing === selectedResult.id ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> 审核中...</>
                      ) : (
                        <><CheckCircle className="w-4 h-4" /> 确认审核</>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setSelectedResult(null)}
                className="px-5 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  if (!selectedResult) return;
                  const content = [
                    `候选人: ${selectedResult.candidateName}`,
                    `邮箱: ${selectedResult.candidateEmail || '—'}`,
                    `岗位: ${selectedResult.position || '—'}`,
                    `日期: ${selectedResult.interviewDate}`,
                    `总分: ${selectedResult.totalScore}`,
                    `等级: ${getGradeLabel(selectedResult.grade)} (${selectedResult.gradeLabel})`,
                    `时长: ${selectedResult.duration}分钟`,
                    '',
                    '各维度得分:',
                    ...selectedResult.dimensions.map(d => `  ${d.name}: ${d.score}/${d.weight || 100}`),
                  ].join('\n');
                  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(blob);
                  link.download = `${selectedResult.candidateName}_面试报告.txt`;
                  link.click();
                }}
                className="px-5 py-2.5 bg-[#22d3ee] text-white rounded-lg text-sm font-medium hover:bg-[#06b6d4] transition-colors"
              >
                下载报告
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
