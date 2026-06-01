import React, {useEffect, useState, useMemo} from 'react';
import {motion} from 'motion/react';
import {
  UserCheck, Users, TrendingUp, Clock, Award, Plus, Search, X,
  Edit3, Trash2, ChevronRight, Loader2, Brain, Target, BarChart3,
  Download, Building2, GraduationCap, Briefcase, MapPin, Phone, Mail,
  Calendar, Star, Shield, Sparkles, Filter,
} from 'lucide-react';
import {
  listEmployees, getEmployeeStats, createEmployee, updateEmployee, deleteEmployee,
  listPerformance, addPerformance,
  listCompetencyModels, createCompetencyModel, deriveCompetencyModel,
  updateCompetencyModel, deleteCompetencyModel,
  type EmployeeProfile, type PerformanceRecord, type CompetencyModel,
  type EmployeeStats, type CreateEmployeeInput, type CreatePerformanceInput,
} from '../api';
import {listPositions} from '../../positions/api';
import type {PositionSummary} from '../../positions/types';

// ─── Types ────────────────────────────────────────────────────────────────

type TabId = 'profiles' | 'competency' | 'stats';

const TABS: {id: TabId; label: string; icon: React.ElementType}[] = [
  {id: 'profiles', label: '员工档案', icon: Users},
  {id: 'competency', label: '胜任力模型', icon: Brain},
  {id: 'stats', label: '员工统计', icon: BarChart3},
];

const STATUS_OPTIONS: {value: string; label: string}[] = [
  {value: '', label: '全部'},
  {value: 'active', label: '在职'},
  {value: 'onboarding', label: '入职中'},
  {value: 'probation', label: '试用期'},
  {value: 'terminated', label: '已辞退'},
  {value: 'resigned', label: '已离职'},
];

const STATUS_LABELS: Record<string, string> = {
  active: '在职', onboarding: '入职中', probation: '试用期',
  terminated: '已辞退', resigned: '已离职',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  onboarding: 'bg-blue-100 text-blue-700',
  probation: 'bg-amber-100 text-amber-700',
  terminated: 'bg-red-100 text-red-700',
  resigned: 'bg-gray-100 text-gray-500',
};

// ─── StatsCard ─────────────────────────────────────────────────────────────

