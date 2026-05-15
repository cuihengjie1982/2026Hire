import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Search, PlayCircle, Pause, XCircle, Clock, Filter, ChevronDown, MoreVertical, User, Mail, FileText, CheckCircle, Eye, Plus, Loader2, Trash2, Download } from 'lucide-react';
import {type InterviewManagementSession, type InterviewTemplateSummary} from '../types';
import { listManagementSessions, createInterviewSession, updateSessionStatus, deleteInterviewSession, listInterviewTemplates, exportInterviewResultsCsv } from '../api';
import { listCandidates } from '../../candidates/api';
import type { CandidateCard } from '../../candidates/types';
import { listPositions } from '../../positions/api';
import type { PositionSummary } from '../../positions/types';

interface InterviewManagementPageProps {
  isEmbedded?: boolean;
  onTabChange?: (tab: 'config' | 'management' | 'results' | 'analytics') => void;
}

export const InterviewManagementPage = ({ isEmbedded = false, onTabChange }: InterviewManagementPageProps) => {
  const [sessions, setSessions] = useState<InterviewManagementSession[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  };
  const [positionFilter, setPositionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [operating, setOperating] = useState<string | null>(null);

  // Dynamic data for filters + create dialog
  const [positions, setPositions] = useState<PositionSummary[]>([]);
  const [templates, setTemplates] = useState<InterviewTemplateSummary[]>([]);
  const [candidates, setCandidates] = useState<CandidateCard[]>([]);

  // Create session dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createCandidateId, setCreateCandidateId] = useState('');
  const [createTemplateId, setCreateTemplateId] = useState('');
  const [creating, setCreating] = useState(false);

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    listPositions().then(setPositions).catch(() => {});
    listInterviewTemplates().then(setTemplates).catch(() => {});
    listCandidates().then(setCandidates).catch(() => {});
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await listManagementSessions();
      setSessions(data);
    } catch (e) {
      console.error('Failed to load sessions:', e);
    } finally {
      setLoading(false);
    }
  };

  const statuses = [
    { value: 'all', label: '全部状态' },
    { value: 'pending', label: '待开始' },
    { value: 'in_progress', label: '进行中' },
    { value: 'paused', label: '已暂停' },
    { value: 'completed', label: '已完成' },
    { value: 'cancelled', label: '已取消' },
  ];

  const filteredSessions = sessions.filter(session => {
    const matchesSearch = session.candidateName.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      session.candidateEmail.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchesPosition = positionFilter === 'all' || session.position === positionFilter;
    const matchesStatus = statusFilter === 'all' || session.status === statusFilter;
    return matchesSearch && matchesPosition && matchesStatus;
  });

  const handleStart = async (id: string) => {
    setOperating(id);
    try {
      await updateSessionStatus(id, 'in_progress');
      setSessions(prev => prev.map(s => s.id === id ? { ...s, status: 'in_progress' as const } : s));
    } catch (e) { console.error('Failed to start session:', e); }
    finally { setOperating(null); }
  };

  const handlePause = async (id: string) => {
    setOperating(id);
    try {
      await updateSessionStatus(id, 'closed');
      setSessions(prev => prev.map(s => s.id === id ? { ...s, status: 'paused' as const } : s));
    } catch (e) { console.error('Failed to pause session:', e); }
    finally { setOperating(null); }
  };

  const handleCancel = async (id: string) => {
    setOperating(id);
    try {
      await updateSessionStatus(id, 'closed');
      setSessions(prev => prev.map(s => s.id === id ? { ...s, status: 'cancelled' as const } : s));
    } catch (e) { console.error('Failed to cancel session:', e); }
    finally { setOperating(null); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteInterviewSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch (e) { console.error('Failed to delete session:', e); }
    finally { setDeleteConfirmId(null); }
  };

  const handleCreate = async () => {
    if (!createCandidateId || !createTemplateId) return;
    setCreating(true);
    try {
      await createInterviewSession(createCandidateId, createTemplateId);
      setShowCreateDialog(false);
      setCreateCandidateId('');
      setCreateTemplateId('');
      await loadData();
    } catch (e) {
      console.error('Failed to create session:', e);
      alert('创建面试失败: ' + (e instanceof Error ? e.message : '未知错误'));
    } finally {
      setCreating(false);
    }
  };

  const handleEnterInterview = async (session: InterviewManagementSession) => {
    // Update session status to in_progress
    try {
      await updateSessionStatus(session.id, 'in_progress');
    } catch (e) {
      console.warn('Failed to update session to in_progress:', e);
    }

    const params = new URLSearchParams({
      templateId: session.templateId ?? '',
      sessionId: session.id,
      candidateId: session.candidateId ?? '',
      candidateName: session.candidateName ?? '',
      candidateEmail: session.candidateEmail ?? '',
    });
    const route = `/interviews/preview?${params.toString()}`;
    window.history.pushState({}, '', route);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-gray-100 text-gray-600';
      case 'in_progress': return 'bg-[#cffafe] text-[#22d3ee]';
      case 'paused': return 'bg-amber-100 text-amber-600';
      case 'completed': return 'bg-emerald-100 text-emerald-600';
      case 'cancelled': return 'bg-red-100 text-red-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return '待开始';
      case 'in_progress': return '进行中';
      case 'paused': return '已暂停';
      case 'completed': return '已完成';
      case 'cancelled': return '已取消';
      default: return status;
    }
  };

  const formatTime = (time: string) => {
    if (!time) return '—';
    const date = new Date(time);
    return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // Candidate search for create dialog
  const [candidateSearch, setCandidateSearch] = useState('');
  const filteredCandidates = candidates.filter(c =>
    c.name.toLowerCase().includes(candidateSearch.toLowerCase()) ||
    (c.resumeParsedInfo?.email ?? '').toLowerCase().includes(candidateSearch.toLowerCase())
  );

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
            <h1 className="text-[44px] font-extrabold text-gray-900 dark:text-white tracking-tight mb-4">面试管理</h1>
            <p className="text-[20px] text-gray-700 dark:text-gray-300">管理进行中的AI面试会话</p>
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
                  tab.key === 'management'
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

      <div className={`${isEmbedded ? 'flex-1' : 'max-w-[1600px] w-full mx-auto bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-xl flex flex-1 mb-8 overflow-hidden border border-white dark:border-gray-700'}`}>
        <div className="flex-1 p-6">
          {/* Filters + Create Button */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="搜索候选人姓名或邮箱..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
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
                  {positions.map(pos => (
                    <option key={pos.id} value={pos.name}>{pos.code ? `${pos.code} - ` : ''}{pos.name}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
              </div>
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="appearance-none bg-white border border-gray-200 rounded-lg pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#22d3ee]/20 focus:border-[#22d3ee] transition-all cursor-pointer"
                >
                  {statuses.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
              </div>
              <button
                onClick={() => setShowCreateDialog(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-[#22d3ee] hover:bg-[#06b6d4] text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                发起面试
              </button>
            </div>
          </div>

          {/* Sessions List */}
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-16">
                <Loader2 className="w-8 h-8 text-[#22d3ee] animate-spin mx-auto mb-4" />
                <p className="text-gray-500">加载中...</p>
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-500 font-medium">暂无面试会话</p>
                <p className="text-gray-400 text-sm mt-1">点击上方「发起面试」按钮创建</p>
              </div>
            ) : (
              filteredSessions.map((session, index) => (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white rounded-xl border border-gray-100 p-5 hover:border-[#22d3ee]/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-12 h-12 bg-gradient-to-br from-[#22d3ee] to-[#06b6d4] rounded-full flex items-center justify-center">
                        <User className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <div className="font-bold text-gray-900 text-lg">{session.candidateName || '未知候选人'}</div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Mail className="w-3.5 h-3.5" />
                          {session.candidateEmail || '—'}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-center px-6">
                      <div className="text-sm font-medium text-gray-700">{session.position || '未指定岗位'}</div>
                      <div className="text-xs text-gray-400">{session.templateName || '—'}</div>
                    </div>

                    <div className="flex items-center gap-2 px-6">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <div className="text-sm text-gray-600">{formatTime(session.startTime)}</div>
                    </div>

                    <div className="px-4">
                      <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${getStatusColor(session.status)}`}>
                        {getStatusLabel(session.status)}
                      </span>
                    </div>

                    <div className="flex flex-col items-center px-6">
                      <div className="text-sm font-medium text-gray-700">
                        {session.progress.current}/{session.progress.total}
                      </div>
                      <div className="w-24 h-2 bg-gray-100 rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#22d3ee] to-[#06b6d4] rounded-full transition-all"
                          style={{ width: `${session.progress.total > 0 ? (session.progress.current / session.progress.total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>

                    <div className="px-6">
                      {session.score !== undefined ? (
                        <div className="text-lg font-bold text-[#22d3ee]">{session.score}分</div>
                      ) : (
                        <div className="text-sm text-gray-400">待评分</div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {session.status === 'pending' && (
                        <button
                          onClick={() => handleStart(session.id)}
                          disabled={operating === session.id}
                          className="flex items-center gap-1.5 px-4 py-2 bg-[#22d3ee] hover:bg-[#06b6d4] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                          {operating === session.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                          开始
                        </button>
                      )}
                      {(session.status === 'pending' || session.status === 'in_progress') && (
                        <button
                          onClick={() => handleEnterInterview(session)}
                          className="flex items-center gap-1.5 px-4 py-2 border border-[#22d3ee] text-[#22d3ee] hover:bg-[#cffafe] rounded-lg text-sm font-medium transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                          进入面试
                        </button>
                      )}
                      {session.status === 'in_progress' && (
                        <button
                          onClick={() => handlePause(session.id)}
                          disabled={operating === session.id}
                          className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                          {operating === session.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}
                          暂停
                        </button>
                      )}
                      {(session.status === 'pending' || session.status === 'in_progress' || session.status === 'paused') && (
                        <button
                          onClick={() => handleCancel(session.id)}
                          disabled={operating === session.id}
                          className="flex items-center gap-1.5 px-4 py-2 border border-red-200 text-red-500 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                          <XCircle className="w-4 h-4" />
                          取消
                        </button>
                      )}
                      {session.status === 'completed' && (
                        <button
                          onClick={() => onTabChange?.('results')}
                          className="flex items-center gap-1.5 px-4 py-2 border border-[#22d3ee] text-[#22d3ee] hover:bg-[#cffafe] rounded-lg text-sm font-medium transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                          查看结果
                        </button>
                      )}
                      {(session.status === 'cancelled' || session.status === 'pending') && (
                        <button
                          onClick={() => setDeleteConfirmId(session.id)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-4 gap-4 mt-8">
            <div className="bg-gradient-to-br from-[#22d3ee] to-[#06b6d4] rounded-xl p-5 text-white">
              <div className="text-2xl font-bold">{sessions.length}</div>
              <div className="text-sm opacity-80 mt-1">面试总数</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="text-2xl font-bold text-gray-900">
                {sessions.filter(s => s.status === 'in_progress').length}
              </div>
              <div className="text-sm text-gray-500 mt-1">正在面试</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="text-2xl font-bold text-gray-900">
                {sessions.filter(s => s.status === 'pending').length}
              </div>
              <div className="text-sm text-gray-500 mt-1">等待开始</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="text-2xl font-bold text-gray-900">
                {sessions.filter(s => s.status === 'completed').length}
              </div>
              <div className="text-sm text-gray-500 mt-1">已完成</div>
            </div>
          </div>
        </div>
      </div>

      {/* Create Session Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{opacity: 0, scale: 0.95}}
            animate={{opacity: 1, scale: 1}}
            className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">发起新面试</h3>
              <button onClick={() => setShowCreateDialog(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              {/* Candidate Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">选择候选人 *</label>
                <input
                  type="text"
                  placeholder="搜索候选人姓名或邮箱..."
                  value={candidateSearch}
                  onChange={(e) => setCandidateSearch(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-[#22d3ee]"
                />
                <select
                  value={createCandidateId}
                  onChange={(e) => setCreateCandidateId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#22d3ee] bg-white"
                  size={5}
                >
                  {filteredCandidates.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.resumeParsedInfo?.email || '无邮箱'})
                    </option>
                  ))}
                  {filteredCandidates.length === 0 && (
                    <option disabled>无匹配候选人</option>
                  )}
                </select>
              </div>

              {/* Template Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">选择面试模板 *</label>
                <select
                  value={createTemplateId}
                  onChange={(e) => setCreateTemplateId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#22d3ee] bg-white"
                >
                  <option value="">请选择面试模板</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.questionCount}题)</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateDialog(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !createCandidateId || !createTemplateId}
                className="flex-1 px-4 py-2 bg-[#22d3ee] text-white rounded-lg text-sm font-medium hover:bg-[#06b6d4] transition-colors disabled:opacity-50"
              >
                {creating ? '创建中...' : '创建面试'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">删除面试会话</h3>
            <p className="text-sm text-gray-500 mb-6">确定要删除此面试会话吗？此操作不可撤销。</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
