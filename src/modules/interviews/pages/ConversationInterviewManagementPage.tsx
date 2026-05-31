import { useState, useEffect, useCallback } from 'react';
import { MessageCircle, Plus, Play, Eye, Trash2, Copy, Check, X, Link, Search } from 'lucide-react';
import { listManagementSessions, createInterviewSession, deleteInterviewSession, listInterviewTemplates } from '../api';
import type { InterviewManagementSession } from '../types';

// Simple candidate search from candidates API
const searchCandidates = async (query: string) => {
  try {
    const { API_BASE_URL, getAuthToken } = await import('../../../shared/lib/runtime');
    const res = await fetch(`${API_BASE_URL}/functions/v1/embox-api/candidate-ops?search=${encodeURIComponent(query)}&limit=20`, {
      headers: { Authorization: `Bearer ${getAuthToken() ?? ''}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data) ? data : data?.data ?? []).map((c: Record<string, unknown>) => ({
      id: String(c.id ?? ''), name: String(c.name ?? ''), email: String(c.email ?? ''), phone: String(c.phone ?? ''),
    }));
  } catch {
    return [];
  }
};

// SMS templates fetch
const fetchSmsTemplates = async () => {
  try {
    const { API_BASE_URL, getAuthToken } = await import('../../../shared/lib/runtime');
    const res = await fetch(`${API_BASE_URL}/functions/v1/embox-api/sms-gateway/templates`, {
      headers: { Authorization: `Bearer ${getAuthToken() ?? ''}` },
    });
    if (!res.ok) return [];
    return (await res.json()) as Array<{ id: string; name: string }>;
  } catch {
    return [];
  }
};

const ConversationInterviewManagementPage = () => {
  const [sessions, setSessions] = useState<InterviewManagementSession[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState<'select' | 'created'>('select');
  const [candidates, setCandidates] = useState<Array<{ id: string; name: string; email: string; phone: string }>>([]);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<string>('');
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; interviewMode: string }>>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [sendSms, setSendSms] = useState(false);
  const [smsTemplates, setSmsTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedSmsTemplate, setSelectedSmsTemplate] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdLink, setCreatedLink] = useState('');
  const [createdToken, setCreatedToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [modalError, setModalError] = useState('');

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listManagementSessions();
      setSessions(data);
    } catch { /* mock mode */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Load candidates on search
  useEffect(() => {
    if (candidateSearch.length < 1) { setCandidates([]); return; }
    const timer = setTimeout(async () => {
      const results = await searchCandidates(candidateSearch);
      setCandidates(results);
    }, 300);
    return () => clearTimeout(timer);
  }, [candidateSearch]);

  // Load templates when modal opens
  const openModal = async () => {
    setShowModal(true);
    setStep('select');
    setModalError('');
    setSelectedCandidate('');
    setSelectedTemplate('');
    setCandidateSearch('');
    setCandidates([]);
    setSendSms(false);
    setSelectedSmsTemplate('');
    try {
      const tpls = await listInterviewTemplates();
      setTemplates(tpls.filter((t) => (t as Record<string, unknown>).interviewMode === 'text_chat_conversational' || (t as Record<string, unknown>).interviewMode === 'video_conversational'));
    } catch { setTemplates([]); }
    try {
      const smsTpls = await fetchSmsTemplates();
      setSmsTemplates(smsTpls);
    } catch { setSmsTemplates([]); }
  };

  const handleCreate = async () => {
    if (!selectedCandidate || !selectedTemplate) {
      setModalError('请选择候选人和面试模板');
      return;
    }
    setCreating(true);
    setModalError('');
    try {
      const result = await createInterviewSession(selectedCandidate, selectedTemplate, {
        sendSms,
        smsTemplateId: sendSms ? selectedSmsTemplate : undefined,
      });
      const token = result.accessToken ?? '';
      const origin = window.location.origin;
      const link = `${origin}/interview/${token}`;
      setCreatedLink(link);
      setCreatedToken(token);
      setStep('created');
      loadSessions(); // refresh list
    } catch (e) {
      setModalError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(createdLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setStep('select');
  };

  const handleEnter = (session: InterviewManagementSession) => {
    const params = new URLSearchParams({
      templateId: session.templateId,
      sessionId: session.id,
      candidateId: session.candidateId,
      candidateName: session.candidateName,
      candidateEmail: session.candidateEmail,
    });
    window.location.href = `/interviews/conversational?${params.toString()}`;
  };

  const handleDelete = async (sessionId: string) => {
    if (!confirm('确定要删除此面试会话吗？')) return;
    try {
      await deleteInterviewSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch { /* silently handle */ }
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">加载中...</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">会话式面试管理</h2>
        <button
          onClick={openModal}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white bg-[#1a4bc4] hover:bg-[#1e3a8a] transition-colors"
        >
          <Plus className="w-4 h-4" />
          发起面试
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">暂无会话式面试记录</p>
          <p className="text-xs mt-1">点击「发起面试」创建新的会话式面试</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-500">候选人</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">岗位</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">面试模板</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">状态</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">时间</th>
                <th className="text-right py-3 px-4 font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="font-medium text-gray-900">{s.candidateName}</div>
                    <div className="text-xs text-gray-400">{s.candidateEmail}</div>
                  </td>
                  <td className="py-3 px-4 text-gray-600">{s.position}</td>
                  <td className="py-3 px-4 text-gray-600">{s.templateName}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      s.status === 'completed' ? 'bg-green-100 text-green-700' :
                      s.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                      s.status === 'pending' ? 'bg-gray-100 text-gray-600' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {s.status === 'completed' ? '已完成' :
                       s.status === 'in_progress' ? '进行中' :
                       s.status === 'pending' ? '待开始' :
                       s.status === 'cancelled' ? '已取消' : s.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-500 text-xs">{s.startTime}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {s.status === 'pending' || s.status === 'in_progress' ? (
                        <button onClick={() => handleEnter(s)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[#1a4bc4] hover:bg-[#1e3a8a] transition-colors">
                          <Play className="w-3 h-3" />进入面试
                        </button>
                      ) : (
                        <button onClick={() => handleEnter(s)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
                          <Eye className="w-3 h-3" />查看
                        </button>
                      )}
                      <button onClick={() => handleDelete(s.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create Session Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {step === 'select' ? '发起会话式面试' : '面试已创建'}
              </h3>
              <button onClick={handleCloseModal} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {step === 'select' ? (
              <>
                {/* Candidate search */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">候选人</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <input
                      type="text" value={candidateSearch} onChange={(e) => setCandidateSearch(e.target.value)}
                      placeholder="搜索候选人姓名或邮箱..."
                      className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]/20"
                    />
                  </div>
                  {candidates.length > 0 && (
                    <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
                      {candidates.map(c => (
                        <button key={c.id}
                          onClick={() => {
                            setSelectedCandidate(c.id);
                            setCandidateSearch(c.name);
                            setCandidates([]);
                          }}
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 ${selectedCandidate === c.id ? 'bg-blue-50' : ''}`}
                        >
                          <span className="font-medium text-gray-900">{c.name}</span>
                          <span className="ml-2 text-xs text-gray-400">{c.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedCandidate && !candidates.length && (
                    <p className="mt-1 text-xs text-green-600">已选择候选人</p>
                  )}
                </div>

                {/* Template selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">面试模板（仅显示对话式模板）</label>
                  <select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]/20">
                    <option value="">请选择面试模板</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  {templates.length === 0 && (
                    <p className="mt-1 text-xs text-gray-400">暂无对话式面试模板，请先在「模板管理」中创建</p>
                  )}
                </div>

                {/* SMS toggle */}
                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} className="sr-only peer" />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#1a4bc4]" />
                  </label>
                  <span className="text-sm text-gray-700">发送短信通知候选人</span>
                </div>

                {sendSms && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">短信模板</label>
                    <select value={selectedSmsTemplate} onChange={(e) => setSelectedSmsTemplate(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]/20">
                      <option value="">请选择短信模板</option>
                      {smsTemplates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {modalError && <p className="text-sm text-red-500">{modalError}</p>}

                {/* Create button */}
                <button onClick={handleCreate} disabled={creating || !selectedCandidate || !selectedTemplate}
                  className="w-full py-2.5 rounded-xl text-sm font-medium text-white bg-[#1a4bc4] hover:bg-[#1e3a8a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {creating ? '创建中...' : '创建面试'}
                </button>
              </>
            ) : (
              <>
                {/* Created state — show interview link */}
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Link className="w-4 h-4 text-[#1a4bc4]" />
                    <span className="font-medium text-gray-900">面试链接</span>
                  </div>
                  <div className="flex gap-2">
                    <input type="text" readOnly value={createdLink}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 bg-white" />
                    <button onClick={handleCopyLink}
                      className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium text-white bg-[#1a4bc4] hover:bg-[#1e3a8a] transition-colors inline-flex items-center gap-1">
                      {copied ? <><Check className="w-3.5 h-3.5" />已复制</> : <><Copy className="w-3.5 h-3.5" />复制</>}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400">
                    将此链接发送给候选人，候选人点击即可进入面试（无需登录）
                  </p>
                </div>

                <button onClick={handleCloseModal}
                  className="w-full py-2.5 rounded-xl text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors">
                  关闭
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ConversationInterviewManagementPage;