const StatsCard = ({icon: Icon, label, value, color}: {
  icon: React.ElementType; label: string; value: number | string; color: string;
}) => {
  const bgMap: Record<string, string> = {
    blue: 'from-blue-500/10 to-blue-500/5', emerald: 'from-emerald-500/10 to-emerald-500/5',
    purple: 'from-purple-500/10 to-purple-500/5', orange: 'from-orange-500/10 to-orange-500/5',
  };
  const iconMap: Record<string, string> = {
    blue: 'text-blue-500', emerald: 'text-emerald-500',
    purple: 'text-purple-500', orange: 'text-orange-500',
  };
  return (
    <div className={`bg-gradient-to-br ${bgMap[color] ?? bgMap.blue} rounded-xl p-4 border border-gray-100`}>
      <div className="flex items-center gap-3">
        <Icon className={`w-5 h-5 ${iconMap[color] ?? iconMap.blue}`} />
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
};

// ─── Main Page ─────────────────────────────────────────────────────────────

export const EmployeeManagementPage = () => {
  const [activeTab, setActiveTab] = useState<TabId>('profiles');
  const [loading, setLoading] = useState(true);

  // ── Employee state ──
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [stats, setStats] = useState<EmployeeStats | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeProfile | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', department: '', manager: '',
    positionId: '', projectId: '', education: '', major: '',
    status: 'active' as string, hireDate: new Date().toISOString().slice(0, 10),
  });

  // ── Performance state (for expanded employee) ──
  const [performanceRecords, setPerformanceRecords] = useState<PerformanceRecord[]>([]);
  const [perfLoading, setPerfLoading] = useState(false);
  const [showAddPerf, setShowAddPerf] = useState(false);
  const [perfForm, setPerfForm] = useState({period: '', score: '', rating: '', notes: ''});

  // ── Competency state ──
  const [models, setModels] = useState<CompetencyModel[]>([]);
  const [positions, setPositions] = useState<PositionSummary[]>([]);
  const [positionFilter, setPositionFilter] = useState('');
  const [showModelModal, setShowModelModal] = useState(false);
  const [editingModel, setEditingModel] = useState<CompetencyModel | null>(null);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  const [deriving, setDeriving] = useState(false);
  const [modelForm, setModelForm] = useState({
    name: '', positionId: '',
    dimensions: [{name: '', weight: 0, description: ''}] as {name: string; weight: number; description: string}[],
  });

  // ── Load data ──
  const loadEmployees = async () => {
    setLoading(true);
    try {
      const [empResult, statsResult] = await Promise.all([
        listEmployees({pageSize: 200}),
        getEmployeeStats(),
      ]);
      setEmployees(empResult.items);
      setStats(statsResult);
    } catch { /* mock mode handles gracefully */ }
    setLoading(false);
  };

  const loadCompetencyData = async () => {
    try {
      const [modelsResult, posResult] = await Promise.all([
        listCompetencyModels(),
        listPositions(),
      ]);
      setModels(modelsResult);
      setPositions(posResult);
    } catch { /* mock mode */ }
  };

  useEffect(() => { loadEmployees(); }, []);
  useEffect(() => { if (activeTab === 'competency') loadCompetencyData(); }, [activeTab]);

  // ── Filtered employees ──
  const filteredEmployees = useMemo(() => {
    let list = employees;
    if (statusFilter) list = list.filter(e => e.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.department ?? '').toLowerCase().includes(q) ||
        (e.manager ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [employees, statusFilter, searchQuery]);

  // ── Employee CRUD ──
  const resetForm = () => setFormData({
    name: '', email: '', phone: '', department: '', manager: '',
    positionId: '', projectId: '', education: '', major: '',
    status: 'active', hireDate: new Date().toISOString().slice(0, 10),
  });

  const openCreate = () => { resetForm(); setEditingEmployee(null); setShowCreateModal(true); };
  const openEdit = (emp: EmployeeProfile) => {
    setEditingEmployee(emp);
    setFormData({
      name: emp.name, email: emp.email, phone: emp.phone,
      department: emp.department ?? '', manager: emp.manager ?? '',
      positionId: emp.positionId ?? '', projectId: emp.projectId ?? '',
      education: emp.education ?? '', major: emp.major ?? '',
      status: emp.status, hireDate: emp.hireDate?.slice(0, 10) ?? '',
    });
    setShowCreateModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    setSubmitting(true);
    try {
      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, formData as unknown as Partial<CreateEmployeeInput>);
      } else {
        await createEmployee({...formData, candidateId: 'manual'} as unknown as CreateEmployeeInput);
      }
      setShowCreateModal(false);
      await loadEmployees();
    } catch { /* mock handles */ }
    setSubmitting(false);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try { await deleteEmployee(deletingId); setDeletingId(null); await loadEmployees(); } catch {}
  };

  // ── Expand / Performance ──
  const toggleExpand = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    setPerfLoading(true);
    try { setPerformanceRecords(await listPerformance(id)); } catch { setPerformanceRecords([]); }
    setPerfLoading(false);
  };

  const handleAddPerf = async () => {
    if (!expandedId || !perfForm.period || !perfForm.score) return;
    const score = parseFloat(perfForm.score);
    if (isNaN(score) || score < 0 || score > 100) return;
    try {
      await addPerformance(expandedId, {
        period: perfForm.period,
        score,
        rating: perfForm.rating || undefined,
        notes: perfForm.notes || undefined,
      });
      setPerfForm({period: '', score: '', rating: '', notes: ''});
      setShowAddPerf(false);
      setPerformanceRecords(await listPerformance(expandedId));
      await loadEmployees(); // refresh avgPerformance
    } catch {}
  };

  // ── Competency CRUD ──
  const resetModelForm = () => setModelForm({
    name: '', positionId: positionFilter || '',
    dimensions: [{name: '', weight: 0, description: ''}],
  });

  const openModelCreate = () => { resetModelForm(); setEditingModel(null); setShowModelModal(true); };
  const openModelEdit = (m: CompetencyModel) => {
    setEditingModel(m);
    setModelForm({
      name: m.name, positionId: m.positionId,
      dimensions: m.dimensions.length > 0 ? m.dimensions.map(d => ({...d})) : [{name: '', weight: 0, description: ''}],
    });
    setShowModelModal(true);
  };

  const handleModelSave = async () => {
    if (!modelForm.name.trim() || !modelForm.positionId) return;
    setSubmitting(true);
    try {
      if (editingModel) {
        await updateCompetencyModel(editingModel.id, {
          name: modelForm.name,
          dimensions: modelForm.dimensions.filter(d => d.name.trim()),
        });
      } else {
        await createCompetencyModel({
          positionId: modelForm.positionId,
          name: modelForm.name,
          dimensions: modelForm.dimensions.filter(d => d.name.trim()),
        });
      }
      setShowModelModal(false);
      await loadCompetencyData();
    } catch {}
    setSubmitting(false);
  };

  const handleDerive = async () => {
    if (!positionFilter) return;
    setDeriving(true);
    try {
      await deriveCompetencyModel(positionFilter);
      await loadCompetencyData();
    } catch {}
    setDeriving(false);
  };

  const handleModelDelete = async () => {
    if (!deletingModelId) return;
    try { await deleteCompetencyModel(deletingModelId); setDeletingModelId(null); await loadCompetencyData(); } catch {}
  };

  // ── Tab Content ──
  const filteredModels = positionFilter
    ? models.filter(m => m.positionId === positionFilter)
    : models;

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="max-w-[1500px] mx-auto w-full p-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="h-7 w-44 rounded-lg bg-gray-100 animate-pulse" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-28 rounded-xl bg-gray-100 animate-pulse" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, y: -10}}
      className="max-w-[1500px] mx-auto w-full p-6 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">员工档案</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">管理在职员工信息、绩效记录和胜任力模型</p>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
                activeTab === tab.id ? 'bg-white text-[#1a4bc4] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ── */}
      <motion.div key={activeTab} initial={{opacity: 0, y: 8}} animate={{opacity: 1, y: 0}} transition={{duration: 0.2}}>

        {/* ═══════════════ Tab 1: Employee Profiles ═══════════════ */}
        {activeTab === 'profiles' && (
          <div className="space-y-5">
            {/* Stats */}
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatsCard icon={Users} label="在职员工" value={stats.totalActive} color="blue" />
                <StatsCard icon={TrendingUp} label="平均绩效" value={stats.avgPerformance.toFixed(1)} color="emerald" />
                <StatsCard icon={Clock} label="平均留存(天)" value={stats.avgRetentionDays} color="purple" />
                <StatsCard icon={Award} label="培训均分" value="-" color="orange" />
              </div>
            )}

            {/* Filters + Actions */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1.5 flex-wrap">
                {STATUS_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => setStatusFilter(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                      statusFilter === opt.value ? 'bg-[#1a4bc4] text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="relative flex-1 max-w-xs ml-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" placeholder="搜索姓名、邮箱、部门..."
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400" />
              </div>
              <button onClick={openCreate}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-[13px] font-medium hover:bg-[#0c2b7a] transition-colors">
                <Plus className="w-4 h-4" /> 添加员工
              </button>
            </div>

            {/* Table */}
            {filteredEmployees.length === 0 ? (
              <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
                <UserCheck className="w-12 h-12 mx-auto mb-4 opacity-40" />
                <p className="text-sm font-medium mb-1">暂无员工记录</p>
                <p className="text-xs text-gray-400 mb-4">通过审批录用或手动添加来创建员工档案</p>
                <button onClick={openCreate} className="px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm hover:bg-[#153da0]">
                  添加第一位员工
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr className="text-left text-[12px] text-gray-500 font-medium">
                      <th className="px-4 py-3 w-8"></th>
                      <th className="px-4 py-3">姓名</th>
                      <th className="px-4 py-3">邮箱</th>
                      <th className="px-4 py-3">部门</th>
                      <th className="px-4 py-3">状态</th>
                      <th className="px-4 py-3">面试评分</th>
                      <th className="px-4 py-3">绩效均分</th>
                      <th className="px-4 py-3">留存(天)</th>
                      <th className="px-4 py-3 w-24">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredEmployees.map(emp => (
                      <React.Fragment key={emp.id}>
                        <tr className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <button onClick={() => toggleExpand(emp.id)}
                              className="p-1 hover:bg-gray-200 rounded transition-colors">
                              <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expandedId === emp.id ? 'rotate-90' : ''}`} />
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium text-gray-900">{emp.name}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">{emp.email || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{emp.department || '-'}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[emp.status] ?? 'bg-gray-100 text-gray-600'}`}>
                              {STATUS_LABELS[emp.status] ?? emp.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {emp.interviewScore != null ? (
                              <span className={`font-medium ${emp.interviewScore >= 80 ? 'text-emerald-600' : emp.interviewScore >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                                {emp.interviewScore}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {emp.avgPerformance != null ? (
                              <span className={`font-medium ${emp.avgPerformance >= 80 ? 'text-emerald-600' : emp.avgPerformance >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                                {emp.avgPerformance.toFixed(0)}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">{emp.retentionDays ?? '-'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button onClick={() => openEdit(emp)} className="p-1.5 text-gray-400 hover:text-[#1a4bc4] hover:bg-blue-50 rounded transition-colors">
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setDeletingId(emp.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Detail Row */}
                        {expandedId === emp.id && (
                          <tr>
                            <td colSpan={9} className="px-6 pb-5 bg-gray-50">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4">
                                <DetailField icon={Phone} label="电话" value={emp.phone} />
                                <DetailField icon={Building2} label="主管" value={emp.manager} />
                                <DetailField icon={GraduationCap} label="学历" value={emp.education} />
                                <DetailField icon={BookOpen} label="专业" value={emp.major} />
                                <DetailField icon={Calendar} label="入职日期" value={emp.hireDate?.slice(0, 10)} />
                                <DetailField icon={MapPin} label="通勤距离" value={emp.commuteDistance != null ? `${emp.commuteDistance}km` : undefined} />
                                <DetailField icon={Star} label="面试等级" value={emp.interviewGrade} />
                                <DetailField icon={Award} label="简历等级" value={emp.resumeGrade} />
                              </div>

                              {/* Skills & Certifications */}
                              {(emp.skills?.length || emp.certifications?.length || emp.interviewWeaknesses?.length) ? (
                                <div className="flex flex-wrap gap-2 mb-4">
                                  {emp.skills?.map((s, i) => (
                                    <span key={`sk-${i}`} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                                      {s.name} {s.level ? `L${s.level}` : ''}
                                    </span>
                                  ))}
                                  {emp.certifications?.map((c, i) => (
                                    <span key={`cert-${i}`} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-xs font-medium">
                                      {c.name}
                                    </span>
                                  ))}
                                  {emp.interviewWeaknesses?.map((w, i) => (
                                    <span key={`w-${i}`} className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs">
                                      {w}
                                    </span>
                                  ))}
                                </div>
                              ) : null}

                              {/* Performance Records */}
                              <div className="mt-4 border-t border-gray-200 pt-4">
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-sm font-semibold text-gray-700">绩效记录</h4>
                                  <button onClick={() => setShowAddPerf(!showAddPerf)}
                                    className="flex items-center gap-1 text-xs text-[#1a4bc4] hover:underline">
                                    <Plus className="w-3 h-3" /> 添加绩效
                                  </button>
                                </div>

                                {showAddPerf && (
                                  <div className="bg-white border border-gray-200 rounded-lg p-4 mb-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div>
                                      <label className="block text-[12px] text-gray-500 mb-1">考核周期 *</label>
                                      <input value={perfForm.period} onChange={e => setPerfForm({...perfForm, period: e.target.value})}
                                        placeholder="2026-Q1" className="w-full px-3 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]" />
                                    </div>
                                    <div>
                                      <label className="block text-[12px] text-gray-500 mb-1">分数 (0-100) *</label>
                                      <input type="number" value={perfForm.score} onChange={e => setPerfForm({...perfForm, score: e.target.value})}
                                        min={0} max={100} className="w-full px-3 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]" />
                                    </div>
                                    <div>
                                      <label className="block text-[12px] text-gray-500 mb-1">评级</label>
                                      <select value={perfForm.rating} onChange={e => setPerfForm({...perfForm, rating: e.target.value})}
                                        className="w-full px-3 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]">
                                        <option value="">-</option>
                                        {['S','A','B','C','D'].map(g => <option key={g} value={g}>{g}</option>)}
                                      </select>
                                    </div>
                                    <div className="flex items-end gap-2">
                                      <button onClick={handleAddPerf}
                                        className="px-4 py-1.5 bg-[#1a4bc4] text-white rounded text-sm font-medium hover:bg-[#0c2b7a]">
                                        保存
                                      </button>
                                      <button onClick={() => setShowAddPerf(false)}
                                        className="px-3 py-1.5 border border-gray-200 rounded text-sm text-gray-600 hover:bg-gray-50">
                                        取消
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {perfLoading ? (
                                  <div className="text-center py-4 text-sm text-gray-400">加载中...</div>
                                ) : performanceRecords.length === 0 ? (
                                  <div className="text-center py-4 text-sm text-gray-400">暂无绩效记录</div>
                                ) : (
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="text-left text-[12px] text-gray-400 border-b border-gray-100">
                                        <th className="pb-2 font-medium">考核周期</th>
                                        <th className="pb-2 font-medium">分数</th>
                                        <th className="pb-2 font-medium">评级</th>
                                        <th className="pb-2 font-medium">备注</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {performanceRecords.map(rec => (
                                        <tr key={rec.id} className="border-b border-gray-50">
                                          <td className="py-2 text-gray-700">{rec.period}</td>
                                          <td className="py-2">
                                            <span className={`font-medium ${rec.score >= 80 ? 'text-emerald-600' : rec.score >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                                              {rec.score}
                                            </span>
                                          </td>
                                          <td className="py-2 text-gray-600">{rec.rating || '-'}</td>
                                          <td className="py-2 text-gray-500 text-xs">{rec.notes || '-'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ Tab 2: Competency Models ═══════════════ */}
        {activeTab === 'competency' && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <select value={positionFilter} onChange={e => setPositionFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]">
                  <option value="">全部岗位</option>
                  {positions.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <button onClick={openModelCreate}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-[13px] font-medium hover:bg-[#0c2b7a] transition-colors">
                <Plus className="w-4 h-4" /> 新建模型
              </button>
              {positionFilter && (
                <button onClick={handleDerive} disabled={deriving}
                  className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg text-[13px] font-medium hover:bg-purple-700 transition-colors disabled:opacity-50">
                  {deriving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  AI 推导
                </button>
              )}
            </div>

            {filteredModels.length === 0 ? (
              <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
                <Brain className="w-12 h-12 mx-auto mb-4 opacity-40" />
                <p className="text-sm font-medium mb-1">暂无胜任力模型</p>
                <p className="text-xs text-gray-400 mb-4">创建或通过 AI 从优秀员工推导岗位胜任力模型</p>
                <button onClick={openModelCreate} className="px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm hover:bg-[#153da0]">
                  创建第一个模型
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredModels.map(model => {
                  const posName = positions.find(p => p.id === model.positionId)?.name ?? model.positionName ?? model.positionId;
                  return (
                    <div key={model.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900">{model.name}</h4>
                          <p className="text-[12px] text-gray-500 mt-0.5">{posName}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                            model.sourceType === 'ai_derived' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {model.sourceType === 'ai_derived' ? 'AI推导' : '手动'}
                          </span>
                          <span className="text-[11px] text-gray-400 ml-1">v{model.version}</span>
                        </div>
                      </div>

                      {/* Dimensions */}
                      <div className="space-y-1.5 mb-4">
                        {model.dimensions.map((dim, i) => (
                          <div key={i} className="flex items-center justify-between text-[12px]">
                            <span className="text-gray-600">{dim.name}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-[#1a4bc4] rounded-full" style={{width: `${dim.weight}%`}} />
                              </div>
                              <span className="text-gray-400 w-8 text-right">{dim.weight}%</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Derived metadata */}
                      {model.derivedFrom && model.derivedFrom.sample_size != null && model.derivedFrom.sample_size > 0 && (
                        <div className="text-[11px] text-gray-400 mb-3">
                          基于 {model.derivedFrom.sample_size} 名优秀员工推导
                          {model.derivedFrom.common_weaknesses?.length ? (
                            <span> · 共性弱项: {model.derivedFrom.common_weaknesses.slice(0, 3).map(w => w.name).join(', ')}</span>
                          ) : null}
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                        <button onClick={() => openModelEdit(model)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 hover:text-[#1a4bc4] hover:bg-blue-50 rounded transition-colors">
                          <Edit3 className="w-3 h-3" /> 编辑
                        </button>
                        <button onClick={() => setDeletingModelId(model.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                          <Trash2 className="w-3 h-3" /> 删除
                        </button>
                        <label className="flex items-center gap-1.5 ml-auto text-xs text-gray-500 cursor-pointer">
                          <input type="checkbox" checked={model.isActive} onChange={() => updateCompetencyModel(model.id, {isActive: !model.isActive}).then(loadCompetencyData)}
                            className="rounded border-gray-300 text-[#1a4bc4] focus:ring-[#1a4bc4]" />
                          启用
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ Tab 3: Stats ═══════════════ */}
        {activeTab === 'stats' && stats && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatsCard icon={Users} label="在职员工" value={stats.totalActive} color="blue" />
              <StatsCard icon={TrendingUp} label="平均绩效" value={stats.avgPerformance.toFixed(1)} color="emerald" />
              <StatsCard icon={Clock} label="平均留存(天)" value={stats.avgRetentionDays} color="purple" />
            </div>

            {/* Status Breakdown */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">状态分布</h3>
              <div className="space-y-3">
                {Object.entries(stats.statusBreakdown).map(([status, count]) => {
                  const total = Object.values(stats.statusBreakdown).reduce((a, b) => (a as number) + (b as number), 0) as number;
                  const pct = total > 0 ? Math.round((count as number / total) * 100) : 0;
                  return (
                    <div key={status} className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium w-16 text-center ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[status] ?? status}
                      </span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#1a4bc4] rounded-full transition-all" style={{width: `${pct}%`}} />
                      </div>
                      <span className="text-sm text-gray-500 w-12 text-right">{String(count)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Grade Distribution */}
            {Object.keys(stats.gradeDistribution).length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">面试等级分布</h3>
                <div className="space-y-3">
                  {Object.entries(stats.gradeDistribution).map(([grade, count]) => {
                    const allCounts = Object.values(stats.gradeDistribution).reduce((a, b) => (a as number) + (b as number), 0) as number;
                    const pct = allCounts > 0 ? Math.round((count as number / allCounts) * 100) : 0;
                    return (
                      <div key={grade} className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-700 w-20">{grade}</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{width: `${pct}%`}} />
                        </div>
                        <span className="text-sm text-gray-500 w-12 text-right">{String(count)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

      </motion.div>

      {/* ══════════════════════════ MODALS ══════════════════════════ */}

      {/* ── Create/Edit Employee Modal ── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
          <motion.div initial={{opacity: 0, scale: 0.95}} animate={{opacity: 1, scale: 1}}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">{editingEmployee ? '编辑员工' : '添加员工'}</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1">姓名 *</label>
                  <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]" placeholder="员工姓名" />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1">邮箱</label>
                  <input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]" placeholder="email@example.com" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1">电话</label>
                  <input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]" placeholder="手机号" />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1">状态</label>
                  <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]">
                    {STATUS_OPTIONS.filter(o => o.value).map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1">部门</label>
                  <input value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]" placeholder="部门名称" />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1">主管</label>
                  <input value={formData.manager} onChange={e => setFormData({...formData, manager: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]" placeholder="主管姓名" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1">学历</label>
                  <input value={formData.education} onChange={e => setFormData({...formData, education: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]" placeholder="如：本科" />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1">专业</label>
                  <input value={formData.major} onChange={e => setFormData({...formData, major: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]" placeholder="专业名称" />
                </div>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1">入职日期</label>
                <input type="date" value={formData.hireDate} onChange={e => setFormData({...formData, hireDate: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-[13px] font-medium hover:bg-gray-50 transition-colors">
                取消
              </button>
              <button onClick={handleSave} disabled={submitting || !formData.name.trim()}
                className="flex-1 px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-[13px] font-medium hover:bg-[#0c2b7a] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingEmployee ? '保存' : '创建'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Delete Employee Confirm ── */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div initial={{opacity: 0, scale: 0.95}} animate={{opacity: 1, scale: 1}}
            className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">确认删除</h3>
            <p className="text-[13px] text-gray-600 mb-6">确定要删除该员工档案吗？此操作不可恢复。</p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingId(null)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-[13px] font-medium hover:bg-gray-50 transition-colors">
                取消
              </button>
              <button onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-[13px] font-medium hover:bg-red-700 transition-colors">
                确认删除
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Create/Edit Competency Model Modal ── */}
      {showModelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowModelModal(false)}>
          <motion.div initial={{opacity: 0, scale: 0.95}} animate={{opacity: 1, scale: 1}}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">{editingModel ? '编辑模型' : '新建胜任力模型'}</h3>
              <button onClick={() => setShowModelModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1">模型名称 *</label>
                <input value={modelForm.name} onChange={e => setModelForm({...modelForm, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]" placeholder="如：高级前端开发胜任力模型" />
              </div>
              {!editingModel && (
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1">关联岗位 *</label>
                  <select value={modelForm.positionId} onChange={e => setModelForm({...modelForm, positionId: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]">
                    <option value="">选择岗位...</option>
                    {positions.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {/* Dimensions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[13px] font-medium text-gray-700">胜任力维度</label>
                  <button onClick={() => setModelForm({
                    ...modelForm,
                    dimensions: [...modelForm.dimensions, {name: '', weight: 0, description: ''}],
                  })}
                    className="text-xs text-[#1a4bc4] hover:underline flex items-center gap-1">
                    <Plus className="w-3 h-3" /> 添加维度
                  </button>
                </div>
                <div className="space-y-2">
                  {modelForm.dimensions.map((dim, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={dim.name} onChange={e => {
                        const next = [...modelForm.dimensions];
                        next[i] = {...next[i], name: e.target.value};
                        setModelForm({...modelForm, dimensions: next});
                      }} placeholder="维度名" className="flex-1 px-3 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]" />
                      <input type="number" value={dim.weight || ''} onChange={e => {
                        const next = [...modelForm.dimensions];
                        next[i] = {...next[i], weight: Number(e.target.value)};
                        setModelForm({...modelForm, dimensions: next});
                      }} placeholder="权重%" className="w-16 px-3 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]" />
                      <input value={dim.description} onChange={e => {
                        const next = [...modelForm.dimensions];
                        next[i] = {...next[i], description: e.target.value};
                        setModelForm({...modelForm, dimensions: next});
                      }} placeholder="描述" className="flex-1 px-3 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]" />
                      {modelForm.dimensions.length > 1 && (
                        <button onClick={() => {
                          setModelForm({...modelForm, dimensions: modelForm.dimensions.filter((_, idx) => idx !== i)});
                        }} className="text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModelModal(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-[13px] font-medium hover:bg-gray-50">
                取消
              </button>
              <button onClick={handleModelSave} disabled={submitting || !modelForm.name.trim() || !modelForm.positionId}
                className="flex-1 px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-[13px] font-medium hover:bg-[#0c2b7a] disabled:opacity-50 flex items-center justify-center gap-2">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingModel ? '保存' : '创建'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Delete Model Confirm ── */}
      {deletingModelId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div initial={{opacity: 0, scale: 0.95}} animate={{opacity: 1, scale: 1}}
            className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">确认删除</h3>
            <p className="text-[13px] text-gray-600 mb-6">确定要删除该胜任力模型吗？</p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingModelId(null)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-[13px] font-medium hover:bg-gray-50">
                取消
              </button>
              <button onClick={handleModelDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-[13px] font-medium hover:bg-red-700">
                确认删除
              </button>
            </div>
          </motion.div>
        </div>
      )}

    </motion.div>
  );
};

// ─── DetailField helper ────────────────────────────────────────────────────

const BookOpen = ({className}: {className?: string}) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </svg>
);

const DetailField = ({icon: Icon, label, value}: {
  icon: React.ElementType; label: string; value?: string | null;
}) => (
  <div className="flex items-center gap-2 text-sm">
    <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
    <span className="text-gray-400">{label}:</span>
    <span className="text-gray-700 font-medium">{value || '-'}</span>
  </div>
);
