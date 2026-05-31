import { useState, useEffect, useCallback } from 'react';
import { MessageCircle, Plus, Play, Eye, Trash2 } from 'lucide-react';
import { listManagementSessions, createInterviewSession, deleteInterviewSession } from '../api';
import type { InterviewManagementSession } from '../types';

/**
 * Management page for conversational interview sessions.
 * Mirrors InterviewManagementPage but for the new conversational flow.
 */
const ConversationInterviewManagementPage = () => {
  const [sessions, setSessions] = useState<InterviewManagementSession[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listManagementSessions();
      setSessions(data);
    } catch {
      // mock mode or API error — silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const handleEnter = (session: InterviewManagementSession) => {
    // Navigate to conversational interview page
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
    } catch {
      // silently handle
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">加载中...</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">会话式面试管理</h2>
        <button
          onClick={() => {/* TODO: create session flow */}}
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
                        <button
                          onClick={() => handleEnter(s)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[#1a4bc4] hover:bg-[#1e3a8a] transition-colors"
                        >
                          <Play className="w-3 h-3" />
                          进入面试
                        </button>
                      ) : (
                        <button
                          onClick={() => handleEnter(s)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          查看
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
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
    </div>
  );
};

export default ConversationInterviewManagementPage;
