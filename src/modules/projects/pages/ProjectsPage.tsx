import {useEffect, useState} from 'react';
import {motion} from 'motion/react';
import {CalendarRange, FolderKanban, Users, X, Play, Plus, Briefcase, ChevronRight, Pencil, Trash2, ArrowRight, Edit2} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {getProjectStats, listProjects, createProject, updateProject, updateProjectStatus, deleteProject, type TimeRange} from '../api';
import {listPositionsByProject, deletePosition} from '../../positions/api';
import {type Project, type ProjectStatus} from '../types';
import {type PositionSummary} from '../../positions/types';
import {PositionDialog} from '../components/PositionDialog';

const STATUS_OPTIONS: {label: string; value: ProjectStatus}[] = [
  {label: '进行中', value: '进行中'},
  {label: '筹备中', value: '筹备中'},
  {label: '已关闭', value: '已关闭'},
];

const TIME_RANGES: {label: string; value: TimeRange | 'custom'}[] = [
  {label: '今日', value: 'today'},
  {label: '本周', value: 'week'},
  {label: '本月', value: 'month'},
  {label: '全部', value: 'all'},
  {label: '自定义', value: 'custom'},
];

export const ProjectsPage = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange | 'custom'>('week');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [stats, setStats] = useState({activeProjects: 0, candidateReserve: 0, weeklyInterviews: 0});
  const [loading, setLoading] = useState(true);
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [showPositionDialog, setShowPositionDialog] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    city: '',
    progress: 0,
    startDate: '',
    endDate: '',
    status: '筹备中' as ProjectStatus,
    manager: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [selectedProjectForPosition, setSelectedProjectForPosition] = useState<string | null>(null);
  const [projectPositions, setProjectPositions] = useState<Record<string, PositionSummary[]>>({});
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [deletingPositionId, setDeletingPositionId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [timeRange, customStartDate, customEndDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [projectsRes, statsRes] = await Promise.all([
        listProjects(),
        getProjectStats({timeRange: timeRange === 'custom' ? 'all' : timeRange, startDate: customStartDate, endDate: customEndDate}),
      ]);
      setProjects(projectsRes);
      setStats(statsRes);
    } catch (e) {
      console.error('Failed to load data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleTimeRangeChange = (value: TimeRange | 'custom') => {
    setTimeRange(value);
    if (value !== 'custom') {
      setCustomStartDate('');
      setCustomEndDate('');
    }
  };

  const handleStatusChange = async (id: string, newStatus: ProjectStatus) => {
    try {
      const updated = await updateProjectStatus(id, newStatus);
      setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (e) {
      console.error('Failed to update status:', e);
    }
  };

  const handleCreateProject = async () => {
    if (!formData.name.trim()) return;
    setSubmitting(true);
    try {
      const newProject = await createProject({...formData, createdAt: new Date().toISOString()});
      setProjects((prev) => [...prev, newProject]);
      setShowProjectDialog(false);
      setFormData({name: '', city: '', progress: 0, startDate: '', endDate: '', description: '', status: '筹备中', manager: ''});
    } catch (e) {
      console.error('Failed to create project:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewPositions = async (projectId: string) => {
    if (expandedProjectId === projectId) {
      setExpandedProjectId(null);
      return;
    }
    setExpandedProjectId(projectId);
    if (!projectPositions[projectId]) {
      const positions = await listPositionsByProject(projectId);
      setProjectPositions((prev) => ({...prev, [projectId]: positions}));
    }
  };

  const handleOpenPositionDialog = (projectId: string) => {
    setSelectedProjectForPosition(projectId);
    setShowPositionDialog(true);
  };

  const handlePositionCreated = () => {
    if (selectedProjectForPosition) {
      listPositionsByProject(selectedProjectForPosition).then((positions) => {
        setProjectPositions((prev) => ({...prev, [selectedProjectForPosition]: positions}));
      });
    }
    setShowPositionDialog(false);
    setSelectedProjectForPosition(null);
  };

  const handleEditPosition = (positionId: string) => {
    navigate(`/positions/config?positionId=${positionId}`);
  };

  const handleDeletePosition = async (positionId: string, projectId: string) => {
    try {
      await deletePosition(positionId);
      setProjectPositions((prev) => ({
        ...prev,
        [projectId]: (prev[projectId] || []).filter((p) => p.id !== positionId),
      }));
      setDeletingPositionId(null);
    } catch (e) {
      console.error('Failed to delete position:', e);
      alert('删除失败: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
  };

  const handleUpdateProject = async () => {
    if (!editingProject || !editingProject.name.trim()) return;
    setSubmitting(true);
    try {
      const updated = await updateProject(editingProject.id, {
        name: editingProject.name,
        city: editingProject.city,
        manager: editingProject.manager,
        startDate: editingProject.startDate,
        endDate: editingProject.endDate,
        description: editingProject.description,
      });
      setProjects((prev) => prev.map((p) => (p.id === editingProject.id ? updated : p)));
      setEditingProject(null);
    } catch (e) {
      console.error('Failed to update project:', e);
      alert('更新失败: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setDeletingProjectId(null);
    } catch (e) {
      console.error('Failed to delete project:', e);
      alert('删除失败: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const renderStatusBadge = (status: ProjectStatus) => {
    const styles = {
      进行中: 'bg-emerald-100 text-emerald-700',
      筹备中: 'bg-amber-100 text-amber-700',
      已关闭: 'bg-gray-100 text-gray-500',
    };
    return (
      <span className={`px-3 py-1 rounded-full text-[11px] font-medium ${styles[status]}`}>
        {status}
      </span>
    );
  };

  return (
    <motion.div
      initial={{opacity: 0, y: 10}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, y: -10}}
      className="max-w-[1500px] mx-auto w-full p-6 space-y-5"
    >
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-gray-900 dark:text-white mb-1">项目管理</h1>
          <p className="text-[13px] text-gray-500 dark:text-gray-400">集中查看项目进度、候选人储备和面试推进状态。</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowPositionDialog(true)}
            className="bg-white dark:bg-gray-800 border border-[#1a4bc4] text-[#1a4bc4] hover:bg-blue-50 px-4 py-2 rounded-lg text-[13px] font-medium transition-colors flex items-center gap-2"
          >
            <Briefcase className="w-4 h-4" />
            新建岗位
          </button>
          <button
            onClick={() => setShowProjectDialog(true)}
            className="bg-[#1a4bc4] hover:bg-[#0c2b7a] text-white px-4 py-2 rounded-lg text-[13px] font-medium transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            新建项目
          </button>
        </div>
      </div>

      {/* Time Range Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {TIME_RANGES.map((range) => (
            <button
              key={range.value}
              onClick={() => handleTimeRangeChange(range.value)}
              className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                timeRange === range.value
                  ? 'bg-[#1a4bc4] text-white'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
        {timeRange === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
            />
            <span className="text-gray-500 dark:text-gray-400">至</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
            />
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {label: '活跃项目', value: stats.activeProjects, icon: FolderKanban},
          {label: '候选人储备', value: stats.candidateReserve, icon: Users},
          {label: '本周项目描述', value: stats.weeklyInterviews, icon: CalendarRange},
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] text-gray-500 dark:text-gray-400">{item.label}</span>
                <Icon className="w-4 h-4 text-[#1a4bc4]" />
              </div>
              <div className="text-[28px] leading-none font-bold text-gray-900 dark:text-white">
                {loading ? '-' : item.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Project List */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-gray-900 dark:text-white">项目列表</h2>
          <div className="text-[12px] text-gray-500 dark:text-gray-400">按最近活跃度排序</div>
        </div>
        <div className="divide-y divide-gray-100">
          {projects.map((project) => (
            <div key={project.id}>
              <div className="px-6 py-5 grid grid-cols-1 xl:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_0.9fr_0.6fr] gap-4 items-center">
                <div>
                  <div className="font-bold text-gray-900 dark:text-white mb-1">{project.name}</div>
                  <div className="text-[12px] text-gray-500 dark:text-gray-400">{project.city}</div>
                  {project.manager && <div className="text-[12px] text-gray-400 dark:text-gray-500">负责人：{project.manager}</div>}
                  {project.startDate && <div className="text-[12px] text-gray-400 dark:text-gray-500">项目时间：{new Date(project.startDate).toLocaleDateString()} - {project.endDate ? new Date(project.endDate).toLocaleDateString() : '未设置'}</div>}
                  {project.description && <div className="text-[12px] text-gray-400 dark:text-gray-500 truncate max-w-[200px]">描述：{project.description}</div>}
                </div>
                <div>
                  <div className="text-[12px] text-gray-500 dark:text-gray-400 mb-2">进度 {project.progress}%</div>
                  <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                    <div className="bg-[#1a4bc4] h-2 rounded-full" style={{width: `${project.progress}%`}}></div>
                  </div>
                </div>
                <div className="flex justify-start xl:justify-end">{renderStatusBadge(project.status)}</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleViewPositions(project.id)}
                    className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-[12px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors flex items-center gap-1"
                  >
                    <Briefcase className="w-3 h-3" />
                    {expandedProjectId === project.id ? '收起' : '岗位'}
                    <ChevronRight className={`w-3 h-3 transition-transform ${expandedProjectId === project.id ? 'rotate-90' : ''}`} />
                  </button>
                  <button
                    onClick={() => handleEditProject(project)}
                    className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-[12px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors flex items-center gap-1"
                  >
                    <Pencil className="w-3 h-3" />
                    编辑
                  </button>
                  <button
                    onClick={() => setDeletingProjectId(project.id)}
                    className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 rounded-lg text-[12px] font-medium hover:bg-red-50 hover:text-red-500 hover:border-red-300 transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    删除
                  </button>
                  {project.status === '已关闭' ? (
                    <button
                      onClick={() => handleStatusChange(project.id, '进行中')}
                      className="px-3 py-1.5 border border-emerald-500 text-emerald-600 rounded-lg text-[12px] font-medium hover:bg-emerald-50 transition-colors flex items-center gap-1"
                    >
                      <Play className="w-3 h-3" />
                      启动
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStatusChange(project.id, '已关闭')}
                      className="px-3 py-1.5 border border-red-400 text-red-500 rounded-lg text-[12px] font-medium hover:bg-red-50 transition-colors flex items-center gap-1"
                    >
                      <X className="w-3 h-3" />
                      关闭
                    </button>
                  )}
                </div>
              </div>
              {expandedProjectId === project.id && (
                <div className="px-6 pb-5 bg-gray-50 dark:bg-gray-800">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[14px] font-medium text-gray-900 dark:text-white">岗位列表 ({projectPositions[project.id]?.length || 0})</h4>
                    <button
                      onClick={() => handleOpenPositionDialog(project.id)}
                      className="px-3 py-1.5 bg-[#1a4bc4] text-white rounded-lg text-[12px] font-medium hover:bg-[#0c2b7a] transition-colors flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      新建岗位
                    </button>
                  </div>
                  {projectPositions[project.id]?.length > 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                          <tr className="text-left text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                            <th className="px-4 py-2">岗位名称</th>
                            <th className="px-4 py-2">类型</th>
                            <th className="px-4 py-2">状态</th>
                            <th className="px-4 py-2">创建时间</th>
                            <th className="px-4 py-2">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {projectPositions[project.id].map((position) => (
                            <tr key={position.id} className="text-[12px] text-gray-700 dark:text-gray-300">
                              <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{position.name}</td>
                              <td className="px-4 py-2">{position.category}</td>
                              <td className="px-4 py-2">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                  position.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                                  position.status === 'draft' ? 'bg-amber-100 text-amber-700' :
                                  'bg-gray-100 text-gray-500'
                                }`}>
                                  {position.status === 'active' ? '已发布' : position.status === 'draft' ? '草稿' : '已归档'}
                                </span>
                              </td>
                              <td className="px-4 py-2">{position.createdAt ? new Date(position.createdAt).toLocaleDateString() : '-'}</td>
                              <td className="px-4 py-2">
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleEditPosition(position.id)}
                                    className="px-2 py-1 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded text-[10px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors flex items-center gap-1"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                    编辑
                                  </button>
                                  <button
                                    onClick={() => setDeletingPositionId(position.id)}
                                    className="px-2 py-1 border border-gray-200 dark:border-gray-700 text-red-500 rounded text-[10px] font-medium hover:bg-red-50 transition-colors flex items-center gap-1"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    删除
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-[13px] text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      暂无岗位，请点击"新建岗位"创建
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Create Project Dialog */}
      {showProjectDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{opacity: 0, scale: 0.95}}
            animate={{opacity: 1, scale: 1}}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">新建项目</h3>
              <button onClick={() => setShowProjectDialog(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">项目名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                  placeholder="请输入项目名称"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">项目描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] resize-none"
                  rows={3}
                  placeholder="请输入项目描述"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">城市</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({...formData, city: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                  placeholder="如：上海 / 北京"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">负责人</label>
                <input
                  type="text"
                  value={formData.manager}
                  onChange={(e) => setFormData({...formData, manager: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                  placeholder="请输入负责人姓名"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">项目时间</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={formData.startDate || ''}
                    onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                  />
                  <input
                    type="date"
                    value={formData.endDate || ''}
                    onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">项目描述</label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] resize-none"
                  placeholder="请输入项目描述，可粘贴TXT文件内容"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">初始状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value as ProjectStatus})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowProjectDialog(false)}
                className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-[13px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreateProject}
                disabled={submitting || !formData.name.trim()}
                className="flex-1 px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-[13px] font-medium hover:bg-[#0c2b7a] transition-colors disabled:opacity-50"
              >
                {submitting ? '创建中...' : '创建'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Create Position Dialog */}
      <PositionDialog
        isOpen={showPositionDialog}
        onClose={() => setShowPositionDialog(false)}
        onSuccess={handlePositionCreated}
        selectedProjectId={selectedProjectForPosition}
      />

      {/* Edit Project Dialog */}
      {editingProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{opacity: 0, scale: 0.95}}
            animate={{opacity: 1, scale: 1}}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">编辑项目</h3>
              <button onClick={() => setEditingProject(null)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">项目名称 *</label>
                <input
                  type="text"
                  value={editingProject.name}
                  onChange={(e) => setEditingProject({...editingProject, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">城市</label>
                <input
                  type="text"
                  value={editingProject.city}
                  onChange={(e) => setEditingProject({...editingProject, city: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">负责人</label>
                <input
                  type="text"
                  value={editingProject.manager || ''}
                  onChange={(e) => setEditingProject({...editingProject, manager: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">项目时间</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={editingProject.startDate || ''}
                    onChange={(e) => setEditingProject({...editingProject, startDate: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                  />
                  <input
                    type="date"
                    value={editingProject.endDate || ''}
                    onChange={(e) => setEditingProject({...editingProject, endDate: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">项目描述</label>
                <textarea
                  value={editingProject.description || ''}
                  onChange={(e) => setEditingProject({...editingProject, description: e.target.value})}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] resize-none"
                  placeholder="请输入项目描述，可粘贴TXT文件内容"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingProject(null)}
                className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-[13px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleUpdateProject}
                disabled={submitting || !editingProject.name.trim()}
                className="flex-1 px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-[13px] font-medium hover:bg-[#0c2b7a] transition-colors disabled:opacity-50"
              >
                {submitting ? '保存中...' : '保存'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deletingProjectId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{opacity: 0, scale: 0.95}}
            animate={{opacity: 1, scale: 1}}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-6"
          >
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">确认删除</h3>
            <p className="text-[13px] text-gray-600 dark:text-gray-300 mb-6">确定要删除该项目吗？此操作不可恢复，关联的岗位和数据可能受到影响。</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingProjectId(null)}
                className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-[13px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleDeleteProject(deletingProjectId)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-[13px] font-medium hover:bg-red-700 transition-colors"
              >
                确认删除
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Position Confirmation Dialog */}
      {deletingPositionId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{opacity: 0, scale: 0.95}}
            animate={{opacity: 1, scale: 1}}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-6"
          >
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">确认删除岗位</h3>
            <p className="text-[13px] text-gray-600 dark:text-gray-300 mb-6">确定要删除该岗位吗？此操作不可恢复。</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingPositionId(null)}
                className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-[13px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  const pos = (Object.values(projectPositions) as PositionSummary[][]).flat().find(p => p.id === deletingPositionId);
                  if (pos && expandedProjectId) {
                    handleDeletePosition(deletingPositionId, expandedProjectId);
                  }
                }}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-[13px] font-medium hover:bg-red-700 transition-colors"
              >
                确认删除
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
};
