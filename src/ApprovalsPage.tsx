import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, Check, User, Mail, Calendar, Clock, Eye, ExternalLink, UserCheck, Users, TrendingUp, UserPlus } from 'lucide-react';
import { listInterviewApprovalRequests, listInterviewApprovalHistory, decideInterviewApproval, hireCandidate } from './modules/approvals/api';
import { getAuthToken } from './shared/lib/runtime';
import { type InterviewApprovalRequest } from './modules/approvals/types';
import { Pagination } from './shared/components/Pagination';

type TabType = 'pending' | 'approved';

export const ApprovalsPage = () => {
  const [pendingInterviews, setPendingInterviews] = useState<InterviewApprovalRequest[]>([]);
  const [interviewHistory, setInterviewHistory] = useState<InterviewApprovalRequest[]>([]);
  const [loadingInterviews, setLoadingInterviews] = useState(true);
  const [selectedInterview, setSelectedInterview] = useState<InterviewApprovalRequest | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [approvedPage, setApprovedPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    loadInterviewApprovals();
  }, []);

  const loadInterviewApprovals = async () => {
    setLoadingInterviews(true);
    try {
      const [pending, history] = await Promise.all([
        listInterviewApprovalRequests(),
        listInterviewApprovalHistory(),
      ]);
      setPendingInterviews(pending);
      setInterviewHistory(history);
    } catch (e) {
      console.error('Failed to load interview approvals:', e);
    } finally {
      setLoadingInterviews(false);
    }
  };

  const getApproverName = () => {
    try {
      const token = getAuthToken() || '';
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.email || payload.name || '审批人';
    } catch { return '审批人'; }
  };

  const handleInterviewApprove = async (approvalId: string) => {
    setSubmitting(true);
    try {
      await decideInterviewApproval(approvalId, 'approved', '', getApproverName());
      await loadInterviewApprovals();
    } catch (e) {
      console.error('Failed to approve:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleInterviewReject = async (approvalId: string) => {
    if (!rejectComment.trim()) return;
    setSubmitting(true);
    try {
      await decideInterviewApproval(approvalId, 'rejected', rejectComment, getApproverName());
      setShowRejectDialog(null);
      setRejectComment('');
      await loadInterviewApprovals();
    } catch (e) {
      console.error('Failed to reject:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleHire = async (approvalId: string) => {
    setSubmitting(true);
    try {
      await hireCandidate(approvalId);
      await loadInterviewApprovals();
    } catch (e) {
      console.error('Failed to hire:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const getGradeStyle = (grade: InterviewApprovalRequest['interviewGrade']) => {
    switch (grade) {
      case 'excellent':
        return { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' };
      case 'good':
        return { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200' };
      case 'qualified':
        return { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' };
      case 'pending':
        return { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' };
      case 'rejected':
        return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' };
    }
  };

  const getGradeLabel = (grade: InterviewApprovalRequest['interviewGrade']) => {
    switch (grade) {
      case 'excellent': return '优秀';
      case 'good': return '良好';
      case 'qualified': return '合格';
      case 'pending': return '待观察';
      case 'rejected': return '不合格';
      default: return grade;
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const pendingCount = pendingInterviews.filter(i => i.status === 'pending').length;
  const approvedList = [...pendingInterviews.filter(i => i.status === 'approved' || i.status === 'hired'), ...interviewHistory.filter(i => i.status === 'approved' || i.status === 'hired')];
  const rejectedList = [...pendingInterviews.filter(i => i.status === 'rejected'), ...interviewHistory.filter(i => i.status === 'rejected')];

  const filteredApproved = approvedList.filter(item => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return item.candidateName.toLowerCase().includes(q)
      || (item.candidateEmail || '').toLowerCase().includes(q)
      || (item.positionName || '').toLowerCase().includes(q);
  });

  const allHistory = [...pendingInterviews.filter(i => i.status !== 'pending'), ...interviewHistory];
  const interviewPassCount = allHistory.filter(i => i.status === 'approved').length;
  const interviewTotalCount = allHistory.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex flex-col h-full bg-[#f8fafc] dark:bg-gray-900 relative w-full overflow-y-auto custom-scrollbar"
    >
      <div className="max-w-6xl mx-auto w-full p-8 md:p-12 mb-20">
        <div className="mb-8">
          <h1 className="text-[32px] font-bold text-gray-900 dark:text-white tracking-tight mb-2">审批中心</h1>
          <p className="text-gray-500 dark:text-gray-400 text-base">管理面试结果审批</p>
        </div>

        {/* Stats */}
        <div className="flex items-center space-x-8 mb-8">
          <div className="flex items-center text-lg font-bold text-gray-900 dark:text-white">
            待审批 <span className="ml-2 w-6 h-6 text-xs bg-[#1a4bc4] text-white rounded-full flex items-center justify-center">{pendingCount}</span>
          </div>
          <div className="flex items-center text-base text-gray-500 dark:text-gray-400">
            已通过 <span className="ml-1 text-emerald-600 font-bold">{approvedList.length}</span>
          </div>
          <div className="flex items-center text-base text-gray-500 dark:text-gray-400">
            已驳回 <span className="ml-1 text-red-500 font-bold">{rejectedList.length}</span>
          </div>
          <div className="flex items-center text-base text-gray-500 dark:text-gray-400">
            通过率 <span className="ml-1 text-gray-900 dark:text-white font-bold">{interviewTotalCount > 0 ? Math.round((interviewPassCount / interviewTotalCount) * 100) : 0}%</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'pending'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            待审批 {pendingCount > 0 && <span className="ml-1 text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full">{pendingCount}</span>}
          </button>
          <button
            onClick={() => setActiveTab('approved')}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'approved'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            已通过 ({approvedList.length})
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'pending' && (
            <motion.div
              key="pending"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
            >
              {/* Pending Approvals */}
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">待审批面试结果</h2>
              {loadingInterviews ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-[#e0f2fe] p-10 text-center text-gray-500 dark:text-gray-400">
                  加载中...
                </div>
              ) : pendingInterviews.filter(i => i.status === 'pending').length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-[#e0f2fe] p-10 text-center text-gray-500 dark:text-gray-400">
                  暂无待审批的面试结果
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingInterviews.filter(i => i.status === 'pending').map(item => {
                    const gradeStyle = getGradeStyle(item.interviewGrade);
                    return (
                      <div key={item.id} className={`bg-white border ${gradeStyle.border} shadow-sm rounded-2xl overflow-hidden`}>
                        <div className="p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-gradient-to-br from-[#22d3ee] to-[#06b6d4] rounded-full flex items-center justify-center">
                                <User className="w-6 h-6 text-white" />
                              </div>
                              <div>
                                <div className="font-bold text-gray-900 dark:text-white text-lg">{item.candidateName}</div>
                                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                  <Mail className="w-3.5 h-3.5" />
                                  {item.candidateEmail || '-'}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-3xl font-bold text-[#22d3ee]">{item.interviewScore}</div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">综合得分</div>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-4 mb-4">
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">应聘岗位</div>
                              <div className="font-medium text-gray-900 dark:text-white text-sm">{item.positionName || '-'}</div>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">面试时间</div>
                              <div className="font-medium text-gray-900 dark:text-white text-sm flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" />
                                {formatDate(item.interviewDate)}
                              </div>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">面试时长</div>
                              <div className="font-medium text-gray-900 dark:text-white text-sm flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                {item.interviewDuration}分钟
                              </div>
                            </div>
                          </div>

                          {/* Grade Badge */}
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <span className={`px-3 py-1.5 rounded-full text-sm font-bold ${gradeStyle.bg} ${gradeStyle.text}`}>
                                {getGradeLabel(item.interviewGrade)}
                              </span>
                              <span className="text-sm text-gray-600 dark:text-gray-300">{item.interviewGradeLabel}</span>
                            </div>
                            <button
                              onClick={() => setSelectedInterview(selectedInterview?.id === item.id ? null : item)}
                              className="flex items-center gap-1 text-sm text-[#22d3ee] hover:text-[#06b6d4]"
                            >
                              <Eye className="w-4 h-4" />
                              查看详情
                            </button>
                          </div>

                          {/* Dimension Scores */}
                          <AnimatePresence>
                            {selectedInterview?.id === item.id && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 mb-4">
                                  <div className="font-bold text-gray-900 dark:text-white text-sm mb-3">各维度得分</div>
                                  <div className="space-y-2">
                                    {item.dimensionScores.map((dim, idx) => (
                                      <div key={idx} className="flex items-center gap-3">
                                        <div className="w-20 text-sm text-gray-600 dark:text-gray-300">{dim.name}</div>
                                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                          <div
                                            className="h-full bg-gradient-to-r from-[#22d3ee] to-[#06b6d4] rounded-full"
                                            style={{ width: `${dim.score}%` }}
                                          />
                                        </div>
                                        <div className="w-12 text-sm font-medium text-gray-900 dark:text-white text-right">{dim.score}分</div>
                                        <div className="w-12 text-xs text-gray-400 dark:text-gray-500 text-right">权重{dim.weight}%</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Actions */}
                          <div className="flex gap-4">
                            <button
                              onClick={() => handleInterviewApprove(item.id)}
                              disabled={submitting}
                              className="flex-1 bg-[#10B981] hover:bg-[#059669] text-white py-3 rounded-xl font-bold transition-colors text-base flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-5 h-5" />
                              批准录用
                            </button>
                            <button
                              onClick={() => setShowRejectDialog(item.id)}
                              className="flex-1 bg-white dark:bg-gray-800 hover:bg-red-50 text-red-500 py-3 rounded-xl font-bold transition-colors text-base border border-red-200 flex items-center justify-center gap-2"
                            >
                              <XCircle className="w-5 h-5" />
                              驳回
                            </button>
                          </div>
                        </div>

                        {/* Reject Dialog */}
                        <AnimatePresence>
                          {showRejectDialog === item.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="border-t border-gray-100 dark:border-gray-700 overflow-hidden"
                            >
                              <div className="p-6 bg-red-50">
                                <div className="font-bold text-gray-900 dark:text-white text-sm mb-3">驳回原因</div>
                                <textarea
                                  value={rejectComment}
                                  onChange={(e) => setRejectComment(e.target.value)}
                                  placeholder="请输入驳回原因（必填）"
                                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                                  rows={3}
                                />
                                <div className="flex gap-3 mt-3">
                                  <button
                                    onClick={() => {
                                      setShowRejectDialog(null);
                                      setRejectComment('');
                                    }}
                                    className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 py-2 rounded-lg font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-700/30"
                                  >
                                    取消
                                  </button>
                                  <button
                                    onClick={() => handleInterviewReject(item.id)}
                                    disabled={!rejectComment.trim() || submitting}
                                    className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg font-medium text-sm disabled:opacity-50"
                                  >
                                    确认驳回
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'approved' && (
            <motion.div
              key="approved"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
            >
              {/* Approved list header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">已通过候选人</h2>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="搜索候选人、岗位..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg pl-4 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#22d3ee]/20 focus:border-[#22d3ee] w-64 transition-all placeholder-gray-400"
                  />
                </div>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-white dark:bg-gray-800 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <UserCheck className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{approvedList.length}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">通过总数</div>
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 border border-cyan-200 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-cyan-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-cyan-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {approvedList.length > 0 ? Math.round(approvedList.reduce((sum, i) => sum + i.interviewScore, 0) / approvedList.length) : 0}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">平均得分</div>
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {new Set(approvedList.map(i => i.positionName).filter(Boolean)).size}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">涉及岗位</div>
                  </div>
                </div>
              </div>

              {/* Approved list */}
              {loadingInterviews ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-[#e0f2fe] p-10 text-center text-gray-500 dark:text-gray-400">
                  加载中...
                </div>
              ) : filteredApproved.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-[#e0f2fe] p-10 text-center text-gray-500 dark:text-gray-400">
                  {searchQuery ? '没有匹配的候选人' : '暂无已通过的候选人'}
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-800 border border-[#e0f2fe] rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50/80 text-gray-500 dark:text-gray-400 text-sm border-b border-gray-100 dark:border-gray-700">
                      <tr>
                        <th className="py-4 px-6 font-medium">候选人</th>
                        <th className="py-4 px-6 font-medium">岗位</th>
                        <th className="py-4 px-6 font-medium">面试得分</th>
                        <th className="py-4 px-6 font-medium">等级</th>
                        <th className="py-4 px-6 font-medium">面试时间</th>
                        <th className="py-4 px-6 font-medium">审批人</th>
                        <th className="py-4 px-6 font-medium">审批时间</th>
                        <th className="py-4 px-6 font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {filteredApproved.slice((approvedPage - 1) * PAGE_SIZE, approvedPage * PAGE_SIZE).map((item) => {
                        const gradeStyle = getGradeStyle(item.interviewGrade);
                        return (
                          <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-emerald-500 rounded-full flex items-center justify-center">
                                  <User className="w-4 h-4 text-white" />
                                </div>
                                <div>
                                  <div className="font-bold text-gray-900 dark:text-white">{item.candidateName}</div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">{item.candidateEmail || '-'}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-6 text-gray-700 dark:text-gray-300">{item.positionName || '-'}</td>
                            <td className="py-4 px-6">
                              <span className="font-bold text-[#22d3ee] text-lg">{item.interviewScore}</span>
                              <span className="text-gray-400 dark:text-gray-500 text-xs ml-1">分</span>
                            </td>
                            <td className="py-4 px-6">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${gradeStyle.bg} ${gradeStyle.text}`}>
                                {getGradeLabel(item.interviewGrade)}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-gray-600 dark:text-gray-300">{formatDate(item.interviewDate)}</td>
                            <td className="py-4 px-6 text-gray-600 dark:text-gray-300">{item.approverName || '-'}</td>
                            <td className="py-4 px-6 text-gray-600 dark:text-gray-300">{formatDate(item.decidedAt || item.createdAt)}</td>
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-2">
                                {item.status === 'hired' ? (
                                  <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded-lg">
                                    <UserCheck className="w-3.5 h-3.5" />
                                    已录用
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleHire(item.id)}
                                    disabled={submitting}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                                  >
                                    <UserPlus className="w-3.5 h-3.5" />
                                    确认录用
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    const misUrl = `${window.location.origin}/mis/onboarding?candidateId=${item.candidateId}&candidateName=${encodeURIComponent(item.candidateName)}&position=${encodeURIComponent(item.positionName)}&score=${item.interviewScore}`;
                                    window.open(misUrl, '_blank');
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1.5 text-[#1a4bc4] hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs font-medium rounded-lg transition-colors"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  入职
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination page={approvedPage} pageSize={PAGE_SIZE} total={filteredApproved.length} onChange={setApprovedPage} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Approval History (always visible at bottom) */}
        <div className="mt-12">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">审批记录</h2>
          <div className="bg-white dark:bg-gray-800 border border-[#e0f2fe] rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50/80 text-gray-500 dark:text-gray-400 text-sm border-b border-gray-100 dark:border-gray-700">
                  <tr>
                    <th className="py-4 px-6 font-medium">时间</th>
                    <th className="py-4 px-6 font-medium">候选人</th>
                    <th className="py-4 px-6 font-medium">岗位</th>
                    <th className="py-4 px-6 font-medium">面试得分</th>
                    <th className="py-4 px-6 font-medium">等级</th>
                    <th className="py-4 px-6 font-medium">审批人</th>
                    <th className="py-4 px-6 font-medium">决定</th>
                    <th className="py-4 px-6 font-medium w-1/4">备注</th>
                    <th className="py-4 px-6 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {allHistory.slice((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE).map((record) => {
                    const gradeStyle = getGradeStyle(record.interviewGrade);
                    return (
                      <tr key={record.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-4 px-6 text-gray-600 dark:text-gray-300">{formatDate(record.decidedAt || record.createdAt)}</td>
                        <td className="py-4 px-6">
                          <div className="font-medium text-gray-900 dark:text-white">{record.candidateName}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{record.candidateEmail || '-'}</div>
                        </td>
                        <td className="py-4 px-6 text-gray-700 dark:text-gray-300">{record.positionName || '-'}</td>
                        <td className="py-4 px-6">
                          <span className="font-bold text-[#22d3ee]">{record.interviewScore}</span>分
                        </td>
                        <td className="py-4 px-6">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${gradeStyle.bg} ${gradeStyle.text}`}>
                            {getGradeLabel(record.interviewGrade)}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-gray-600 dark:text-gray-300">{record.approverName || '-'}</td>
                        <td className="py-4 px-6">
                          {record.status === 'hired' ? (
                            <div className="inline-flex items-center gap-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-3 py-1 rounded-full text-xs font-bold">
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>已录用</span>
                            </div>
                          ) : record.status === 'approved' ? (
                            <div className="inline-flex items-center gap-1 bg-[#10b981] text-white px-3 py-1 rounded-full text-xs font-bold">
                              <Check className="w-3.5 h-3.5" />
                              <span>已通过</span>
                            </div>
                          ) : record.status === 'rejected' ? (
                            <div className="inline-flex items-center gap-1 bg-[#ef4444] text-white px-3 py-1 rounded-full text-xs font-bold">
                              <XCircle className="w-3.5 h-3.5" />
                              <span>已驳回</span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold">
                              <Clock className="w-3.5 h-3.5" />
                              <span>待审批</span>
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-6 text-gray-600 dark:text-gray-300 max-w-[200px] truncate" title={record.decidedComment}>
                          {record.decidedComment || '-'}
                        </td>
                        <td className="py-4 px-6">
                          {record.status === 'hired' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                              <UserCheck className="w-3.5 h-3.5" />
                              已完成
                            </span>
                          ) : record.status === 'approved' ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleHire(record.id)}
                                disabled={submitting}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                              >
                                <UserPlus className="w-3 h-3" />
                                录用
                              </button>
                              <button
                                onClick={() => {
                                  const misUrl = `${window.location.origin}/mis/onboarding?candidateId=${record.candidateId}&candidateName=${encodeURIComponent(record.candidateName)}&position=${encodeURIComponent(record.positionName)}&score=${record.interviewScore}`;
                                  window.open(misUrl, '_blank');
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[#1a4bc4] hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs font-medium rounded-lg transition-colors"
                              >
                                <ExternalLink className="w-3 h-3" />
                                入职
                              </button>
                            </div>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500 text-xs">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination page={historyPage} pageSize={PAGE_SIZE} total={allHistory.length} onChange={setHistoryPage} />
        </div>
      </div>
    </motion.div>
  );
};
