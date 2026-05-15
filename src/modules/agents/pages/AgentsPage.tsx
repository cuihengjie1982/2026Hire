import {motion} from 'motion/react';
import {Bell, Bot, Cpu, MoreHorizontal, Plus, Tag, Loader2, X, Copy, Download, Eye, ChevronDown, Wifi, WifiOff, Play, Zap, Pencil, Trash2} from 'lucide-react';
import {useEffect, useState, useRef} from 'react';
import {listAgents, getAgentStats, pauseAgent, resumeAgent, createAgent, runAgent, deleteAgent, updateAgent} from '../api';
import {type Agent, type AgentStats, type AgentType, type AgentConfig, type AgentRunResult} from '../types';
import {ConfirmDialog} from '../../../shared/components/ConfirmDialog';
import {AIModelConfigPage} from '../../ai/pages/AIModelConfigPage';
import {getActiveModelConfig, listAIModelConfigs} from '../../ai/api';
import {type AIModelConfig} from '../../ai/types';
import {type PositionSummary} from '../../positions/types';
import {listPositions} from '../../positions/api';

type TabType = 'all' | 'running' | 'pending' | 'paused';
type ViewMode = 'agents' | 'ai-config';

export const AgentsPage = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('agents');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [moreMenuOpenId, setMoreMenuOpenId] = useState<string | null>(null);

  // New agent creation dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newAgent, setNewAgent] = useState({name: '', type: 'screener' as AgentType, positionId: '', aiModelConfigId: ''});

  // Data for create dialog
  const [positions, setPositions] = useState<PositionSummary[]>([]);
  const [aiConfigs, setAiConfigs] = useState<AIModelConfig[]>([]);

  // Run agent state
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null);
  const [toast, setToast] = useState<{type: 'success' | 'error'; text: string} | null>(null);

  // Notification panel
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Agent detail / config expansion
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);

  // Withdraw confirmation dialog
  const [withdrawConfirmId, setWithdrawConfirmId] = useState<string | null>(null);

  // Active AI model
  const [activeModelName, setActiveModelName] = useState<string | null>(null);

  // Edit agent dialog
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [editForm, setEditForm] = useState({name: '', description: '', type: 'screener' as AgentType, positionId: '', aiModelConfigId: ''});
  const [editLoading, setEditLoading] = useState(false);

  // Delete agent confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    loadData();
    loadActiveModel();
    loadDialogData();
  }, []);

  const loadDialogData = async () => {
    try {
      const [posRes, cfgRes] = await Promise.all([listPositions(), listAIModelConfigs()]);
      setPositions(posRes);
      setAiConfigs(cfgRes);
    } catch { /* non-critical */ }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [agentsRes, statsRes] = await Promise.all([listAgents(), getAgentStats()]);
      setAgents(agentsRes);
      setStats(statsRes);
    } catch (e) {
      console.error('Failed to load agents:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadActiveModel = async () => {
    try {
      const {active} = await getActiveModelConfig();
      if (active) setActiveModelName(active.model_name);
    } catch { /* non-critical */ }
  };

  const handlePause = async (agentId: string) => {
    setActionLoading(agentId);
    try {
      await pauseAgent(agentId);
      await loadData();
    } catch (e) {
      console.error('Failed to pause agent:', e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async (agentId: string) => {
    setActionLoading(agentId);
    try {
      await resumeAgent(agentId);
      await loadData();
    } catch (e) {
      console.error('Failed to resume agent:', e);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredAgents = activeTab === 'all' ? agents : agents.filter((a) => a.status === activeTab);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({type, text});
    setTimeout(() => setToast(null), 4000);
  };

  const handleCreateAgent = async () => {
    if (!newAgent.name.trim()) return;
    const needsPosition = newAgent.type === 'screener' || newAgent.type === 'matcher';
    if (needsPosition && !newAgent.positionId) {
      showToast('error', '请选择关联岗位');
      return;
    }

    const posName = positions.find(p => p.id === newAgent.positionId)?.name || '';

    try {
      await createAgent({
        name: newAgent.name,
        type: newAgent.type,
        roleType: newAgent.type === 'parser' ? '简历解析' : newAgent.type === 'screener' ? '简历筛选' : '岗位匹配',
        config: {
          positionId: newAgent.positionId || undefined,
          positionName: posName || undefined,
          aiModelConfigId: newAgent.aiModelConfigId || undefined,
        },
      });
      setShowCreateDialog(false);
      setNewAgent({name: '', type: 'screener', positionId: '', aiModelConfigId: ''});
      await loadData();
    } catch (e) {
      showToast('error', `创建失败: ${e instanceof Error ? e.message : '未知错误'}`);
    }
  };

  const handleRunAgent = async (agentId: string) => {
    setRunningAgentId(agentId);
    try {
      const result = await runAgent(agentId);
      const r: AgentRunResult = result.runResult;
      showToast('success', `${r.summary}（耗时 ${(r.duration / 1000).toFixed(1)}s）`);
      await loadData();
    } catch (e) {
      showToast('error', `运行失败: ${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setRunningAgentId(null);
    }
  };

  const handleExportData = (agent: Agent) => {
    const headers = ['ID', '名称', '状态', '项目', '岗位类型', '今日推送', '已批准', '已拒绝', '待审阅', '采纳率', '更新时间'];
    const row = [agent.id, agent.name, agent.status, agent.projectName, agent.roleType, agent.pushedToday, agent.approved, agent.rejected, agent.pending, `${agent.adoptionRate}%`, agent.updatedAt];
    const csvContent = [headers.join(','), row.join(',')].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `agent_${agent.name}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyAgent = (agent: Agent) => {
    const copy: Agent = {
      ...agent,
      id: `copy-${Date.now()}`,
      name: `${agent.name} (副本)`,
      status: 'paused',
      pushedToday: 0,
      approved: 0,
      rejected: 0,
      pending: 0,
      adoptionRate: 0,
      updatedAt: new Date().toLocaleString('zh-CN'),
    };
    setAgents(prev => [...prev, copy]);
  };

  const openEditDialog = (agent: Agent) => {
    const cfg = (agent.config ?? {}) as AgentConfig;
    setEditingAgent(agent);
    setEditForm({
      name: agent.name,
      description: agent.description ?? '',
      type: agent.type ?? 'screener',
      positionId: cfg.positionId ?? '',
      aiModelConfigId: cfg.aiModelConfigId ?? '',
    });
    setMoreMenuOpenId(null);
  };

  const handleSaveEdit = async () => {
    if (!editingAgent || !editForm.name.trim()) return;
    setEditLoading(true);
    try {
      const posName = positions.find(p => p.id === editForm.positionId)?.name || '';
      await updateAgent(editingAgent.id, {
        name: editForm.name.trim(),
        description: editForm.description || undefined,
        type: editForm.type,
        config: {
          positionId: editForm.positionId || undefined,
          positionName: posName || undefined,
          aiModelConfigId: editForm.aiModelConfigId || undefined,
        },
      });
      setEditingAgent(null);
      showToast('success', '代理已更新');
      await loadData();
    } catch (e) {
      showToast('error', `更新失败: ${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteAgent = async () => {
    if (!deleteConfirmId) return;
    setDeleteLoading(true);
    try {
      await deleteAgent(deleteConfirmId);
      setDeleteConfirmId(null);
      showToast('success', '代理已删除');
      await loadData();
    } catch (e) {
      showToast('error', `删除失败: ${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Close notifications on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotifications]);

  const agentTypeLabels: Record<string, string> = {
    parser: '简历解析',
    screener: '简历筛选',
    matcher: '岗位匹配',
  };

  const mockNotifications = [
    { id: '1', message: '代理「ITF数据采集-A3」推送了 5 位新候选人', time: '10 分钟前' },
    { id: '2', message: '代理「MWV动捕演员-B1」的采纳率提升至 62%', time: '1 小时前' },
    { id: '3', message: '代理「ITW场景采集-C2」已暂停，待审批恢复', time: '3 小时前' },
  ];

  const tabs: {key: TabType; label: string; count: number}[] = [
    {key: 'all', label: `全部(${agents.length})`, count: agents.length},
    {key: 'running', label: `运行中(${agents.filter((a) => a.status === 'running').length})`, count: agents.filter((a) => a.status === 'running').length},
    {key: 'pending', label: `待审批(${agents.filter((a) => a.status === 'pending').length})`, count: agents.filter((a) => a.status === 'pending').length},
    {key: 'paused', label: `已暂停(${agents.filter((a) => a.status === 'paused').length})`, count: agents.filter((a) => a.status === 'paused').length},
  ];

  return (
    <motion.div
      initial={{opacity: 0, y: 10}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, y: -10}}
      className="max-w-[1500px] mx-auto flex flex-col h-full bg-slate-50 dark:bg-gray-900 relative w-full"
    >
      <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-0 z-10">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-[26px] font-bold text-gray-900 dark:text-white mb-1">
              {viewMode === 'agents' ? 'AI 招募代理' : 'AI 模型配置'}
            </h1>
            <p className="text-[13px] text-gray-500 dark:text-gray-400">
              {viewMode === 'agents' ? '管理你的 24/7 自动寻源代理' : '管理 AI 大模型的连接配置'}
            </p>
          </div>
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('agents')}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                viewMode === 'agents' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Bot className="w-3.5 h-3.5 inline mr-1" />
              代理管理
            </button>
            <button
              onClick={() => setViewMode('ai-config')}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                viewMode === 'ai-config' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 inline mr-1" />
              模型配置
            </button>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {/* Active AI model badge */}
          {activeModelName && (
            <span className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[11px] font-medium border border-emerald-200">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <Wifi className="w-3 h-3" />
              {activeModelName}
            </span>
          )}
          {!activeModelName && (
            <span className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 rounded-lg text-[11px] font-medium border border-gray-200 dark:border-gray-700">
              <WifiOff className="w-3 h-3" />
              未选择模型
            </span>
          )}
          {viewMode === 'agents' && (
            <button onClick={() => setShowCreateDialog(true)} className="flex items-center space-x-2 bg-[#1a4bc4] hover:bg-[#0c2b7a] text-white px-4 py-2 rounded-lg text-[13px] font-medium transition-colors">
              <Plus className="w-4 h-4" />
              <span>新建代理</span>
            </button>
          )}
          <div ref={notifRef} className="relative">
            <button onClick={() => setShowNotifications(!showNotifications)} className="relative p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
            {showNotifications && (
              <div className="absolute right-0 top-full mt-2 w-[320px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-2 z-30">
                <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-[13px] font-bold text-gray-900 dark:text-white">通知</span>
                </div>
                {mockNotifications.map(n => (
                  <div key={n.id} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer">
                    <div className="text-[13px] text-gray-700 dark:text-gray-300 leading-snug">{n.message}</div>
                    <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{n.time}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50 dark:bg-gray-900">
        {viewMode === 'agents' ? (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {loading ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm animate-pulse">
                  <div className="h-4 w-24 bg-gray-100 dark:bg-gray-800 rounded mb-2"></div>
                  <div className="h-8 w-12 bg-gray-100 dark:bg-gray-800 rounded"></div>
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="text-[12px] text-gray-500 dark:text-gray-400 mb-2">运行中代理</div>
                <div className="text-[28px] leading-none font-bold text-emerald-600">{stats?.runningAgents ?? 0}</div>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="text-[12px] text-gray-500 dark:text-gray-400 mb-2">今日推送候选人</div>
                <div className="text-[28px] leading-none font-bold text-gray-900 dark:text-white">{stats?.pushedToday ?? 0}</div>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="text-[12px] text-gray-500 dark:text-gray-400 mb-2">本周采纳率</div>
                <div className="text-[28px] leading-none font-bold text-gray-900 dark:text-white">{stats?.weeklyAdoptionRate ?? 0}%</div>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="text-[12px] text-gray-500 dark:text-gray-400 mb-2">本月触发外联</div>
                <div className="text-[28px] leading-none font-bold text-gray-900 dark:text-white">{stats?.monthlyOutreach ?? 0}</div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center space-x-6 border-b border-gray-200 dark:border-gray-700 text-[13px]">
          {tabs.map((tab, index) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 font-medium transition-colors relative ${
                activeTab === tab.key ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {activeTab === tab.key && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-gray-900 rounded-t-full"></span>}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-[#1a4bc4]" />
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="text-center py-20 text-gray-500 dark:text-gray-400">暂无代理数据</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {filteredAgents.map((card) => {
              const statusPill =
                card.status === 'running'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                  : card.status === 'pending'
                    ? 'bg-orange-100 text-orange-700 border-orange-200'
                    : 'bg-gray-100 text-gray-600 border-gray-200';

              const agentConfig = (card.config ?? {}) as AgentConfig;

              return (
                <div
                  key={card.id}
                  className={`bg-white rounded-2xl border shadow-sm p-5 flex flex-col justify-between ${
                    card.status === 'running'
                      ? 'border-emerald-500/20'
                      : card.status === 'pending'
                        ? 'border-orange-300/30'
                        : 'border-gray-200'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="text-[18px] font-bold text-gray-900 dark:text-white">{card.name}</h3>
                      <span className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${statusPill}`}>
                        <span>
                          {card.status === 'running'
                            ? '运行中'
                            : card.status === 'pending'
                              ? '待审批'
                              : '已暂停'}
                        </span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <span className="flex items-center gap-1 text-[11px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 font-medium">
                        <Zap className="w-3 h-3" />
                        {agentTypeLabels[card.type || 'screener'] || card.roleType}
                      </span>
                      {agentConfig.positionName && (
                        <span className="flex items-center gap-1 text-[11px] text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                          <Tag className="w-3 h-3" />
                          {agentConfig.positionName}
                        </span>
                      )}
                    </div>

                    {agentConfig.lastRunSummary && (
                      <div className="text-[12px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-lg mb-3">
                        {agentConfig.lastRunSummary}
                      </div>
                    )}

                    {(card.approved > 0 || card.rejected > 0 || card.pending > 0) && (
                      <div className="text-[12px] text-gray-500 dark:text-gray-400 mb-3 flex flex-wrap gap-x-4 gap-y-1">
                        <span>已推荐 <span className="text-emerald-600 font-medium">{card.approved}</span></span>
                        <span>不推荐 <span className="text-red-500 font-medium">{card.rejected}</span></span>
                        <span>待定 <span className="text-gray-900 dark:text-white font-medium">{card.pending}</span></span>
                        {card.adoptionRate > 0 && (
                          <span>采纳率 <span className="font-medium">{card.adoptionRate}%</span></span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-3 mt-auto">
                    <button
                      onClick={() => handleRunAgent(card.id)}
                      disabled={runningAgentId === card.id}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-[#1a4bc4] hover:bg-[#0c2b7a] text-white py-2 rounded-lg text-[13px] font-medium transition-colors disabled:opacity-50"
                    >
                      {runningAgentId === card.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Play className="w-3.5 h-3.5" />立即运行</>}
                    </button>
                    {card.status === 'running' && (
                      <button
                        onClick={() => handlePause(card.id)}
                        disabled={actionLoading === card.id}
                        className="px-4 py-2 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded-lg text-[13px] font-medium text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50"
                      >
                        {actionLoading === card.id ? <Loader2 className="w-4 h-4 animate-spin" /> : '暂停'}
                      </button>
                    )}
                    {card.status === 'paused' && (
                      <button
                        onClick={() => handleResume(card.id)}
                        disabled={actionLoading === card.id}
                        className="px-4 py-2 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded-lg text-[13px] font-medium text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50"
                      >
                        {actionLoading === card.id ? <Loader2 className="w-4 h-4 animate-spin" /> : '恢复'}
                      </button>
                    )}
                    <button
                      onClick={() => setMoreMenuOpenId(moreMenuOpenId === card.id ? null : card.id)}
                      className="relative px-3 py-2 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded-lg text-gray-700 dark:text-gray-300 transition-colors"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                      {moreMenuOpenId === card.id && (
                        <div className="absolute right-0 bottom-full mb-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[140px] z-20">
                          <button onClick={(e) => { e.stopPropagation(); openEditDialog(card); }} className="w-full text-left px-3 py-1.5 text-[13px] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30 flex items-center gap-2"><Pencil className="w-3.5 h-3.5" />编辑</button>
                          <button onClick={(e) => { e.stopPropagation(); setExpandedAgentId(expandedAgentId === card.id ? null : card.id); setMoreMenuOpenId(null); }} className="w-full text-left px-3 py-1.5 text-[13px] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30 flex items-center gap-2"><Eye className="w-3.5 h-3.5" />查看详情</button>
                          <button onClick={(e) => { e.stopPropagation(); handleExportData(card); setMoreMenuOpenId(null); }} className="w-full text-left px-3 py-1.5 text-[13px] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30 flex items-center gap-2"><Download className="w-3.5 h-3.5" />导出数据</button>
                          <button onClick={(e) => { e.stopPropagation(); handleCopyAgent(card); setMoreMenuOpenId(null); }} className="w-full text-left px-3 py-1.5 text-[13px] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30 flex items-center gap-2"><Copy className="w-3.5 h-3.5" />复制代理</button>
                          <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>
                          <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(card.id); setMoreMenuOpenId(null); }} className="w-full text-left px-3 py-1.5 text-[13px] text-red-600 hover:bg-red-50 flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" />删除</button>
                        </div>
                      )}
                    </button>
                  </div>

                  {expandedAgentId === card.id && (
                    <div className="mt-4 bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-3">
                      <div className="text-[13px] font-bold text-gray-900 dark:text-white">代理详情</div>
                      <div className="grid grid-cols-2 gap-3 text-[12px]">
                        <div><span className="text-gray-500 dark:text-gray-400">类型：</span><span className="text-gray-900 dark:text-white">{agentTypeLabels[card.type || 'screener']}</span></div>
                        <div><span className="text-gray-500 dark:text-gray-400">状态：</span><span className="text-gray-900 dark:text-white">{card.status === 'running' ? '运行中' : card.status === 'pending' ? '待审批' : '已暂停'}</span></div>
                        {agentConfig.positionName && <div><span className="text-gray-500 dark:text-gray-400">绑定岗位：</span><span className="text-gray-900 dark:text-white">{agentConfig.positionName}</span></div>}
                        {agentConfig.aiModelConfigId && <div><span className="text-gray-500 dark:text-gray-400">AI模型：</span><span className="text-gray-900 dark:text-white font-mono text-[11px]">{agentConfig.aiModelConfigId.slice(0, 8)}...</span></div>}
                        <div><span className="text-gray-500 dark:text-gray-400">今日推送：</span><span className="text-gray-900 dark:text-white">{card.pushedToday}</span></div>
                        <div><span className="text-gray-500 dark:text-gray-400">已推荐：</span><span className="text-emerald-600 font-medium">{card.approved}</span></div>
                        <div><span className="text-gray-500 dark:text-gray-400">不推荐：</span><span className="text-red-500 font-medium">{card.rejected}</span></div>
                        <div><span className="text-gray-500 dark:text-gray-400">采纳率：</span><span className="text-gray-900 dark:text-white">{card.adoptionRate}%</span></div>
                        {agentConfig.processedCount != null && <div><span className="text-gray-500 dark:text-gray-400">累计处理：</span><span className="text-gray-900 dark:text-white">{agentConfig.processedCount} 人</span></div>}
                        {agentConfig.lastRunAt && <div className="col-span-2"><span className="text-gray-500 dark:text-gray-400">上次运行：</span><span className="text-gray-900 dark:text-white">{new Date(agentConfig.lastRunAt).toLocaleString('zh-CN')}</span></div>}
                        {agentConfig.lastRunSummary && <div className="col-span-2 bg-white dark:bg-gray-800 rounded-lg p-2 border border-gray-100 dark:border-gray-700"><span className="text-gray-500 dark:text-gray-400">摘要：</span><span className="text-gray-700 dark:text-gray-300">{agentConfig.lastRunSummary}</span></div>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
          </>
        ) : (
          <AIModelConfigPage />
        )}
      </div>

      {/* Create Agent Dialog */}
      {viewMode === 'agents' && showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[18px] font-bold text-gray-900 dark:text-white">新建代理</h3>
              <button onClick={() => setShowCreateDialog(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">代理名称</label>
                <input
                  value={newAgent.name}
                  onChange={(e) => setNewAgent(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="例如：数据标注员简历筛选"
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] focus:border-[#1a4bc4] placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">代理类型</label>
                <select
                  value={newAgent.type}
                  onChange={(e) => setNewAgent(prev => ({ ...prev, type: e.target.value as AgentType }))}
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] focus:border-[#1a4bc4] bg-white dark:bg-gray-800"
                >
                  <option value="parser">简历解析 — 解析简历为结构化数据</option>
                  <option value="screener">简历筛选 — 按岗位标准评分评级</option>
                  <option value="matcher">岗位匹配 — 候选人排名推荐</option>
                </select>
              </div>
              {(newAgent.type === 'screener' || newAgent.type === 'matcher') && (
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">关联岗位 <span className="text-red-500">*</span></label>
                  <select
                    value={newAgent.positionId}
                    onChange={(e) => setNewAgent(prev => ({ ...prev, positionId: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] focus:border-[#1a4bc4] bg-white dark:bg-gray-800"
                  >
                    <option value="">请选择岗位</option>
                    {positions.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">AI 模型配置</label>
                <select
                  value={newAgent.aiModelConfigId}
                  onChange={(e) => setNewAgent(prev => ({ ...prev, aiModelConfigId: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] focus:border-[#1a4bc4] bg-white dark:bg-gray-800"
                >
                  <option value="">使用默认模型</option>
                  {aiConfigs.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.provider}/{c.model_name})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowCreateDialog(false); setNewAgent({ name: '', type: 'screener', positionId: '', aiModelConfigId: '' }); }}
                className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded-lg text-[13px] font-medium text-gray-700 dark:text-gray-300 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreateAgent}
                disabled={!newAgent.name.trim()}
                className="flex-1 px-4 py-2.5 bg-[#1a4bc4] hover:bg-[#0c2b7a] text-white rounded-lg text-[13px] font-medium transition-colors disabled:opacity-50"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Agent Confirmation */}
      {viewMode === 'agents' && (
        <ConfirmDialog
          open={withdrawConfirmId !== null}
          title="撤回申请"
          message={`确定要撤回代理「${agents.find(a => a.id === withdrawConfirmId)?.name ?? ''}」的申请吗？`}
          confirmText="撤回"
          variant="warning"
          onConfirm={() => {
            if (withdrawConfirmId) {
              setAgents((prev) => prev.filter((a) => a.id !== withdrawConfirmId));
            }
            setWithdrawConfirmId(null);
          }}
          onCancel={() => setWithdrawConfirmId(null)}
        />
      )}

      {/* Edit Agent Dialog */}
      {editingAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[18px] font-bold text-gray-900 dark:text-white">编辑代理</h3>
              <button onClick={() => setEditingAgent(null)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">代理名称</label>
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] focus:border-[#1a4bc4]"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">描述</label>
                <input
                  value={editForm.description}
                  onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="可选"
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] focus:border-[#1a4bc4] placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">代理类型</label>
                <select
                  value={editForm.type}
                  onChange={(e) => setEditForm(prev => ({ ...prev, type: e.target.value as AgentType }))}
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] focus:border-[#1a4bc4] bg-white dark:bg-gray-800"
                >
                  <option value="parser">简历解析</option>
                  <option value="screener">简历筛选</option>
                  <option value="matcher">岗位匹配</option>
                </select>
              </div>
              {(editForm.type === 'screener' || editForm.type === 'matcher') && (
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">关联岗位</label>
                  <select
                    value={editForm.positionId}
                    onChange={(e) => setEditForm(prev => ({ ...prev, positionId: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] focus:border-[#1a4bc4] bg-white dark:bg-gray-800"
                  >
                    <option value="">请选择岗位</option>
                    {positions.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">AI 模型配置</label>
                <select
                  value={editForm.aiModelConfigId}
                  onChange={(e) => setEditForm(prev => ({ ...prev, aiModelConfigId: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] focus:border-[#1a4bc4] bg-white dark:bg-gray-800"
                >
                  <option value="">使用默认模型</option>
                  {aiConfigs.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.provider}/{c.model_name})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingAgent(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded-lg text-[13px] font-medium text-gray-700 dark:text-gray-300 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editForm.name.trim() || editLoading}
                className="flex-1 px-4 py-2.5 bg-[#1a4bc4] hover:bg-[#0c2b7a] text-white rounded-lg text-[13px] font-medium transition-colors disabled:opacity-50"
              >
                {editLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Agent Confirmation */}
      <ConfirmDialog
        open={deleteConfirmId !== null}
        title="删除代理"
        message={`确定要删除代理「${agents.find(a => a.id === deleteConfirmId)?.name ?? ''}」吗？此操作不可撤销。`}
        confirmText="删除"
        variant="danger"
        onConfirm={handleDeleteAgent}
        onCancel={() => setDeleteConfirmId(null)}
      />

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-[13px] font-medium transition-all ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <Zap className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {toast.text}
        </div>
      )}
    </motion.div>
  );
};
