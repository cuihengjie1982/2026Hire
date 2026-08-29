import React, {useEffect, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {motion} from 'motion/react';
import {
  BookOpen, Users, TrendingUp, BarChart3, Plus, Clock, Star,
  CheckCircle, XCircle, PlayCircle, ChevronRight, AlertTriangle,
  Target, Award, ArrowUpRight, Download, Loader2, Layers, Edit3, Trash2, MapPin,
  Upload, Search, X, Copy, Link2, ExternalLink, Sparkles, FileText, Settings2,
} from 'lucide-react';
import {useToast} from '../../../shared/components/ToastProvider';
import {NumericScoreInput} from '../../../shared/components/NumericScoreInput';
import {getAuthToken} from '../../../shared/lib/runtime';
import {buildEdgeFunctionUrl} from '../../../shared/lib/apiClient';
import {
  listCourses, listEnrollments, createCourse, updateCourse, deleteCourse, updateEnrollment, submitAssessment,
  getTrainingStats, getWeaknessAnalysis, getTrainingEffectiveness, exportEnrollmentsCSV,
  recommendCourses, createEnrollment,
  listPaths, createPath, updatePath, deletePath,
  getPathEnrollments, enrollCandidateInPath, updatePathEnrollment, deletePathEnrollment,
  uploadMaterial, batchEnroll,
  createTrainingShareLink, buildTrainingSharePath,
  type TrainingCourse, type TrainingEnrollment, type TrainingStats,
  type WeaknessAnalysis, type TrainingEffectiveness,
  type CourseRecommendation,
  type PathEnrollment, type BatchEnrollResult, type MaterialUploadResult,
} from '../api';
import {
  getActionCaptionJobKey,
  listActionCaptionJobs,
  startActionCaptionJob,
  subscribeActionCaptionJobs,
  type ActionCaptionJob,
} from '../actionCaptionJobs';
import {CATEGORY_COLORS, TRAINING_CATEGORIES} from '../courseCategories';
import {
  resolveVideoPolarity,
  VIDEO_POLARITY_LABELS,
  VIDEO_REVIEW_STATUS_LABELS,
  VIDEO_SEVERITY_LABELS,
} from '../videoTaxonomy';
import type {LearningPath, VideoPolarity, VideoReviewStatus, VideoSeverity, VideoTaxonomy} from '../types';

type TabId = 'courses' | 'enrollments' | 'analysis' | 'effectiveness' | 'paths';

const TABS: {id: TabId; label: string; icon: React.ElementType}[] = [
  {id: 'courses', label: '课程管理', icon: BookOpen},
  {id: 'paths', label: '学习路径', icon: Layers},
  {id: 'enrollments', label: '培训记录', icon: Users},
  {id: 'analysis', label: '薄弱分析', icon: Target},
  {id: 'effectiveness', label: '效果统计', icon: TrendingUp},
];

const STATUS_LABELS: Record<string, {label: string; color: string}> = {
  enrolled: {label: '已报名', color: 'bg-surface-muted text-fg-secondary'},
  in_progress: {label: '学习中', color: 'bg-blue-100 text-blue-600'},
  completed: {label: '已完成', color: 'bg-emerald-100 text-emerald-600'},
  failed: {label: '未通过', color: 'bg-red-100 text-red-600'},
};

const DIFFICULTY_LABELS: Record<string, {label: string; color: string}> = {
  '初级': {label: '初级', color: 'bg-green-100 text-green-700'},
  '中级': {label: '中级', color: 'bg-yellow-100 text-yellow-700'},
  '高级': {label: '高级', color: 'bg-red-100 text-red-700'},
};

export const TrainingAcademyPage = () => {
  const [activeTab, setActiveTab] = useState<TabId>('courses');
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [enrollmentList, setEnrollmentList] = useState<TrainingEnrollment[]>([]);
  const [weaknessData, setWeaknessData] = useState<WeaknessAnalysis | null>(null);
  const [effectiveness, setEffectiveness] = useState<TrainingEffectiveness | null>(null);
  const [paths, setPaths] = useState<LearningPath[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateCourse, setShowCreateCourse] = useState(false);
  const [editingCourse, setEditingCourse] = useState<TrainingCourse | null>(null);
  const [showCreatePath, setShowCreatePath] = useState(false);
  const [editingPath, setEditingPath] = useState<LearningPath | null>(null);
  const [enrollmentPathId, setEnrollmentPathId] = useState<string | null>(null);
  const [showBatchEnroll, setShowBatchEnroll] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, c, e, w, eff, p] = await Promise.all([
        getTrainingStats(),
        listCourses(),
        listEnrollments(),
        getWeaknessAnalysis(),
        getTrainingEffectiveness(),
        listPaths(),
      ]);
      setStats(s);
      setCourses(c.items);
      setEnrollmentList(e.items);
      setWeaknessData(w);
      setEffectiveness(eff);
      setPaths(p.items);
    } catch (err) {
      console.error('Failed to load training data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCourse = async (input: {
    title: string; category: string; difficulty: string; description: string;
    durationMinutes?: number; content?: {sectionTitle: string; contentType: string; text?: string; contentUrl?: string}[];
    materials?: {title: string; type: string; url?: string}[];
    assessmentConfig?: {type: string; passingScore: number};
    competencyDimension?: string;
  }) => {
    try {
      await createCourse({
        ...input,
        difficulty: input.difficulty as '初级' | '中级' | '高级',
        content: input.content?.map(s => ({...s, contentType: s.contentType as 'text' | 'video' | 'link'})),
        materials: input.materials?.map(m => ({...m, type: m.type as 'pdf' | 'video' | 'article' | 'exercise'})),
      } as Parameters<typeof createCourse>[0]);
      const c = await listCourses();
      setCourses(c.items);
      setShowCreateCourse(false);
    } catch (err) {
      console.error('Failed to create course:', err);
    }
  };

  const handleUpdateCourse = async (input: {
    title: string; category: string; difficulty: string; description: string;
    durationMinutes?: number; content?: {sectionTitle: string; contentType: string; text?: string; contentUrl?: string}[];
    materials?: {title: string; type: string; url?: string}[];
    assessmentConfig?: {type: string; passingScore: number};
    competencyDimension?: string;
  }) => {
    if (!editingCourse) return;
    try {
      await updateCourse(editingCourse.id, input as Parameters<typeof updateCourse>[1]);
      const c = await listCourses();
      setCourses(c.items);
      setEditingCourse(null);
    } catch (err) {
      console.error('Failed to update course:', err);
    }
  };

  const handleDeleteCourse = async (id: string) => {
    if (!confirm('确定要删除该课程吗？此操作不可撤销。')) return;
    try {
      await deleteCourse(id);
      const c = await listCourses();
      setCourses(c.items);
    } catch (err) {
      console.error('Failed to delete course:', err);
    }
  };

  const handleScoreSubmit = async (enrollmentId: string, score: number) => {
    try {
      await submitAssessment(enrollmentId, {score});
      const e = await listEnrollments();
      setEnrollmentList(e.items);
      const s = await getTrainingStats();
      setStats(s);
    } catch (err) {
      console.error('Failed to submit assessment:', err);
    }
  };

  const handleCreatePath = async (input: {
    title: string; description: string; category: string; level: string;
    isCertified: boolean; courseIds: string[];
  }) => {
    try {
      await createPath(input);
      const p = await listPaths();
      setPaths(p.items);
      setShowCreatePath(false);
    } catch (err) {
      console.error('Failed to create path:', err);
    }
  };

  const handleUpdatePath = async (id: string, updates: {
    title?: string; description?: string; category?: string; level?: string;
    isCertified?: boolean; isActive?: boolean; courseIds?: string[];
  }) => {
    try {
      await updatePath(id, updates);
      const p = await listPaths();
      setPaths(p.items);
      setEditingPath(null);
    } catch (err) {
      console.error('Failed to update path:', err);
    }
  };

  const handleDeletePath = async (id: string) => {
    if (!confirm('确定要删除这条学习路径吗？此操作不可撤销。')) return;
    try {
      await deletePath(id);
      setPaths(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error('Failed to delete path:', err);
    }
  };

  if (loading) {
    return (
      <div className="max-w-[1500px] mx-auto w-full p-6">
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-4">
          <div className="h-7 w-44 rounded-lg bg-surface-muted animate-pulse" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-28 rounded-xl bg-surface-muted animate-pulse" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1500px] mx-auto w-full p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-[#1a4bc4] to-[#6366F1] rounded-xl flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-fg">培训学堂</h1>
            <p className="text-sm text-fg-muted">面试薄弱点分析 → 针对性培训 → 提升通过率</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard icon={BookOpen} label="活跃课程" value={stats.totalCourses} color="blue" />
          <StatsCard icon={PlayCircle} label="在训学员" value={stats.activeEnrollments} color="purple" />
          <StatsCard icon={CheckCircle} label="已完成" value={stats.completedEnrollments} color="emerald" />
          <StatsCard icon={TrendingUp} label="完成率" value={`${stats.completionRate}%`} color="orange" />
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-surface-muted rounded-xl p-1 overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all min-w-[112px] flex-1 justify-center whitespace-nowrap ${
                isActive ? 'bg-surface text-[#1a4bc4] shadow-sm' : 'text-fg-muted hover:text-fg-secondary'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <motion.div key={activeTab} initial={{opacity: 0, y: 8}} animate={{opacity: 1, y: 0}} transition={{duration: 0.2}}>
        {activeTab === 'courses' && (
          <CoursesTab
            courses={courses}
            onAdd={() => setShowCreateCourse(true)}
            onBatchEnroll={() => setShowBatchEnroll(true)}
            onEdit={(course) => setEditingCourse(course)}
            onDelete={handleDeleteCourse}
          />
        )}
        {activeTab === 'enrollments' && (
          <EnrollmentsTab
            enrollments={enrollmentList}
            onScore={handleScoreSubmit}
            onExport={() => exportEnrollmentsCSV()}
          />
        )}
        {activeTab === 'analysis' && weaknessData && (
          <AnalysisTab data={weaknessData} courses={courses} />
        )}
        {activeTab === 'effectiveness' && effectiveness && (
          <EffectivenessTab data={effectiveness} />
        )}
        {activeTab === 'paths' && (
          <PathsTab
            paths={paths}
            courses={courses}
            onAdd={() => setShowCreatePath(true)}
            onEdit={(path) => setEditingPath(path)}
            onDelete={handleDeletePath}
            onEnrollmentClick={(pathId) => setEnrollmentPathId(pathId)}
            onBatchEnroll={() => setShowBatchEnroll(true)}
          />
        )}
      </motion.div>

      {/* Create Course Modal */}
      {showCreateCourse && (
        <CreateCourseModal
          onClose={() => setShowCreateCourse(false)}
          onSubmit={handleCreateCourse}
        />
      )}

      {/* Edit Course Modal */}
      {editingCourse && (
        <CreateCourseModal
          initial={editingCourse}
          onClose={() => setEditingCourse(null)}
          onSubmit={(input) => handleUpdateCourse(input)}
        />
      )}

      {/* Create Path Modal */}
      {showCreatePath && (
        <PathFormModal
          courses={courses}
          onClose={() => setShowCreatePath(false)}
          onSubmit={handleCreatePath}
        />
      )}

      {/* Edit Path Modal */}
      {editingPath && (
        <PathFormModal
          courses={courses}
          initial={editingPath}
          onClose={() => setEditingPath(null)}
          onSubmit={(input) => handleUpdatePath(editingPath.id, input)}
        />
      )}

      {/* Path Enrollment Modal */}
      {enrollmentPathId && (
        <PathEnrollmentModal
          pathId={enrollmentPathId}
          onClose={() => { setEnrollmentPathId(null); loadData(); }}
        />
      )}

      {/* Batch Enroll Modal */}
      {showBatchEnroll && (
        <BatchEnrollModal
          courses={courses}
          paths={paths}
          onClose={() => setShowBatchEnroll(false)}
          onDone={() => { setShowBatchEnroll(false); loadData(); }}
        />
      )}
    </div>
  );
};

// ─── Sub-components ──────────────────────────────────────────────────────

const StatsCard = ({icon: Icon, label, value, color}: {
  icon: React.ElementType; label: string; value: number | string; color: string;
}) => {
  const bgMap: Record<string, string> = {
    blue: 'from-blue-500/10 to-blue-500/5',
    purple: 'from-purple-500/10 to-purple-500/5',
    emerald: 'from-emerald-500/10 to-emerald-500/5',
    orange: 'from-orange-500/10 to-orange-500/5',
  };
  const iconMap: Record<string, string> = {
    blue: 'text-blue-500', purple: 'text-purple-500',
    emerald: 'text-emerald-500', orange: 'text-orange-500',
  };

  return (
    <div className={`bg-gradient-to-br ${bgMap[color]} rounded-xl p-4 border border-border-subtle`}>
      <div className="flex items-center gap-3">
        <Icon className={`w-5 h-5 ${iconMap[color]}`} />
        <span className="text-sm text-fg-muted">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-fg">{value}</div>
    </div>
  );
};

const CoursesTab = ({courses, onAdd, onBatchEnroll, onEdit, onDelete}: {
  courses: TrainingCourse[]; onAdd: () => void; onBatchEnroll: () => void;
  onEdit: (course: TrainingCourse) => void; onDelete: (id: string) => void;
}) => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');
  const filtered = filter ? courses.filter(c => c.category === filter) : courses;
  const categories = [...new Set(courses.map(c => c.category))];
  const hasPlayableVideo = (course: TrainingCourse) => course.content.some(
    (s: {contentType: string; contentUrl?: string}) => s.contentType === 'video' && Boolean(s.contentUrl),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button onClick={() => setFilter('')} className={`px-3 py-1.5 rounded-lg text-sm ${!filter ? 'bg-[#1a4bc4] text-white' : 'bg-surface-muted text-fg-secondary hover:bg-surface-muted'}`}>
            全部
          </button>
          {categories.map(cat => (
            <button key={cat} onClick={() => setFilter(cat)} className={`px-3 py-1.5 rounded-lg text-sm ${filter === cat ? 'bg-[#1a4bc4] text-white' : 'bg-surface-muted text-fg-secondary hover:bg-surface-muted'}`}>
              {cat}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {courses.length > 0 && (
            <button onClick={onBatchEnroll} className="flex items-center gap-2 px-4 py-2 bg-surface border border-border text-fg-secondary rounded-lg text-sm hover:bg-surface-muted transition-colors">
              <Users className="w-4 h-4" /> 批量报名
            </button>
          )}
          <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm hover:bg-[#153da0] transition-colors">
            <Plus className="w-4 h-4" /> 新建课程
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(course => (
          <div
            key={course.id}
            className="bg-surface rounded-xl border border-border p-5 hover:shadow-md transition-shadow group relative cursor-pointer"
            onClick={() => hasPlayableVideo(course) && navigate(`/training/preview?courseId=${course.id}`)}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-fg text-sm">{course.title}</h3>
                <p className="text-xs text-fg-muted mt-1 line-clamp-2">{course.description}</p>
              </div>
              {hasPlayableVideo(course) && (
                <span className="shrink-0 ml-2 px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded text-[10px] font-medium flex items-center gap-1">
                  <PlayCircle className="w-3 h-3" /> 含视频
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mb-3">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[course.category] ?? 'bg-surface-muted text-fg-secondary'}`}>
                {course.category}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${(DIFFICULTY_LABELS[course.difficulty]?.color ?? 'bg-surface-muted text-fg-secondary')}`}>
                {DIFFICULTY_LABELS[course.difficulty]?.label ?? course.difficulty}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-fg-faint">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{course.durationMinutes} 分钟</span>
              <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{course.content.length} 章节</span>
              <span className="flex items-center gap-1"><Star className="w-3 h-3" />及格 {course.assessmentConfig.passingScore}分</span>
            </div>
            {/* Hover actions */}
            <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border-subtle opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={(e) => { e.stopPropagation(); onEdit(course); }} className="flex items-center gap-1 px-3 py-1.5 text-xs text-fg-secondary hover:text-[#1a4bc4] hover:bg-blue-50 rounded-lg transition-colors">
                <Edit3 className="w-3.5 h-3.5" /> 编辑
              </button>
              <button onClick={(e) => { e.stopPropagation(); onDelete(course.id); }} className="flex items-center gap-1 px-3 py-1.5 text-xs text-fg-secondary hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> 删除
              </button>
              {hasPlayableVideo(course) && (
                <button onClick={(e) => { e.stopPropagation(); navigate(`/training/preview?courseId=${course.id}`); }} className="flex items-center gap-1 px-3 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors ml-auto">
                  <PlayCircle className="w-3.5 h-3.5" /> 进入学习
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const VideoShareTab = ({courses, readonly = false, publicAccess = false, onAddCourse, onPreview, onCaptionsGenerated, onEditCourse, onDeleteCourse, onBatchReview}: {
  courses: TrainingCourse[];
  readonly?: boolean;
  publicAccess?: boolean;
  onAddCourse?: () => void;
  onPreview: (courseId: string) => void;
  onCaptionsGenerated?: () => Promise<void>;
  onEditCourse?: (course: TrainingCourse) => void;
  onDeleteCourse?: (course: TrainingCourse) => void;
  onBatchReview?: (courseIds: string[], status: VideoReviewStatus) => Promise<void>;
}) => {
  type AssetKind = 'video' | 'document';
  type AssetFilter = 'all' | 'video' | 'document' | 'pdf' | 'word' | 'other';
  type DirectionFilter = '全部' | 'positive' | 'negative' | 'other';
  type ReviewStatusFilter = '全部' | 'legacy' | VideoReviewStatus;
  type ShareableAsset = {
    id: string;
    course: TrainingCourse;
    title: string;
    url: string;
    kind: AssetKind;
    kindLabel: string;
    sourceLabel: string;
    extension: string;
    captionsCount: number;
    searchText: string;
  };

  const getShareUrlExtension = (url?: string) => {
    if (!url) return '';
    try {
      return decodeURIComponent(new URL(url, window.location.origin).pathname).split('.').pop()?.toLowerCase() ?? '';
    } catch {
      return url.split('?')[0]?.split('.').pop()?.toLowerCase() ?? '';
    }
  };
  const isShareableVideoUrl = (url?: string) => ['mp4', 'm4v', 'mov', 'webm', 'avi', 'mkv'].includes(getShareUrlExtension(url));
  const getComparableUrl = (url?: string) => {
    if (!url) return '';
    try {
      const parsed = new URL(url, window.location.origin);
      return decodeURIComponent(parsed.pathname).replace(/^\/training-media\//, '/storage/v1/object/public/training-materials/');
    } catch {
      return url.split('?')[0] ?? url;
    }
  };
  const getActionCaptionsForUrl = (course: TrainingCourse, url?: string) => {
    const config = course.assessmentConfig;
    const byUrl = config.actionCaptionsByUrl ?? {};
    if (url) {
      if (byUrl[url]?.length) return byUrl[url];
      const comparable = getComparableUrl(url);
      const matchedKey = Object.keys(byUrl).find(key => getComparableUrl(key) === comparable);
      if (matchedKey && byUrl[matchedKey]?.length) return byUrl[matchedKey];
    }
    return config.actionCaptions ?? [];
  };
  const getCaptionJobForAsset = (courseId: string, targetUrl?: string) => (
    captionJobs.find(job => job.id === getActionCaptionJobKey(courseId, targetUrl))
  );
  const getCaptionStatus = (asset: ShareableAsset, captionJob?: ActionCaptionJob) => {
    if (captionJob?.status === 'running') {
      return {
        className: 'text-indigo-600',
        text: `生成中 ${captionJob.progress}%`,
      };
    }
    if (captionJob?.status === 'failed') {
      return {
        className: 'text-red-600',
        text: '生成失败',
      };
    }
    if (captionJob?.status === 'succeeded' && asset.captionsCount === 0) {
      return {
        className: 'text-emerald-600',
        text: '已生成，刷新中',
      };
    }
    if (asset.captionsCount > 0) {
      return {
        className: 'text-emerald-600',
        text: `${asset.captionsCount} 条动作流`,
      };
    }
    return {
      className: 'text-fg-faint',
      text: '未生成动作流',
    };
  };
  const getDocumentLabel = (extension: string) => {
    if (extension === 'pdf') return 'PDF';
    if (['doc', 'docx'].includes(extension)) return 'Word';
    if (['ppt', 'pptx'].includes(extension)) return 'PPT';
    if (['xls', 'xlsx'].includes(extension)) return '表格';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) return '图片';
    return '文档';
  };
  const getDocumentPreviewPath = (asset: ShareableAsset) => {
    const params = new URLSearchParams({
      file: asset.url,
      title: asset.title,
      type: asset.extension || asset.kindLabel,
    });
    return `/training/docs/pdf?${params.toString()}`;
  };
  const handlePreviewAsset = (asset: ShareableAsset) => {
    if (asset.kind === 'document') {
      window.open(getDocumentPreviewPath(asset), '_blank', 'noopener,noreferrer');
      return;
    }
    if (publicAccess) {
      void handleOpen(asset.course.id, asset.url);
      return;
    }
    onPreview(asset.course.id);
  };
  const getShareableItems = (course: TrainingCourse) => {
    const sectionItems = course.content
      .filter(section => Boolean(section.contentUrl))
      .map((section, index) => ({
        id: `section-${index}`,
        title: section.sectionTitle || `章节 ${index + 1}`,
        url: section.contentUrl!,
        kind: (section.contentType === 'video' || isShareableVideoUrl(section.contentUrl)) ? 'video' as const : 'document' as const,
        sourceLabel: `章节 ${index + 1}`,
      }));
    const materialItems = course.materials
      .filter(material => Boolean(material.url))
      .map((material, index) => ({
        id: `material-${index}`,
        title: material.title || `资料 ${index + 1}`,
        url: material.url!,
        kind: (material.type === 'video' || isShareableVideoUrl(material.url)) ? 'video' as const : 'document' as const,
        sourceLabel: `资料 ${index + 1}`,
      }));
    return [...sectionItems, ...materialItems];
  };
  const hasShareableContent = (course: TrainingCourse) => getShareableItems(course).length > 0;
  const getVideoCount = (course: TrainingCourse) =>
    getShareableItems(course).filter(item => item.kind === 'video').length;
  const shareableCourses = courses.filter(hasShareableContent);
  const assets: ShareableAsset[] = shareableCourses.flatMap(course => getShareableItems(course).map(item => {
    const extension = getShareUrlExtension(item.url);
    const kindLabel = item.kind === 'video' ? '视频' : getDocumentLabel(extension);
    return {
      id: `${course.id}::${item.id}`,
      course,
      title: item.title,
      url: item.url,
      kind: item.kind,
      kindLabel,
      sourceLabel: item.sourceLabel,
      extension,
      captionsCount: item.kind === 'video' ? getActionCaptionsForUrl(course, item.url).length : 0,
      searchText: `${course.title} ${course.description} ${course.category} ${course.taskCategory?.name ?? ''} ${course.scene?.name ?? ''} ${(course.qualityTags ?? []).map(tag => tag.name).join(' ')} ${course.videoReviewNote ?? ''} ${course.videoReviewStatus ? VIDEO_REVIEW_STATUS_LABELS[course.videoReviewStatus] : '历史记录'} ${item.title} ${kindLabel} ${extension}`.toLowerCase(),
    };
  }));
  const getDirection = (asset: ShareableAsset): Exclude<DirectionFilter, '全部'> => {
    if (asset.kind !== 'video') return 'other';
    return resolveVideoPolarity(asset.course) ?? 'other';
  };
  const [links, setLinks] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [captionJobs, setCaptionJobs] = useState<ActionCaptionJob[]>(() => listActionCaptionJobs());
  const refreshedCaptionJobIdsRef = useRef<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<AssetFilter>('all');
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('全部');
  const [categoryFilter, setCategoryFilter] = useState('全部');
  const [taskFilter, setTaskFilter] = useState('全部');
  const [sceneFilter, setSceneFilter] = useState('全部');
  const [qualityFilter, setQualityFilter] = useState('全部');
  const [reviewStatusFilter, setReviewStatusFilter] = useState<ReviewStatusFilter>('全部');
  const [selectedReviewCourseIds, setSelectedReviewCourseIds] = useState<Set<string>>(new Set());
  const [batchReviewStatus, setBatchReviewStatus] = useState<VideoReviewStatus>('internal');
  const [batchReviewLoading, setBatchReviewLoading] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const canUsePublicLinks = publicAccess || !readonly;
  const directionScope = assets.filter(asset => directionFilter === '全部' || getDirection(asset) === directionFilter);
  const categories = Array.from(new Set(directionScope
    .map(asset => asset.course.category || '综合')
    .filter(category => category !== '正向视频' && category !== '负向视频' && category !== '负面视频')))
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const categoryOptions = ['全部', ...categories];
  const taxonomyScope = directionScope.filter(asset => categoryFilter === '全部' || asset.course.category === categoryFilter);
  const taskOptions = Array.from(new Map(
    taxonomyScope
      .filter(asset => asset.course.taskCategory)
      .map(asset => [asset.course.taskCategory!.id, asset.course.taskCategory!]),
  ).values()).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-Hans-CN'));
  const sceneOptions = Array.from(new Map(
    taxonomyScope
      .filter(asset => asset.course.scene)
      .map(asset => [asset.course.scene!.id, asset.course.scene!]),
  ).values()).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-Hans-CN'));
  const qualityOptions = Array.from(new Map(
    taxonomyScope.flatMap(asset => (asset.course.qualityTags ?? []).map(tag => [tag.id, tag] as const)),
  ).values()).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-Hans-CN'));
  const reviewStatusOptions = Array.from(new Set<ReviewStatusFilter>(taxonomyScope.map(asset => asset.course.videoReviewStatus ?? 'legacy')));

  const filteredAssets = assets.filter(asset => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesSearch = !normalizedQuery || asset.searchText.includes(normalizedQuery);
    const matchesDirection = directionFilter === '全部' || getDirection(asset) === directionFilter;
    const matchesCategory = categoryFilter === '全部' || asset.course.category === categoryFilter;
    const matchesTask = taskFilter === '全部' || asset.course.taskCategory?.id === taskFilter;
    const matchesScene = sceneFilter === '全部' || asset.course.scene?.id === sceneFilter;
    const matchesQuality = qualityFilter === '全部'
      || (asset.course.qualityTags ?? []).some(tag => tag.id === qualityFilter);
    const matchesReviewStatus = reviewStatusFilter === '全部'
      || (reviewStatusFilter === 'legacy' ? !asset.course.videoReviewStatus : asset.course.videoReviewStatus === reviewStatusFilter);
    const matchesKind = kindFilter === 'all'
      || (kindFilter === 'video' && asset.kind === 'video')
      || (kindFilter === 'document' && asset.kind === 'document')
      || (kindFilter === 'pdf' && asset.extension === 'pdf')
      || (kindFilter === 'word' && ['doc', 'docx'].includes(asset.extension))
      || (kindFilter === 'other' && asset.kind === 'document' && !['pdf', 'doc', 'docx'].includes(asset.extension));
    return matchesSearch && matchesDirection && matchesCategory && matchesTask && matchesScene && matchesQuality && matchesReviewStatus && matchesKind;
  });
  const reviewableNegativeCourseIds = Array.from(new Set(
    filteredAssets
      .filter(asset => asset.kind === 'video' && getDirection(asset) === 'negative')
      .map(asset => asset.course.id),
  ));
  const selectedReviewIds = Array.from(selectedReviewCourseIds).filter(id => reviewableNegativeCourseIds.includes(id));
  const allReviewableSelected = reviewableNegativeCourseIds.length > 0
    && reviewableNegativeCourseIds.every(id => selectedReviewCourseIds.has(id));
  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageAssets = filteredAssets.slice((safePage - 1) * pageSize, safePage * pageSize);
  const assetCounts = {
    video: assets.filter(asset => asset.kind === 'video').length,
    document: assets.filter(asset => asset.kind === 'document').length,
    pdf: assets.filter(asset => asset.extension === 'pdf').length,
    word: assets.filter(asset => ['doc', 'docx'].includes(asset.extension)).length,
  };

  useEffect(() => {
    setPage(1);
  }, [query, kindFilter, directionFilter, categoryFilter, taskFilter, sceneFilter, qualityFilter, reviewStatusFilter]);

  useEffect(() => {
    setSelectedReviewCourseIds(previous => new Set(
      Array.from(previous).filter(id => reviewableNegativeCourseIds.includes(id)),
    ));
  }, [courses, query, kindFilter, directionFilter, categoryFilter, taskFilter, sceneFilter, qualityFilter, reviewStatusFilter]);

  useEffect(() => {
    setCategoryFilter('全部');
    setTaskFilter('全部');
    setSceneFilter('全部');
    setQualityFilter('全部');
    setReviewStatusFilter('全部');
  }, [directionFilter]);

  useEffect(() => {
    setTaskFilter('全部');
    setSceneFilter('全部');
    setQualityFilter('全部');
    setReviewStatusFilter('全部');
  }, [categoryFilter]);

  useEffect(() => subscribeActionCaptionJobs(setCaptionJobs), []);

  useEffect(() => {
    const completedJobs = captionJobs.filter(job => job.status === 'succeeded' && !refreshedCaptionJobIdsRef.current.has(job.id));
    if (!completedJobs.length || !onCaptionsGenerated) return;
    completedJobs.forEach(job => refreshedCaptionJobIdsRef.current.add(job.id));
    void onCaptionsGenerated();
  }, [captionJobs, onCaptionsGenerated]);

  const getLinkKey = (courseId: string, targetUrl?: string) => targetUrl ? `${courseId}::${targetUrl}` : courseId;

  const ensureLink = async (courseId: string, targetUrl?: string) => {
    const key = getLinkKey(courseId, targetUrl);
    if (links[key]) return links[key];
    setLoadingId(key);
    setError('');
    try {
      const course = courses.find(item => item.id === courseId);
      if (publicAccess) {
        if (!course?.publicShareToken) throw new Error('当前资料暂未生成公开访问令牌');
        const path = buildTrainingSharePath(course.id, course.publicShareToken, targetUrl);
        const url = `${window.location.origin}${path}`;
        setLinks(prev => ({...prev, [key]: url}));
        return url;
      }
      const result = await createTrainingShareLink(courseId, targetUrl);
      setLinks(prev => ({...prev, [key]: result.url}));
      return result.url;
    } catch (e) {
      const message = e instanceof Error ? e.message : '生成链接失败';
      setError(message);
      return '';
    } finally {
      setLoadingId(null);
    }
  };

  const handleCopy = async (courseId: string, targetUrl?: string) => {
    const key = getLinkKey(courseId, targetUrl);
    const url = await ensureLink(courseId, targetUrl);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(key);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      window.prompt('复制下面的培训链接', url);
    }
  };

  const handleOpen = async (courseId: string, targetUrl?: string) => {
    const url = await ensureLink(courseId, targetUrl);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleGenerateCaptions = async (course: TrainingCourse, targetUrl?: string) => {
    if (readonly) return;
    setError('');
    startActionCaptionJob(course, targetUrl);
  };

  const toggleReviewSelection = (courseId: string) => {
    setSelectedReviewCourseIds(previous => {
      const next = new Set(previous);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  };

  const toggleAllReviewSelection = () => {
    setSelectedReviewCourseIds(allReviewableSelected ? new Set() : new Set(reviewableNegativeCourseIds));
  };

  const handleBatchReview = async () => {
    if (!onBatchReview || selectedReviewIds.length === 0) return;
    setBatchReviewLoading(true);
    setError('');
    try {
      await onBatchReview(selectedReviewIds, batchReviewStatus);
      setSelectedReviewCourseIds(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : '批量审核失败');
    } finally {
      setBatchReviewLoading(false);
    }
  };

  const filters: {id: AssetFilter; label: string; count: number}[] = [
    {id: 'all', label: '全部资料', count: assets.length},
    {id: 'video', label: '视频', count: assetCounts.video},
    {id: 'document', label: '文档', count: assetCounts.document},
    {id: 'pdf', label: 'PDF', count: assetCounts.pdf},
    {id: 'word', label: 'Word', count: assetCounts.word},
  ];
  const directionOptions: {id: DirectionFilter; label: string; count: number}[] = [
    {id: '全部', label: '全部方向', count: assets.length},
    {id: 'positive', label: '正向视频', count: assets.filter(asset => getDirection(asset) === 'positive').length},
    {id: 'negative', label: '负向视频', count: assets.filter(asset => getDirection(asset) === 'negative').length},
    ...(() => {
      const count = assets.filter(asset => getDirection(asset) === 'other').length;
      return count ? [{id: 'other' as const, label: '其他资料', count}] : [];
    })(),
  ];
  const reviewStatusFilterOptions: {id: ReviewStatusFilter; label: string; count: number}[] = [
    {id: '全部', label: '全部状态', count: taxonomyScope.length},
    ...reviewStatusOptions.map(status => ({
      id: status,
      label: status === 'legacy' ? '历史记录' : VIDEO_REVIEW_STATUS_LABELS[status],
      count: taxonomyScope.filter(asset => status === 'legacy'
        ? !asset.course.videoReviewStatus
        : asset.course.videoReviewStatus === status).length,
    })),
  ];

  return (
    <div className="space-y-5">
      <div className="bg-surface rounded-xl border border-border p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-fg flex items-center gap-2">
              <Link2 className="w-4 h-4 text-[#1a4bc4]" />
              员工培训资料库
            </h2>
            <p className="text-sm text-fg-muted mt-1">
              按视频、PDF、Word 和课程分类管理公开资料链接，员工无需报名课程、无需登录后台即可观看或预览。
            </p>
          </div>
          {!readonly && onAddCourse && (
            <button onClick={onAddCourse} className="flex items-center justify-center gap-2 px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm hover:bg-[#153da0] transition-colors">
              <Plus className="w-4 h-4" /> 新建资料
            </button>
          )}
        </div>
        {readonly && (
          <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
            {publicAccess ? '当前为公开访问模式，可直接打开和复制培训资料链接。' : '当前账号仅可查看和预览视频分享资料。'}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {!readonly && onBatchReview && reviewableNegativeCourseIds.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <input
              type="checkbox"
              aria-label="全选当前筛选结果中的负向视频"
              checked={allReviewableSelected}
              onChange={toggleAllReviewSelection}
              className="h-4 w-4 shrink-0 accent-rose-600"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-rose-900">批量审核负向视频</p>
              <p className="truncate text-xs text-rose-700">
                已选择 {selectedReviewIds.length} 条，共 {reviewableNegativeCourseIds.length} 条可审核
              </p>
            </div>
            <button
              type="button"
              onClick={toggleAllReviewSelection}
              className="shrink-0 text-xs font-medium text-rose-700 underline underline-offset-2"
            >
              {allReviewableSelected ? '取消全选' : '全选'}
            </button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              aria-label="批量审核状态"
              value={batchReviewStatus}
              onChange={event => setBatchReviewStatus(event.target.value as VideoReviewStatus)}
              className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-fg-secondary"
            >
              {(Object.entries(VIDEO_REVIEW_STATUS_LABELS) as [VideoReviewStatus, string][]).map(([status, label]) => (
                <option key={status} value={status}>{label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleBatchReview()}
              disabled={selectedReviewIds.length === 0 || batchReviewLoading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-700 px-3 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {batchReviewLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              批量保存审核状态
            </button>
          </div>
        </div>
      )}

      {shareableCourses.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <PlayCircle className="w-12 h-12 text-fg-faint mx-auto mb-3" />
          <p className="text-fg-secondary font-medium">暂无可分享的培训资料</p>
          <p className="text-sm text-fg-faint mt-1">请先新建课程，在章节或参考资料中上传文件并保存课程。</p>
          {!readonly && onAddCourse && (
            <button onClick={onAddCourse} className="mt-4 px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm hover:bg-[#153da0]">
              新建课程
            </button>
          )}
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-fg-muted">全部资料</p>
                <p className="text-xl font-bold text-fg">{assets.length}</p>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-fg-muted">视频</p>
                <p className="text-xl font-bold text-fg">{assetCounts.video}</p>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-fg-muted">文档</p>
                <p className="text-xl font-bold text-fg">{assetCounts.document}</p>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-fg-muted">课程</p>
                <p className="text-xl font-bold text-fg">{shareableCourses.length}</p>
              </div>
            </div>

            <div className="flex flex-col xl:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-faint" />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="搜索标题、课程、分类、文件类型"
                  className="w-full pl-9 pr-9 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] focus:border-transparent"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-faint hover:text-fg-secondary">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {filters.map(filter => (
                  <button
                    key={filter.id}
                    onClick={() => setKindFilter(filter.id)}
                    className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                      kindFilter === filter.id
                        ? 'bg-gray-900 border-gray-900 text-white'
                        : 'bg-surface border-border text-fg-secondary hover:bg-surface-muted'
                    }`}
                  >
                    {filter.label} <span className={kindFilter === filter.id ? 'text-fg-faint' : 'text-fg-faint'}>{filter.count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 overflow-x-auto pb-1" role="tablist" aria-label="资料方向">
              <span className="shrink-0 text-xs font-medium text-fg-muted">资料方向</span>
              {directionOptions.map(option => {
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={directionFilter === option.id}
                    onClick={() => setDirectionFilter(option.id)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs border transition-colors ${
                      directionFilter === option.id
                        ? 'bg-[#1a4bc4] border-[#1a4bc4] text-white'
                        : 'bg-surface border-border text-fg-secondary hover:bg-surface-muted'
                    }`}
                  >
                    {option.label} <span className={directionFilter === option.id ? 'text-blue-100' : 'text-fg-faint'}>{option.count}</span>
                  </button>
                );
              })}
            </div>

            {categoryOptions.length > 1 && (
              <div className="flex items-center gap-3 overflow-x-auto pb-1">
                <span className="shrink-0 text-xs font-medium text-fg-muted">课程分类</span>
                {categoryOptions.map(category => {
                  const count = category === '全部'
                    ? directionScope.length
                    : directionScope.filter(asset => asset.course.category === category).length;
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setCategoryFilter(category)}
                      className={`shrink-0 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                        categoryFilter === category
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-border bg-surface text-fg-secondary hover:bg-surface-muted'
                      }`}
                    >
                      {category === '全部' ? '全部分类' : category} <span className={categoryFilter === category ? 'text-gray-300' : 'text-fg-faint'}>{count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {(taskOptions.length > 0 || sceneOptions.length > 0 || qualityOptions.length > 0 || (!publicAccess && reviewStatusFilterOptions.length > 1)) && (
              <div className="space-y-2 border-t border-border-subtle pt-3">
                {taskOptions.length > 0 && (
                  <div className="flex items-start gap-3">
                    <span className="w-16 shrink-0 pt-1.5 text-xs font-medium text-fg-muted">任务分类</span>
                    <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
                      {[{id: '全部', name: '全部任务'}, ...taskOptions].map(option => {
                        const count = option.id === '全部'
                          ? taxonomyScope.length
                          : taxonomyScope.filter(asset => asset.course.taskCategory?.id === option.id).length;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setTaskFilter(option.id)}
                            className={`shrink-0 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                              taskFilter === option.id
                                ? 'border-gray-900 bg-gray-900 text-white'
                                : 'border-border bg-surface text-fg-secondary hover:bg-surface-muted'
                            }`}
                          >
                            {option.name} <span className={taskFilter === option.id ? 'text-gray-300' : 'text-fg-faint'}>{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {sceneOptions.length > 0 && (
                  <div className="flex items-start gap-3">
                    <span className="w-16 shrink-0 pt-1.5 text-xs font-medium text-fg-muted">场景</span>
                    <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
                      {[{id: '全部', name: '全部场景'}, ...sceneOptions].map(option => {
                        const count = option.id === '全部'
                          ? taxonomyScope.length
                          : taxonomyScope.filter(asset => asset.course.scene?.id === option.id).length;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setSceneFilter(option.id)}
                            className={`shrink-0 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                              sceneFilter === option.id
                                ? 'border-emerald-700 bg-emerald-700 text-white'
                                : 'border-border bg-surface text-fg-secondary hover:bg-surface-muted'
                            }`}
                          >
                            {option.name} <span className={sceneFilter === option.id ? 'text-emerald-100' : 'text-fg-faint'}>{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {qualityOptions.length > 0 && (
                  <div className="flex items-start gap-3">
                    <span className="w-16 shrink-0 pt-1.5 text-xs font-medium text-fg-muted">质量标签</span>
                    <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
                      {[{id: '全部', name: '全部标签'}, ...qualityOptions].map(option => {
                        const count = option.id === '全部'
                          ? taxonomyScope.length
                          : taxonomyScope.filter(asset => (asset.course.qualityTags ?? []).some(tag => tag.id === option.id)).length;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setQualityFilter(option.id)}
                            className={`shrink-0 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                              qualityFilter === option.id
                                ? 'border-[#1a4bc4] bg-[#1a4bc4] text-white'
                                : 'border-border bg-surface text-fg-secondary hover:bg-surface-muted'
                            }`}
                          >
                            {option.name} <span className={qualityFilter === option.id ? 'text-blue-100' : 'text-fg-faint'}>{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {!publicAccess && reviewStatusFilterOptions.length > 1 && (
                  <div className="flex items-start gap-3">
                    <span className="w-16 shrink-0 pt-1.5 text-xs font-medium text-fg-muted">审核状态</span>
                    <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
                      {reviewStatusFilterOptions.map(option => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setReviewStatusFilter(option.id)}
                          className={`shrink-0 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                            reviewStatusFilter === option.id
                              ? 'border-indigo-700 bg-indigo-700 text-white'
                              : 'border-border bg-surface text-fg-secondary hover:bg-surface-muted'
                          }`}
                        >
                          {option.label} <span className={reviewStatusFilter === option.id ? 'text-indigo-100' : 'text-fg-faint'}>{option.count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-muted border-b border-border">
                  <th className="text-left px-4 py-3 text-fg-muted font-medium">资料</th>
                  <th className="text-left px-4 py-3 text-fg-muted font-medium">课程</th>
                  <th className="text-left px-4 py-3 text-fg-muted font-medium">分类</th>
                  <th className="text-left px-4 py-3 text-fg-muted font-medium">状态</th>
                  <th className="text-right px-4 py-3 text-fg-muted font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {pageAssets.map(asset => {
                  const itemKey = getLinkKey(asset.course.id, asset.url);
                  const courseLinkKey = getLinkKey(asset.course.id);
                  const captionJob = getCaptionJobForAsset(asset.course.id, asset.url);
                  const captionStatus = getCaptionStatus(asset, captionJob);
                  const itemLoading = loadingId === itemKey;
                  const courseLoading = loadingId === courseLinkKey;
                  const isCaptionLoading = captionJob?.status === 'running';
                  const progress = captionJob?.progress ?? 0;
                  const itemCopied = copiedId === itemKey;
                  const courseCopied = copiedId === courseLinkKey;
                  return (
                    <tr key={asset.id} className="border-b border-border-subtle hover:bg-surface-muted">
                      <td className="px-4 py-3">
                        <div className="flex min-w-[260px] items-center gap-3">
                          {!readonly && onBatchReview && asset.kind === 'video' && getDirection(asset) === 'negative' && (
                            <input
                              type="checkbox"
                              aria-label={`选择${asset.title}进行批量审核`}
                              checked={selectedReviewCourseIds.has(asset.course.id)}
                              onChange={() => toggleReviewSelection(asset.course.id)}
                              className="h-4 w-4 shrink-0 accent-rose-600"
                            />
                          )}
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${asset.kind === 'video' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                            {asset.kind === 'video' ? <PlayCircle className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-fg truncate">{asset.title}</p>
                            <p className="text-xs text-fg-faint">{asset.kindLabel} · {asset.extension || 'file'} · {asset.sourceLabel}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-fg truncate max-w-[220px]">{asset.course.title}</p>
                        <p className="text-xs text-fg-faint truncate max-w-[220px]">{asset.course.description || '暂无描述'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex max-w-[220px] flex-wrap gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[asset.course.category] ?? 'bg-surface-muted text-fg-secondary'}`}>
                            {asset.course.category}
                          </span>
                          {asset.course.taskCategory && (
                            <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{asset.course.taskCategory.name}</span>
                          )}
                          {asset.course.scene && (
                            <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{asset.course.scene.name}</span>
                          )}
                          {(asset.course.qualityTags ?? []).slice(0, 2).map(tag => (
                            <span key={tag.id} className="rounded bg-surface-muted px-2 py-0.5 text-xs text-fg-secondary">{tag.name}</span>
                          ))}
                          {(asset.course.qualityTags?.length ?? 0) > 2 && (
                            <span className="rounded bg-surface-muted px-2 py-0.5 text-xs text-fg-faint">+{asset.course.qualityTags!.length - 2}</span>
                          )}
                          {asset.course.videoSeverity && (
                            <span className="rounded bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
                              {VIDEO_SEVERITY_LABELS[asset.course.videoSeverity]}
                            </span>
                          )}
                          {!publicAccess && (
                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${asset.course.videoReviewStatus === 'pending_review' ? 'bg-amber-50 text-amber-700' : asset.course.videoReviewStatus === 'internal' ? 'bg-slate-100 text-slate-600' : 'bg-indigo-50 text-indigo-700'}`}>
                              {asset.course.videoReviewStatus ? VIDEO_REVIEW_STATUS_LABELS[asset.course.videoReviewStatus] : '历史记录'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1 text-xs">
                          <p className="flex items-center gap-1 text-fg-muted">
                            <Clock className="w-3.5 h-3.5" /> {asset.course.durationMinutes} 分钟
                          </p>
                          <p className={`flex items-center gap-1 ${captionStatus.className}`} title={captionJob?.error}>
                            <Sparkles className="w-3.5 h-3.5" /> {captionStatus.text}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {canUsePublicLinks && (
                            <>
                              <button
                                onClick={() => handleCopy(asset.course.id, asset.url)}
                                disabled={itemLoading || isCaptionLoading}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs hover:bg-black disabled:opacity-60 transition-colors"
                              >
                                {itemLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                                {itemCopied ? '已复制' : '复制链接'}
                              </button>
                              <button
                                onClick={() => handleOpen(asset.course.id, asset.url)}
                                disabled={itemLoading || isCaptionLoading}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border text-fg-secondary rounded-lg text-xs hover:bg-surface-muted disabled:opacity-60 transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5" /> 打开
                              </button>
                            </>
                          )}
                          {!readonly && asset.kind === 'video' && (
                            <button
                              onClick={() => handleGenerateCaptions(asset.course, asset.url)}
                              disabled={courseLoading || isCaptionLoading}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border text-fg-secondary rounded-lg text-xs hover:bg-surface-muted disabled:opacity-60 transition-colors"
                            >
                              {isCaptionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                              {isCaptionLoading ? `${progress}%` : asset.captionsCount > 0 ? '重生成' : '动作流'}
                            </button>
                          )}
                          {canUsePublicLinks && (
                            <button
                              onClick={() => handleCopy(asset.course.id)}
                              disabled={courseLoading || isCaptionLoading}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border text-fg-secondary rounded-lg text-xs hover:bg-surface-muted disabled:opacity-60 transition-colors"
                            >
                              {courseLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />}
                              {courseCopied ? '已复制' : '整课'}
                            </button>
                          )}
                          <button
                            onClick={() => handlePreviewAsset(asset)}
                            disabled={isCaptionLoading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border text-fg-secondary rounded-lg text-xs hover:bg-surface-muted disabled:opacity-60 transition-colors"
                          >
                            {asset.kind === 'video' ? <PlayCircle className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                            预览
                          </button>
                          {!readonly && onEditCourse && (
                            <button
                              onClick={() => onEditCourse(asset.course)}
                              disabled={isCaptionLoading}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border text-fg-secondary rounded-lg text-xs hover:bg-surface-muted disabled:opacity-60 transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> 编辑
                            </button>
                          )}
                          {!readonly && onDeleteCourse && (
                            <button
                              onClick={() => onDeleteCourse(asset.course)}
                              disabled={courseLoading || isCaptionLoading}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-red-200 text-red-600 rounded-lg text-xs hover:bg-red-50 disabled:opacity-60 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> 删除
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden divide-y divide-border-subtle">
            {pageAssets.map(asset => {
              const itemKey = getLinkKey(asset.course.id, asset.url);
              const courseLinkKey = getLinkKey(asset.course.id);
              const captionJob = getCaptionJobForAsset(asset.course.id, asset.url);
              const captionStatus = getCaptionStatus(asset, captionJob);
              const itemLoading = loadingId === itemKey;
              const isCaptionLoading = captionJob?.status === 'running';
              const progress = captionJob?.progress ?? 0;
              const itemCopied = copiedId === itemKey;
              return (
                <div key={asset.id} className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    {!readonly && onBatchReview && asset.kind === 'video' && getDirection(asset) === 'negative' && (
                      <input
                        type="checkbox"
                        aria-label={`选择${asset.title}进行批量审核`}
                        checked={selectedReviewCourseIds.has(asset.course.id)}
                        onChange={() => toggleReviewSelection(asset.course.id)}
                        className="mt-3 h-4 w-4 shrink-0 accent-rose-600"
                      />
                    )}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${asset.kind === 'video' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      {asset.kind === 'video' ? <PlayCircle className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-fg">{asset.title}</p>
                      <p className="text-xs text-fg-faint mt-1">{asset.kindLabel} · {asset.extension || 'file'} · {asset.course.title}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[asset.course.category] ?? 'bg-surface-muted text-fg-secondary'}`}>
                          {asset.course.category}
                        </span>
                        {asset.course.taskCategory && (
                          <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                            {asset.course.taskCategory.name}
                          </span>
                        )}
                        {asset.course.scene && (
                          <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            {asset.course.scene.name}
                          </span>
                        )}
                        {(asset.course.qualityTags ?? []).slice(0, 2).map(tag => (
                          <span key={tag.id} className="rounded bg-surface-muted px-2 py-0.5 text-xs text-fg-secondary">
                            {tag.name}
                          </span>
                        ))}
                        {(asset.course.qualityTags?.length ?? 0) > 2 && (
                          <span className="rounded bg-surface-muted px-2 py-0.5 text-xs text-fg-faint">
                            +{asset.course.qualityTags!.length - 2}
                          </span>
                        )}
                        {asset.course.videoSeverity && (
                          <span className="rounded bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
                            {VIDEO_SEVERITY_LABELS[asset.course.videoSeverity]}
                          </span>
                        )}
                        {!publicAccess && (
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${asset.course.videoReviewStatus === 'pending_review' ? 'bg-amber-50 text-amber-700' : asset.course.videoReviewStatus === 'internal' ? 'bg-slate-100 text-slate-600' : 'bg-indigo-50 text-indigo-700'}`}>
                            {asset.course.videoReviewStatus ? VIDEO_REVIEW_STATUS_LABELS[asset.course.videoReviewStatus] : '历史记录'}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center">
                        <span className={`text-xs flex items-center gap-1 ${captionStatus.className}`} title={captionJob?.error}>
                          <Sparkles className="w-3 h-3" /> {captionStatus.text}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className={`grid gap-2 ${canUsePublicLinks ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {canUsePublicLinks && (
                            <>
                              <button
                                onClick={() => handleCopy(asset.course.id, asset.url)}
                          disabled={itemLoading || isCaptionLoading}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-lg text-xs hover:bg-black disabled:opacity-60"
                        >
                          {itemLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                          {itemCopied ? '已复制' : '复制链接'}
                        </button>
                        <button
                          onClick={() => handleOpen(asset.course.id, asset.url)}
                          disabled={itemLoading || isCaptionLoading}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-surface border border-border text-fg-secondary rounded-lg text-xs hover:bg-surface-muted disabled:opacity-60"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> 打开
                        </button>
                      </>
                    )}
                    {!readonly && asset.kind === 'video' && (
                      <button
                        onClick={() => handleGenerateCaptions(asset.course, asset.url)}
                        disabled={isCaptionLoading}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-surface border border-border text-fg-secondary rounded-lg text-xs hover:bg-surface-muted disabled:opacity-60"
                      >
                        {isCaptionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {isCaptionLoading ? `${progress}%` : '动作流'}
                      </button>
                    )}
                    {canUsePublicLinks && (
                            <button
                              onClick={() => handleCopy(asset.course.id)}
                        disabled={loadingId === courseLinkKey || isCaptionLoading}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-surface border border-border text-fg-secondary rounded-lg text-xs hover:bg-surface-muted disabled:opacity-60"
                      >
                        <BookOpen className="w-3.5 h-3.5" /> 整课链接
                      </button>
                    )}
                    <button
                      onClick={() => handlePreviewAsset(asset)}
                      disabled={isCaptionLoading}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 bg-surface border border-border text-fg-secondary rounded-lg text-xs hover:bg-surface-muted disabled:opacity-60"
                    >
                      {asset.kind === 'video' ? <PlayCircle className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                      预览
                    </button>
                    {!readonly && onEditCourse && (
                      <button
                        onClick={() => onEditCourse(asset.course)}
                        disabled={isCaptionLoading}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-surface border border-border text-fg-secondary rounded-lg text-xs hover:bg-surface-muted disabled:opacity-60"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> 编辑
                      </button>
                    )}
                    {!readonly && onDeleteCourse && (
                      <button
                        onClick={() => onDeleteCourse(asset.course)}
                        disabled={isCaptionLoading}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-surface border border-red-200 text-red-600 rounded-lg text-xs hover:bg-red-50 disabled:opacity-60"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> 删除
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {filteredAssets.length === 0 && (
            <div className="text-center py-12 text-fg-faint">
              <Search className="w-10 h-10 mx-auto mb-2 opacity-50" />
              没有匹配的培训资料
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-surface-muted border-t border-border text-sm">
            <span className="text-fg-muted">
              共 {filteredAssets.length} 条，当前第 {safePage} / {totalPages} 页
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                disabled={safePage <= 1}
                className="px-3 py-1.5 bg-surface border border-border text-fg-secondary rounded-lg disabled:opacity-50 hover:bg-surface-muted"
              >
                上一页
              </button>
              <button
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                disabled={safePage >= totalPages}
                className="px-3 py-1.5 bg-surface border border-border text-fg-secondary rounded-lg disabled:opacity-50 hover:bg-surface-muted"
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const EnrollmentsTab = ({enrollments, onScore, onExport}: {enrollments: TrainingEnrollment[]; onScore: (id: string, score: number) => void; onExport: () => void}) => {
  const [statusFilter, setStatusFilter] = useState('');
  const [scoringId, setScoringId] = useState<string | null>(null);
  const [scoreInput, setScoreInput] = useState('');

  const filtered = statusFilter ? enrollments.filter(e => e.status === statusFilter) : enrollments;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
        {['', 'enrolled', 'in_progress', 'completed', 'failed'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm ${statusFilter === s ? 'bg-[#1a4bc4] text-white' : 'bg-surface-muted text-fg-secondary hover:bg-surface-muted'}`}>
            {s === '' ? '全部' : (STATUS_LABELS[s]?.label ?? s)}
          </button>
        ))}
      </div>
      <button onClick={onExport} className="flex items-center gap-2 px-4 py-2 bg-surface border border-border text-fg-secondary rounded-lg text-sm hover:bg-surface-muted transition-colors">
        <Download className="w-4 h-4" /> 导出 CSV
      </button>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-muted border-b border-border">
              <th className="text-left px-4 py-3 text-fg-muted font-medium">学员</th>
              <th className="text-left px-4 py-3 text-fg-muted font-medium">课程</th>
              <th className="text-left px-4 py-3 text-fg-muted font-medium">状态</th>
              <th className="text-center px-4 py-3 text-fg-muted font-medium">进度</th>
              <th className="text-center px-4 py-3 text-fg-muted font-medium">培训前</th>
              <th className="text-center px-4 py-3 text-fg-muted font-medium">考核分</th>
              <th className="text-center px-4 py-3 text-fg-muted font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(enrollment => {
              const st = STATUS_LABELS[enrollment.status] ?? {label: enrollment.status, color: 'bg-surface-muted text-fg-secondary'};
              const isScoring = scoringId === enrollment.id;
              return (
                <tr key={enrollment.id} className="border-b border-border-subtle hover:bg-surface-muted">
                  <td className="px-4 py-3 font-medium text-fg">{enrollment.candidateName}</td>
                  <td className="px-4 py-3">
                    <div className="text-fg">{enrollment.courseTitle}</div>
                    <div className="text-xs text-fg-faint">{enrollment.courseCategory}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${st.color}`}>{st.label}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-[#1a4bc4] rounded-full" style={{width: `${enrollment.progressPct}%`}} />
                      </div>
                      <span className="text-xs text-fg-muted">{enrollment.progressPct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-fg-secondary">{enrollment.preInterviewScore ?? '-'}</td>
                  <td className="px-4 py-3 text-center font-medium">
                    {enrollment.finalScore !== undefined ? (
                      <span className={enrollment.finalScore >= 60 ? 'text-emerald-600' : 'text-red-500'}>
                        {enrollment.finalScore}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {(enrollment.status === 'enrolled' || enrollment.status === 'in_progress') && !isScoring && (
                      <button onClick={() => { setScoringId(enrollment.id); setScoreInput(''); }}
                        className="text-xs px-3 py-1.5 bg-[#1a4bc4] text-white rounded-lg hover:bg-[#153da0]">
                        录入考核
                      </button>
                    )}
                    {isScoring && (
                      <div className="flex items-center gap-2 justify-center">
                        <NumericScoreInput
                          value={scoreInput === '' ? 0 : Number(scoreInput) || 0}
                          onChange={(n) => setScoreInput(String(n))}
                          className="w-16 px-2 py-1 border rounded text-center text-sm"
                          placeholder="分数"
                          min={0}
                          max={100}
                        />
                        <button onClick={() => {
                          const s = parseFloat(scoreInput);
                          if (!isNaN(s) && s >= 0 && s <= 100) { onScore(enrollment.id, s); setScoringId(null); }
                        }} className="text-xs px-2 py-1 bg-emerald-500 text-white rounded hover:bg-emerald-600">
                          确认
                        </button>
                        <button onClick={() => setScoringId(null)} className="text-xs px-2 py-1 bg-gray-200 text-fg-secondary rounded hover:bg-gray-300">
                          取消
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-fg-faint">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
            暂无培训记录
          </div>
        )}
      </div>
    </div>
  );
};

const AnalysisTab = ({data, courses}: {data: WeaknessAnalysis; courses: TrainingCourse[]}) => {
  const maxFreq = data.weaknesses.length > 0 ? Math.max(...data.weaknesses.map(w => w.frequency)) : 1;
  const [candidateIdInput, setCandidateIdInput] = useState('');
  const [candidateNameInput, setCandidateNameInput] = useState('');
  const [recommendation, setRecommendation] = useState<CourseRecommendation | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRecommend = async () => {
    if (!candidateIdInput.trim()) return;
    setLoading(true);
    try {
      const result = await recommendCourses(candidateIdInput);
      setRecommendation(result);
    } catch { setRecommendation(null); }
    finally { setLoading(false); }
  };

  const handleEnroll = async (courseId: string) => {
    if (!candidateIdInput.trim() || !candidateNameInput.trim()) return;
    try {
      await createEnrollment({
        candidateId: candidateIdInput,
        candidateName: candidateNameInput,
        courseId,
      });
      setRecommendation(prev => prev ? {...prev, recommendations: prev.recommendations.filter(c => c.id !== courseId)} : null);
    } catch { /* already enrolled */ }
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-5 border border-amber-200">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          <span className="font-semibold text-amber-800">面试薄弱点分析</span>
        </div>
        <p className="text-sm text-amber-700">
          基于 <strong>{data.totalAnalyzed}</strong> 份面试不通过记录分析，发现以下高频薄弱维度
        </p>
      </div>

      {/* Weakness Bars */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
        <h3 className="font-semibold text-fg flex items-center gap-2">
          <Target className="w-4 h-4 text-red-500" /> 薄弱维度排名
        </h3>
        {data.weaknesses.map((w, i) => {
          const matchingCourses = courses.filter(c => c.category === w.dimension || c.competencyDimension === w.dimension);
          return (
            <div key={w.dimension} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 text-xs flex items-center justify-center font-bold">{i + 1}</span>
                  <span className="font-medium text-fg">{w.dimension}</span>
                  <span className="text-xs text-fg-faint">平均分 {w.avgScore}</span>
                </div>
                <span className="text-sm text-red-500 font-medium">{w.frequency} 人次</span>
              </div>
              <div className="w-full h-3 bg-surface-muted rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-full transition-all"
                  style={{width: `${(w.frequency / maxFreq) * 100}%`}} />
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-fg-faint">
                  受影响: {w.affectedCandidates.slice(0, 4).join('、')}{w.affectedCandidates.length > 4 ? ` 等${w.affectedCandidates.length}人` : ''}
                </div>
                {matchingCourses.length > 0 && (
                  <span className="text-xs text-[#1a4bc4] flex items-center gap-1">
                    <BookOpen className="w-3 h-3" /> {matchingCourses.length} 门相关课程
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Course Recommendation */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
        <h3 className="font-semibold text-fg flex items-center gap-2">
          <Award className="w-4 h-4 text-[#1a4bc4]" /> 智能推荐课程
        </h3>
        <p className="text-sm text-fg-muted">输入候选人 ID 和姓名，系统根据面试薄弱维度自动推荐匹配课程</p>
        <div className="flex items-center gap-3">
          <input value={candidateIdInput} onChange={e => setCandidateIdInput(e.target.value)}
            className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
            placeholder="候选人 ID" />
          <input value={candidateNameInput} onChange={e => setCandidateNameInput(e.target.value)}
            className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
            placeholder="候选人姓名" />
          <button onClick={handleRecommend} disabled={loading || !candidateIdInput.trim()}
            className="px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm hover:bg-[#153da0] disabled:opacity-50 whitespace-nowrap">
            {loading ? '分析中...' : '推荐课程'}
          </button>
        </div>

        {recommendation && (
          <div className="space-y-3 mt-4">
            {recommendation.dimensions.length > 0 && (
              <div className="flex gap-2">
                <span className="text-sm text-fg-muted">薄弱维度:</span>
                {recommendation.dimensions.map(d => (
                  <span key={d} className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">{d}</span>
                ))}
              </div>
            )}
            {recommendation.recommendations.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {recommendation.recommendations.map(course => (
                  <div key={course.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div>
                      <div className="text-sm font-medium text-fg">{course.title}</div>
                      <div className="text-xs text-fg-muted">{course.category} · {course.difficulty}</div>
                    </div>
                    <button onClick={() => handleEnroll(course.id)}
                      className="px-3 py-1.5 bg-[#1a4bc4] text-white rounded-lg text-xs hover:bg-[#153da0] whitespace-nowrap">
                      报名
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-fg-faint">该候选人无薄弱维度或暂无匹配课程</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const EffectivenessTab = ({data}: {data: TrainingEffectiveness}) => {
  return (
    <div className="space-y-6">
      {/* Overall */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-surface rounded-xl border border-border p-5 text-center">
          <div className="text-3xl font-bold text-fg">{data.totalCompleted}</div>
          <div className="text-sm text-fg-muted mt-1">培训完成人次</div>
        </div>
        <div className="bg-surface rounded-xl border border-border p-5 text-center">
          <div className="text-3xl font-bold text-emerald-600">+{data.avgImprovement}</div>
          <div className="text-sm text-fg-muted mt-1">平均分数提升</div>
        </div>
        <div className="bg-surface rounded-xl border border-border p-5 text-center">
          <div className="text-3xl font-bold text-[#1a4bc4]">{data.improvementRate}%</div>
          <div className="text-sm text-fg-muted mt-1">提升率</div>
        </div>
      </div>

      {/* By Category */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h3 className="font-semibold text-fg mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#1a4bc4]" /> 各维度培训效果
        </h3>
        <div className="space-y-4">
          {Object.entries(data.byCategory).map(([category, stat]) => {
            const improvement = stat.avgPost - stat.avgPre;
            const barWidth = Math.min(100, (stat.avgPost / 100) * 100);
            return (
              <div key={category} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[category] ?? 'bg-surface-muted text-fg-secondary'}`}>
                      {category}
                    </span>
                    <span className="text-xs text-fg-faint">{stat.count} 人次</span>
                  </div>
                  <div className="flex items-center gap-1 text-sm">
                    <span className="text-fg-faint">{stat.avgPre}</span>
                    <ArrowUpRight className="w-3 h-3 text-emerald-500" />
                    <span className="font-medium text-emerald-600">{stat.avgPost}</span>
                    <span className="text-xs text-emerald-500">(+{improvement.toFixed(1)})</span>
                  </div>
                </div>
                <div className="relative h-3 bg-surface-muted rounded-full overflow-hidden">
                  <div className="h-full bg-gray-300 rounded-full" style={{width: `${(stat.avgPre / 100) * 100}%`}} />
                  <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-[#1a4bc4] to-[#6366F1] rounded-full transition-all"
                    style={{width: `${barWidth}%`}} />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-fg-faint">提升率: {stat.count > 0 ? Math.round((stat.improved / stat.count) * 100) : 0}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const CreateCourseModal = ({initial, onClose, onSubmit, defaultContentType, videoSharingMode = false, videoTaxonomy, onManageTaxonomy}: {
  initial?: TrainingCourse;
  onClose: () => void;
  onSubmit: (input: {
    title: string; category: string; difficulty: string; description: string;
    durationMinutes?: number; content?: {sectionTitle: string; contentType: string; text?: string; contentUrl?: string}[];
    materials?: {title: string; type: string; url?: string}[];
    assessmentConfig?: {type: string; passingScore: number};
    competencyDimension?: string;
    videoPolarity?: VideoPolarity;
    taskCategoryId?: string | null;
    videoSceneId?: string | null;
    qualityTagIds?: string[];
    videoSeverity?: VideoSeverity | null;
    videoReviewNote?: string | null;
    videoReviewStatus?: VideoReviewStatus | null;
  }) => Promise<void>;
  defaultContentType?: 'text' | 'video' | 'link';
  videoSharingMode?: boolean;
  videoTaxonomy?: VideoTaxonomy;
  onManageTaxonomy?: () => void;
}) => {
  const isEdit = !!initial;
  const initialVideoPolarity = resolveVideoPolarity(initial ?? {}) ?? 'positive';
  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState(
    videoSharingMode ? VIDEO_POLARITY_LABELS[initialVideoPolarity] : initial?.category ?? '沟通表达',
  );
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? '初级');
  const [desc, setDesc] = useState(initial?.description ?? '');
  const [duration, setDuration] = useState(initial?.durationMinutes ?? 30);
  const [sections, setSections] = useState<{sectionTitle: string; contentType: string; text: string; contentUrl: string}[]>(
    initial?.content?.map(s => ({sectionTitle: s.sectionTitle, contentType: s.contentType, text: s.text ?? '', contentUrl: s.contentUrl ?? ''}))
    ?? (defaultContentType ? [{sectionTitle: '', contentType: defaultContentType, text: '', contentUrl: ''}] : [])
  );
  const [materials, setMaterials] = useState<{title: string; type: string; url: string}[]>(
    initial?.materials?.map(m => ({title: m.title, type: m.type, url: m.url ?? ''})) ?? []
  );
  type AssessmentType = 'quiz' | 'ai_review' | 'manual';
  const [passingScore, setPassingScore] = useState(initial?.assessmentConfig?.passingScore ?? 60);
  const [assessType, setAssessType] = useState<AssessmentType>(() => {
    const value = initial?.assessmentConfig?.type;
    return value === 'ai_review' || value === 'manual' ? value : 'quiz';
  });
  const [competencyDim, setCompetencyDim] = useState(initial?.competencyDimension ?? '');
  const [videoPolarity, setVideoPolarity] = useState<VideoPolarity>(initialVideoPolarity);
  const [taskCategoryId, setTaskCategoryId] = useState(initial?.taskCategoryId ?? '');
  const [videoSceneId, setVideoSceneId] = useState(initial?.videoSceneId ?? '');
  const [qualityTagIds, setQualityTagIds] = useState<string[]>(
    initial?.qualityTagIds ?? initial?.qualityTags?.map(tag => tag.id) ?? [],
  );
  const [videoSeverity, setVideoSeverity] = useState<VideoSeverity | ''>(initial?.videoSeverity ?? '');
  const [videoReviewNote, setVideoReviewNote] = useState(initial?.videoReviewNote ?? '');
  const [videoReviewStatus, setVideoReviewStatus] = useState<VideoReviewStatus | ''>(
    initial?.videoReviewStatus
      ?? (isEdit ? '' : initialVideoPolarity === 'negative' ? 'pending_review' : 'published'),
  );
  const [showContentEditor, setShowContentEditor] = useState(Boolean(defaultContentType));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingSectionIndex, setUploadingSectionIndex] = useState<number | null>(null);
  const [uploadingMaterialIndex, setUploadingMaterialIndex] = useState<number | null>(null);
  const [sectionUploadProgress, setSectionUploadProgress] = useState(0);
  const [materialUploadProgress, setMaterialUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const toast = useToast();
  const taskCategories = (videoTaxonomy?.taskCategories ?? [])
    .filter(option => option.isActive || option.id === taskCategoryId);
  const scenes = (videoTaxonomy?.scenes ?? [])
    .filter(option => option.isActive || option.id === videoSceneId);
  const qualityTags = (videoPolarity === 'positive'
    ? videoTaxonomy?.positiveTags ?? []
    : videoTaxonomy?.negativeTags ?? [])
    .filter(option => option.isActive || qualityTagIds.includes(option.id));

  const selectVideoPolarity = (next: VideoPolarity) => {
    if (next === videoPolarity) return;
    setVideoPolarity(next);
    setCategory(VIDEO_POLARITY_LABELS[next]);
    setQualityTagIds([]);
    if (next === 'positive') setVideoSeverity('');
    if (!isEdit || !videoReviewStatus) setVideoReviewStatus(next === 'negative' ? 'pending_review' : 'published');
  };

  const toggleQualityTag = (id: string) => {
    setQualityTagIds(current => current.includes(id)
      ? current.filter(item => item !== id)
      : [...current, id]);
  };

  const addSection = (contentType: 'text' | 'video' | 'link' = 'text') => setSections(s => [...s, {sectionTitle: '', contentType, text: '', contentUrl: ''}]);
  const updateSection = (i: number, field: string, val: string) => {
    setSections(s => s.map((sec, idx) => idx === i ? {...sec, [field]: val} : sec));
  };
  const removeSection = (i: number) => setSections(s => s.filter((_, idx) => idx !== i));

  const addMaterial = () => setMaterials(m => [...m, {title: '', type: 'article', url: ''}]);
  const updateMaterial = (i: number, field: string, val: string) => {
    setMaterials(m => m.map((mat, idx) => idx === i ? {...mat, [field]: val} : mat));
  };
  const removeMaterial = (i: number) => setMaterials(m => m.filter((_, idx) => idx !== i));

  const getUploadFileExtension = (fileName: string) => fileName.split('.').pop()?.toLowerCase() ?? '';
  const getUploadDisplayName = (fileName: string) => fileName.replace(/\.[^.]+$/, '').trim();
  const isUploadVideoFile = (file: File) => (
    file.type.startsWith('video/')
    || ['mp4', 'm4v', 'mov', 'webm', 'avi', 'mkv'].includes(getUploadFileExtension(file.name))
  );
  const inferMaterialType = (file: File): 'pdf' | 'video' | 'article' | 'exercise' => {
    if (isUploadVideoFile(file)) return 'video';
    const ext = getUploadFileExtension(file.name);
    if (ext === 'pdf') return 'pdf';
    if (['doc', 'docx', 'ppt', 'pptx', 'txt', 'md', 'jpg', 'jpeg', 'png', 'gif'].includes(ext)) return 'article';
    return 'exercise';
  };

  const handleUploadSectionFile = async (file: File, index: number) => {
    setUploadingSectionIndex(index);
    setSectionUploadProgress(0);
    setUploadError('');
    try {
      const result = await uploadMaterial(file, setSectionUploadProgress);
      const isVideoFile = isUploadVideoFile(file);
      const displayName = getUploadDisplayName(result.filename) || (isVideoFile ? '培训视频' : '培训资料');
      setTitle(prev => (prev.trim() || isEdit ? prev : displayName));
      setSections(prev => prev.map((section, idx) => idx === index
        ? {
            ...section,
            sectionTitle: section.sectionTitle.trim() || displayName,
            contentType: isVideoFile ? 'video' : 'link',
            contentUrl: result.url,
          }
        : section,
      ));
      toast.success(isEdit
        ? `${isVideoFile ? '视频' : '文件'}已上传，已替换当前章节地址，请点击保存修改后公开链接会使用新地址`
        : `${isVideoFile ? '视频' : '文件'}已上传，已自动填入地址，请创建课程`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '上传失败';
      setUploadError(message);
      toast.error(`上传失败：${message}`);
    } finally {
      setUploadingSectionIndex(null);
      setSectionUploadProgress(0);
    }
  };

  const handleUploadMaterialFile = async (file: File, index: number) => {
    setUploadingMaterialIndex(index);
    setMaterialUploadProgress(0);
    setUploadError('');
    try {
      const result = await uploadMaterial(file, setMaterialUploadProgress);
      const displayName = getUploadDisplayName(result.filename) || result.filename || '培训资料';
      updateMaterial(index, 'url', result.url);
      updateMaterial(index, 'type', inferMaterialType(file));
      if (!materials[index]?.title.trim()) updateMaterial(index, 'title', displayName);
      setTitle(prev => (prev.trim() || isEdit ? prev : displayName));
      toast.success(isEdit ? '素材已上传，已替换当前资料地址，请点击保存修改后公开链接会使用新地址' : '素材已上传，已自动填入地址，请创建课程');
    } catch (err) {
      const message = err instanceof Error ? err.message : '上传失败';
      setUploadError(message);
      toast.error(`上传失败：${message}`);
    } finally {
      setUploadingMaterialIndex(null);
      setMaterialUploadProgress(0);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || isSubmitting) return;
    const normalizedSections = sections
      .map((s, index) => ({
        ...s,
        sectionTitle: s.sectionTitle.trim() || (s.contentType === 'video' && s.contentUrl ? `培训视频 ${index + 1}` : ''),
      }))
      .filter(s => s.sectionTitle.trim() || s.text.trim() || s.contentUrl.trim());
    const invalidVideoSection = normalizedSections.find(s => s.contentType === 'video' && !s.contentUrl.trim());
    if (invalidVideoSection) {
      toast.error('视频章节还没有视频地址，请先上传视频或填写 URL');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        title,
        category: videoSharingMode ? VIDEO_POLARITY_LABELS[videoPolarity] : category,
        difficulty,
        description: desc,
        durationMinutes: duration,
        content: normalizedSections.map(s => ({
          sectionTitle: s.sectionTitle,
          contentType: s.contentType as 'text' | 'video' | 'link',
          text: s.text,
          contentUrl: s.contentUrl,
        })),
        materials: materials.filter(m => m.title.trim()).map(m => ({
          title: m.title,
          type: m.type as 'pdf' | 'video' | 'article' | 'exercise',
          url: m.url,
        })),
        assessmentConfig: {...initial?.assessmentConfig, type: assessType, passingScore},
        competencyDimension: competencyDim || undefined,
        ...(videoSharingMode ? {
          videoPolarity,
          taskCategoryId: taskCategoryId || null,
          videoSceneId: videoSceneId || null,
          qualityTagIds,
          videoSeverity: videoPolarity === 'negative' ? videoSeverity || null : null,
          videoReviewNote: videoReviewNote.trim() || null,
          videoReviewStatus: videoReviewStatus || null,
        } : {}),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <motion.div initial={{opacity: 0, scale: 0.95}} animate={{opacity: 1, scale: 1}}
        className="bg-surface rounded-2xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-fg mb-4">{isEdit ? '编辑培训课程' : '新建培训课程'}</h3>
        <div className="space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">课程标题 *</label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]" placeholder="输入课程标题" />
            </div>
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">时长 (分钟)</label>
              <NumericScoreInput
                value={duration}
                onChange={setDuration}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                min={1}
                max={9999}
              />
            </div>
          </div>
          {videoSharingMode ? (
            <section className="space-y-4 border-y border-border py-4">
              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-2">视频性质 *</label>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="视频性质">
                  {(['positive', 'negative'] as VideoPolarity[]).map(polarity => (
                    <button
                      key={polarity}
                      type="button"
                      role="radio"
                      aria-checked={videoPolarity === polarity}
                      onClick={() => selectVideoPolarity(polarity)}
                      className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        videoPolarity === polarity
                          ? polarity === 'positive'
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                            : 'border-rose-600 bg-rose-50 text-rose-700'
                          : 'border-border bg-surface text-fg-secondary hover:bg-surface-muted'
                      }`}
                    >
                      {polarity === 'positive'
                        ? <CheckCircle className="h-4 w-4" />
                        : <AlertTriangle className="h-4 w-4" />}
                      {VIDEO_POLARITY_LABELS[polarity]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-sm font-medium text-fg-secondary">任务分类</label>
                    {onManageTaxonomy && (
                      <button
                        type="button"
                        onClick={onManageTaxonomy}
                        title="管理任务分类"
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#1a4bc4] hover:text-[#153da0]"
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        管理分类
                      </button>
                    )}
                  </div>
                  <select
                    value={taskCategoryId}
                    onChange={event => setTaskCategoryId(event.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                  >
                    <option value="">未分类</option>
                    {taskCategories.map(option => (
                      <option key={option.id} value={option.id}>{option.name}{option.isActive ? '' : '（已停用）'}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="video-scene" className="block text-sm font-medium text-fg-secondary mb-1">场景</label>
                  <select
                    id="video-scene"
                    value={videoSceneId}
                    onChange={event => setVideoSceneId(event.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                  >
                    <option value="">待确认</option>
                    {scenes.map(option => (
                      <option key={option.id} value={option.id}>{option.name}{option.isActive ? '' : '（已停用）'}</option>
                    ))}
                  </select>
                </div>
                {videoPolarity === 'negative' ? (
                  <div>
                    <label className="block text-sm font-medium text-fg-secondary mb-1">严重程度</label>
                    <select
                      value={videoSeverity}
                      onChange={event => setVideoSeverity(event.target.value as VideoSeverity | '')}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                    >
                      <option value="">未设置</option>
                      {(Object.entries(VIDEO_SEVERITY_LABELS) as [VideoSeverity, string][]).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-fg-secondary mb-1">难度</label>
                    <select value={difficulty} onChange={e => setDifficulty(e.target.value as TrainingCourse['difficulty'])}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]">
                      <option value="初级">初级</option>
                      <option value="中级">中级</option>
                      <option value="高级">高级</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="video-review-status" className="block text-sm font-medium text-fg-secondary mb-1">审核状态</label>
                <select
                  id="video-review-status"
                  aria-label="审核状态"
                  value={videoReviewStatus}
                  onChange={event => setVideoReviewStatus(event.target.value as VideoReviewStatus | '')}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                >
                  {isEdit && !videoReviewStatus && <option value="">历史记录（保持原状态）</option>}
                  {(Object.entries(VIDEO_REVIEW_STATUS_LABELS) as [VideoReviewStatus, string][]).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-fg-faint">待审核、内部使用不会出现在公开链接中。</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-2">
                  {videoPolarity === 'positive' ? '优点标签' : '问题标签'}（可多选）
                </label>
                {qualityTags.length ? (
                  <div className="flex flex-wrap gap-2">
                    {qualityTags.map(option => {
                      const selected = qualityTagIds.includes(option.id);
                      return (
                        <label
                          key={option.id}
                          className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                            selected
                              ? videoPolarity === 'positive'
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                : 'border-rose-300 bg-rose-50 text-rose-700'
                              : 'border-border bg-surface text-fg-secondary hover:bg-surface-muted'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleQualityTag(option.id)}
                            className="h-4 w-4 accent-[#1a4bc4]"
                          />
                          {option.name}{option.isActive ? '' : '（已停用）'}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-fg-faint">当前还没有可选标签，可在“分类管理”中添加。</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1">审核说明</label>
                <textarea
                  value={videoReviewNote}
                  onChange={event => setVideoReviewNote(event.target.value)}
                  rows={2}
                  maxLength={1000}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                  placeholder={videoPolarity === 'positive' ? '例如：动作连贯，流程完整' : '例如：为配合镜头多次停顿，摆拍痕迹明显'}
                />
              </div>
            </section>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1">分类维度</label>
                <select value={category} onChange={e => setCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]">
                  {TRAINING_CATEGORIES.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1">难度</label>
                <select value={difficulty} onChange={e => setDifficulty(e.target.value as TrainingCourse['difficulty'])}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]">
                  <option value="初级">初级</option>
                  <option value="中级">中级</option>
                  <option value="高级">高级</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1">胜任力维度</label>
                <input value={competencyDim} onChange={e => setCompetencyDim(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]" placeholder="可选" />
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1">课程描述</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]" placeholder="描述课程内容和学习目标" />
          </div>

          {/* Content Sections Toggle */}
          {uploadError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              上传失败：{uploadError}
            </div>
          )}

          <div className="border-t pt-4">
            <button onClick={() => setShowContentEditor(v => !v)}
              className="flex items-center gap-2 text-sm font-medium text-[#1a4bc4] hover:text-[#153da0]">
              <ChevronRight className={`w-4 h-4 transition-transform ${showContentEditor ? 'rotate-90' : ''}`} />
              课程章节内容 ({sections.length})
            </button>
            {showContentEditor && (
              <div className="mt-3 space-y-3">
                {sections.map((sec, i) => (
                  <div key={i} className="flex items-start gap-2 bg-surface-muted p-3 rounded-lg">
                    <div className="flex-1 space-y-2">
                      <input value={sec.sectionTitle} onChange={e => updateSection(i, 'sectionTitle', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm" placeholder="章节标题" />
                      <div className="flex gap-2">
                        <select value={sec.contentType} onChange={e => updateSection(i, 'contentType', e.target.value)}
                          className="px-2 py-1 border rounded text-sm">
                          <option value="text">文字</option>
                          <option value="video">视频</option>
                          <option value="link">链接</option>
                        </select>
                        {sec.contentType === 'text' ? (
                          <div className="flex-1 space-y-1.5">
                            <textarea value={sec.text} onChange={e => updateSection(i, 'text', e.target.value)}
                              className="w-full px-2 py-1 border rounded text-sm font-mono" rows={6}
                              placeholder="输入带时间戳的文字稿内容，格式如：&#10;00:00:00 - 欢迎参加本次培训&#10;00:05:30 - 今天我们学习STAR法则&#10;00:10:15 - 第一个案例分析" />
                            <div className="flex items-center gap-2">
                              <label className="shrink-0 px-2 py-1 bg-surface-muted hover:bg-surface-muted text-fg-muted rounded text-xs cursor-pointer transition-colors flex items-center gap-1">
                                <Upload className="w-3 h-3" /> 上传 .txt/.srt 文字稿
                                <input type="file" className="hidden" accept=".txt,.srt,.vtt"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    try {
                                      const text = await file.text();
                                      let parsed = text;
                                      // Parse SRT format: 1\n00:00:00,000 --> 00:00:05,000\nText
                                      if (file.name.endsWith('.srt')) {
                                        const blocks = text.trim().split(/\n\n+/);
                                        parsed = blocks.map(block => {
                                          const lines = block.split('\n');
                                          const timeLine = lines.find(l => l.includes('-->'));
                                          if (!timeLine) return '';
                                          const startTime = timeLine.split('-->')[0].trim().split(',')[0];
                                          const content = lines.slice(lines.indexOf(timeLine) + 1).join(' ').trim();
                                          return content ? `${startTime} - ${content}` : '';
                                        }).filter(Boolean).join('\n');
                                      }
                                      // Parse VTT format similarly
                                      if (file.name.endsWith('.vtt')) {
                                        const blocks = text.replace(/^WEBVTT.*\n*/i, '').trim().split(/\n\n+/);
                                        parsed = blocks.map(block => {
                                          const lines = block.split('\n');
                                          const timeLine = lines.find(l => l.includes('-->'));
                                          if (!timeLine) return '';
                                          const startTime = timeLine.split('-->')[0].trim().split('.')[0];
                                          const content = lines.slice(lines.indexOf(timeLine) + 1).join(' ').replace(/<[^>]+>/g, '').trim();
                                          return content ? `${startTime} - ${content}` : '';
                                        }).filter(Boolean).join('\n');
                                      }
                                      updateSection(i, 'text', parsed || text);
                                    } catch (err) { console.error('Parse failed:', err); }
                                  }} />
                              </label>
                              <span className="text-[10px] text-fg-faint">支持 .txt（时间戳格式）、.srt、.vtt 自动解析</span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex-1 flex flex-wrap gap-2">
                            <input value={sec.contentUrl} onChange={e => updateSection(i, 'contentUrl', e.target.value)}
                              className="min-w-0 flex-1 px-2 py-1 border rounded text-sm" placeholder="URL" />
                            <label role="button" aria-disabled={uploadingSectionIndex !== null} className={`shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 border ${
                              uploadingSectionIndex === i
                                ? 'border-indigo-200 bg-indigo-50 text-indigo-600 cursor-wait'
                                : 'border-border bg-surface hover:bg-surface-muted text-fg-secondary cursor-pointer shadow-sm'
                            }`}>
                              {uploadingSectionIndex === i ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                              {uploadingSectionIndex === i ? `上传 ${sectionUploadProgress}%` : '本地上传'}
                              <input type="file" className="hidden"
                                disabled={uploadingSectionIndex !== null}
                                accept={sec.contentType === 'video' ? '.mp4,.m4v,.mov,.webm,.avi,.mkv' : '.pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.jpg,.jpeg,.png,.gif,.mp4,.m4v,.mov,.webm,.zip,.rar'}
                                onChange={async (e) => {
                                  const input = e.currentTarget;
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  input.value = '';
                                  await handleUploadSectionFile(file, i);
                                }} />
                            </label>
                          </div>
                        )}
                        {sec.contentType === 'video' && (
                          <p className="text-[10px] text-fg-faint">
                            视频会直传对象存储。编辑已有视频时，上传完成后需要点击底部「保存修改」才会更新公开链接。
                          </p>
                        )}
                      </div>
                    </div>
                    <button onClick={() => removeSection(i)} className="text-red-400 hover:text-red-600 text-xs mt-1">删除</button>
                  </div>
                ))}
                <button onClick={() => addSection(isEdit ? 'text' : 'video')} className="text-xs px-3 py-1.5 bg-surface-muted text-fg-secondary rounded-lg hover:bg-surface-muted">
                  + 添加{isEdit ? '' : '视频'}章节
                </button>
              </div>
            )}
          </div>

          {/* Materials */}
          <div className="border-t pt-4">
            <button onClick={() => {}} className="flex items-center gap-2 text-sm font-medium text-fg-muted mb-2">
              参考资料 ({materials.length})
            </button>
            {materials.map((mat, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <input value={mat.title} onChange={e => updateMaterial(i, 'title', e.target.value)}
                  className="flex-1 px-2 py-1 border rounded text-sm" placeholder="参考资料标题" />
                <select value={mat.type} onChange={e => updateMaterial(i, 'type', e.target.value)}
                  className="px-2 py-1 border rounded text-sm">
                  <option value="article">文章</option>
                  <option value="pdf">PDF</option>
                  <option value="video">视频</option>
                  <option value="exercise">练习</option>
                </select>
                <input value={mat.url} onChange={e => updateMaterial(i, 'url', e.target.value)}
                  className="w-40 px-2 py-1 border rounded text-sm" placeholder="URL (可选)" />
                <label className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1 ${
                  uploadingMaterialIndex === i
                    ? 'bg-indigo-50 text-indigo-600 cursor-wait'
                    : 'bg-surface-muted hover:bg-surface-muted text-fg-secondary cursor-pointer'
                }`}>
                  {uploadingMaterialIndex === i ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                  {uploadingMaterialIndex === i ? `上传 ${materialUploadProgress}%` : '上传'}
                  <input type="file" className="hidden" accept=".pdf,.doc,.docx,.ppt,.pptx,.mp4,.m4v,.mov,.webm,.avi,.mkv,.jpg,.jpeg,.png,.gif"
                    disabled={uploadingMaterialIndex !== null}
                    onChange={async (e) => {
                      const input = e.currentTarget;
                      const file = e.target.files?.[0];
                      if (!file) return;
                      input.value = '';
                      await handleUploadMaterialFile(file, i);
                    }} />
                </label>
                <button onClick={() => removeMaterial(i)} className="text-red-400 hover:text-red-600 text-xs">删除</button>
              </div>
            ))}
            <button onClick={addMaterial} className="text-xs px-3 py-1.5 bg-surface-muted text-fg-secondary rounded-lg hover:bg-surface-muted">
              + 添加参考资料
            </button>
          </div>

          {/* Assessment Config */}
          <div className="border-t pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1">考核方式</label>
                <select value={assessType} onChange={e => setAssessType(e.target.value as AssessmentType)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]">
                  <option value="quiz">测验</option>
                  <option value="ai_review">AI 评审</option>
                  <option value="manual">人工评审</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1">及格分数</label>
                <NumericScoreInput
                  value={passingScore}
                  onChange={setPassingScore}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                  min={0}
                  max={100}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-fg-secondary hover:bg-surface-muted rounded-lg">取消</button>
          <button onClick={handleSubmit}
            className="px-4 py-2 text-sm bg-[#1a4bc4] text-white rounded-lg hover:bg-[#153da0] disabled:opacity-50 flex items-center gap-2"
            disabled={!title.trim() || isSubmitting}>
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? (isEdit ? '保存中...' : '创建中...') : (isEdit ? '保存修改' : '创建课程')}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const PathsTab = ({paths, courses, onAdd, onEdit, onDelete, onEnrollmentClick, onBatchEnroll}: {
  paths: LearningPath[];
  courses: TrainingCourse[];
  onAdd: () => void;
  onEdit: (path: LearningPath) => void;
  onDelete: (id: string) => void;
  onEnrollmentClick: (pathId: string) => void;
  onBatchEnroll: () => void;
}) => {
  const [filter, setFilter] = useState('');
  const categories = [...new Set(paths.map(p => p.category))];
  const filtered = filter ? paths.filter(p => p.category === filter) : paths;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button onClick={() => setFilter('')} className={`px-3 py-1.5 rounded-lg text-sm ${!filter ? 'bg-[#1a4bc4] text-white' : 'bg-surface-muted text-fg-secondary hover:bg-surface-muted'}`}>
            全部
          </button>
          {categories.map(cat => (
            <button key={cat} onClick={() => setFilter(cat)} className={`px-3 py-1.5 rounded-lg text-sm ${filter === cat ? 'bg-[#1a4bc4] text-white' : 'bg-surface-muted text-fg-secondary hover:bg-surface-muted'}`}>
              {cat}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {paths.length > 0 && (
            <button onClick={onBatchEnroll} className="flex items-center gap-2 px-4 py-2 bg-surface border border-border text-fg-secondary rounded-lg text-sm hover:bg-surface-muted transition-colors">
              <Users className="w-4 h-4" /> 批量报名
            </button>
          )}
          <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm hover:bg-[#153da0] transition-colors">
            <Plus className="w-4 h-4" /> 新建学习路径
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-fg-faint bg-surface rounded-xl border border-border">
          <MapPin className="w-12 h-12 mx-auto mb-4 opacity-40" />
          <p className="text-sm font-medium mb-1">还没有学习路径</p>
          <p className="text-xs text-fg-faint mb-4">创建结构化的多课程培训路径，引导学员循序渐进完成学习</p>
          <button onClick={onAdd} className="px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm hover:bg-[#153da0]">
            创建第一条路径
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(path => {
            const requiredCount = path.courses.filter(c => c.isRequired).length;
            const optionalCount = path.courses.filter(c => !c.isRequired).length;
            return (
              <div key={path.id} className="bg-surface rounded-xl border border-border p-5 hover:shadow-md transition-shadow group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-fg text-sm truncate">{path.title}</h3>
                      {path.isCertified && (
                        <span className="shrink-0 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium">认证</span>
                      )}
                    </div>
                    <p className="text-xs text-fg-muted line-clamp-2">{path.description || '暂无描述'}</p>
                  </div>
                  <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => onEdit(path)} className="p-1.5 text-fg-faint hover:text-[#1a4bc4] hover:bg-blue-50 rounded-lg transition-colors" title="编辑">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onDelete(path.id)} className="p-1.5 text-fg-faint hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="删除">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[path.category] ?? 'bg-surface-muted text-fg-secondary'}`}>
                    {path.category}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${(DIFFICULTY_LABELS[path.level]?.color ?? 'bg-surface-muted text-fg-secondary')}`}>
                    {DIFFICULTY_LABELS[path.level]?.label ?? path.level}
                  </span>
                </div>

                {path.courses.length > 0 && (
                  <div className="mb-3 space-y-1.5">
                    {path.courses.slice(0, 3).map((pc, i) => (
                      <div key={pc.id} className="flex items-center gap-2 text-xs">
                        <span className="w-5 h-5 rounded bg-surface-muted text-fg-muted flex items-center justify-center text-[10px] font-medium shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-fg-secondary truncate">{pc.course.title}</span>
                        {!pc.isRequired && <span className="text-[10px] text-fg-faint shrink-0">选修</span>}
                      </div>
                    ))}
                    {path.courses.length > 3 && (
                      <div className="text-xs text-fg-faint pl-7">+{path.courses.length - 3} 门课程</div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-fg-faint pt-3 border-t border-border-subtle">
                  <span className="flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    {requiredCount > 0 && <span>{requiredCount} 必修</span>}
                    {requiredCount > 0 && optionalCount > 0 && <span>·</span>}
                    {optionalCount > 0 && <span>{optionalCount} 选修</span>}
                    {path.courses.length === 0 && '暂无课程'}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onEnrollmentClick(path.id); }}
                    className="flex items-center gap-1 text-[#1a4bc4] hover:text-[#153da0] hover:underline transition-colors"
                  >
                    <Users className="w-3 h-3" />
                    {path.enrolledCount} 人已报名
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const PathFormModal = ({courses, initial, onClose, onSubmit}: {
  courses: TrainingCourse[];
  initial?: LearningPath;
  onClose: () => void;
  onSubmit: (input: {
    title: string; description: string; category: string; level: string;
    isCertified: boolean; courseIds: string[];
  }) => Promise<void>;
}) => {
  const isEdit = !!initial;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState(initial?.category ?? '综合');
  type LearningPathLevel = '初级' | '中级' | '高级';
  const [level, setLevel] = useState<LearningPathLevel>(() => {
    const value = initial?.level;
    return value === '中级' || value === '高级' ? value : '初级';
  });
  const [desc, setDesc] = useState(initial?.description ?? '');
  const [isCertified, setIsCertified] = useState(initial?.isCertified ?? false);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>(
    initial?.courses?.map(c => c.courseId) ?? [],
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleCourse = (courseId: string) => {
    setSelectedCourseIds(prev =>
      prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId],
    );
  };

  const moveCourse = (index: number, direction: -1 | 1) => {
    const newIds = [...selectedCourseIds];
    const target = index + direction;
    if (target < 0 || target >= newIds.length) return;
    [newIds[index], newIds[target]] = [newIds[target], newIds[index]];
    setSelectedCourseIds(newIds);
  };

  const handleSubmit = async () => {
    if (!title.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit({
        title,
        description: desc,
        category,
        level,
        isCertified,
        courseIds: selectedCourseIds,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCourses = selectedCourseIds
    .map(id => courses.find(c => c.id === id))
    .filter(Boolean) as TrainingCourse[];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <motion.div initial={{opacity: 0, scale: 0.95}} animate={{opacity: 1, scale: 1}}
        className="bg-surface rounded-2xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-fg mb-4">
          {isEdit ? '编辑学习路径' : '新建学习路径'}
        </h3>

        <div className="space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">路径名称 *</label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                placeholder="例如：前端开发工程师入职培训" />
            </div>
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">分类</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]">
                <option value="沟通表达">沟通表达</option>
                <option value="专业能力">专业能力</option>
                <option value="应变能力">应变能力</option>
                <option value="综合素质">综合素质</option>
                <option value="综合">综合</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">难度等级</label>
              <select value={level} onChange={e => setLevel(e.target.value as LearningPathLevel)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]">
                <option value="初级">初级</option>
                <option value="中级">中级</option>
                <option value="高级">高级</option>
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isCertified} onChange={e => setIsCertified(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-[#1a4bc4] focus:ring-[#1a4bc4]" />
                <span className="text-sm text-fg-secondary">认证路径 (完成后颁发证书)</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1">路径描述</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
              placeholder="描述该学习路径的目标和适用人群" />
          </div>

          {/* Course Selection */}
          <div className="border-t pt-4">
            <label className="block text-sm font-medium text-fg-secondary mb-2">
              包含课程 ({selectedCourseIds.length})
            </label>

            {/* Selected courses (ordered) */}
            {selectedCourses.length > 0 && (
              <div className="space-y-2 mb-4">
                {selectedCourses.map((course, idx) => (
                  <div key={course.id} className="flex items-center gap-3 bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveCourse(idx, -1)} disabled={idx === 0}
                        className="text-fg-faint hover:text-fg-secondary disabled:opacity-30 disabled:cursor-not-allowed">
                        <ChevronRight className="w-4 h-4 rotate-180" />
                      </button>
                      <button onClick={() => moveCourse(idx, 1)} disabled={idx === selectedCourses.length - 1}
                        className="text-fg-faint hover:text-fg-secondary disabled:opacity-30 disabled:cursor-not-allowed">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                    <span className="w-5 h-5 rounded-full bg-[#1a4bc4] text-white text-[10px] flex items-center justify-center font-medium shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-fg truncate">{course.title}</div>
                      <div className="text-xs text-fg-muted">{course.category} · {course.durationMinutes}分钟</div>
                    </div>
                    <button onClick={() => toggleCourse(course.id)}
                      className="text-red-400 hover:text-red-600 text-xs shrink-0">移除</button>
                  </div>
                ))}
              </div>
            )}

            {/* Available courses */}
            <div className="max-h-48 overflow-y-auto border border-border rounded-lg">
              {courses.filter(c => !selectedCourseIds.includes(c.id)).length === 0 ? (
                <div className="text-center py-6 text-fg-faint text-sm">
                  {courses.length === 0 ? '暂无可选课程，请先创建课程' : '所有课程已添加'}
                </div>
              ) : (
                courses.filter(c => !selectedCourseIds.includes(c.id)).map(course => (
                  <button key={course.id}
                    onClick={() => toggleCourse(course.id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-muted text-left border-b border-border-subtle last:border-0 transition-colors">
                    <Plus className="w-4 h-4 text-[#1a4bc4] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-fg truncate">{course.title}</div>
                      <div className="text-xs text-fg-faint">{course.category} · {DIFFICULTY_LABELS[course.difficulty]?.label} · {course.durationMinutes}分钟</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-fg-secondary hover:bg-surface-muted rounded-lg">取消</button>
          <button onClick={handleSubmit}
            className="px-4 py-2 text-sm bg-[#1a4bc4] text-white rounded-lg hover:bg-[#153da0] disabled:opacity-50 flex items-center gap-2"
            disabled={!title.trim() || isSubmitting}>
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? '保存中...' : (isEdit ? '保存修改' : '创建路径')}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ─── Path Enrollment Modal ─────────────────────────────────────────────────

const PathEnrollmentModal = ({pathId, onClose}: {pathId: string; onClose: () => void}) => {
  const [enrollments, setEnrollments] = useState<PathEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{id: string; name: string}[]>([]);
  const [enrolling, setEnrolling] = useState<string | null>(null);

  useEffect(() => { loadEnrollments(); }, [pathId]);

  const loadEnrollments = async () => {
    setLoading(true);
    try {
      const result = await getPathEnrollments(pathId);
      setEnrollments(result.items);
    } catch (err) { console.error('Failed to load enrollments:', err); }
    finally { setLoading(false); }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const token = getAuthToken?.() ?? '';
      const url = `${buildEdgeFunctionUrl('/candidate-ops')}?search=${encodeURIComponent(searchQuery)}&pageSize=20`;
      const res = await fetch(url, {headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})}});
      const data = await res.json();
      const items = (data.items ?? data.data ?? []) as Record<string, unknown>[];
      setSearchResults(items.map((c: Record<string, unknown>) => ({id: String(c.id ?? ''), name: String(c.name ?? '')})));
    } catch (err) { console.error('Search failed:', err); }
    finally { setSearching(false); }
  };

  const handleEnroll = async (candidateId: string) => {
    setEnrolling(candidateId);
    try {
      await enrollCandidateInPath(pathId, candidateId);
      await loadEnrollments();
      setSearchResults(prev => prev.filter(c => c.id !== candidateId));
    } catch (err) { console.error('Enroll failed:', err); }
    finally { setEnrolling(null); }
  };

  const handleUpdate = async (enrollmentId: string, field: 'status' | 'progressPct', value: string | number) => {
    try {
      const updates = field === 'status' ? {status: value as string} : {progressPct: value as number};
      await updatePathEnrollment(pathId, enrollmentId, updates);
      await loadEnrollments();
    } catch (err) { console.error('Update failed:', err); }
  };

  const handleDelete = async (enrollmentId: string) => {
    if (!confirm('确定要取消该学员的报名吗？')) return;
    try {
      await deletePathEnrollment(pathId, enrollmentId);
      setEnrollments(prev => prev.filter(e => e.id !== enrollmentId));
    } catch (err) { console.error('Delete failed:', err); }
  };

  const completedCount = enrollments.filter(e => e.status === 'completed').length;
  const inProgressCount = enrollments.filter(e => e.status === 'in_progress' || e.status === 'enrolled').length;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <motion.div initial={{opacity: 0, scale: 0.95}} animate={{opacity: 1, scale: 1}}
        className="bg-surface rounded-2xl p-6 w-full max-w-3xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-fg">路径报名管理</h3>
          <button onClick={onClose} className="p-1.5 text-fg-faint hover:text-fg-secondary rounded-lg hover:bg-surface-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Summary */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-blue-700">{enrollments.length}</div>
            <div className="text-xs text-blue-500">总报名人数</div>
          </div>
          <div className="bg-emerald-50 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-emerald-700">{completedCount}</div>
            <div className="text-xs text-emerald-500">已完成</div>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-amber-700">{inProgressCount}</div>
            <div className="text-xs text-amber-500">进行中</div>
          </div>
        </div>

        {/* Candidate Search + Enroll */}
        <div className="mb-5 p-4 bg-surface-muted rounded-xl">
          <label className="block text-sm font-medium text-fg-secondary mb-2">添加候选人</label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-faint" />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                placeholder="搜索候选人姓名..." />
            </div>
            <button onClick={handleSearch} disabled={searching || !searchQuery.trim()}
              className="px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm hover:bg-[#153da0] disabled:opacity-50">
              {searching ? '搜索中...' : '搜索'}
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 border border-border rounded-lg divide-y divide-border-subtle max-h-40 overflow-y-auto bg-surface">
              {searchResults.map(c => {
                const alreadyEnrolled = enrollments.some(e => e.candidateId === c.id);
                return (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm text-fg">{c.name}</span>
                    {alreadyEnrolled ? (
                      <span className="text-xs text-fg-faint">已报名</span>
                    ) : (
                      <button onClick={() => handleEnroll(c.id)} disabled={enrolling === c.id}
                        className="text-xs px-3 py-1 bg-[#1a4bc4] text-white rounded-lg hover:bg-[#153da0] disabled:opacity-50">
                        {enrolling === c.id ? '报名中...' : '报名'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Enrollment List */}
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-fg-faint" /></div>
        ) : enrollments.length === 0 ? (
          <div className="text-center py-8 text-fg-faint">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">暂无学员报名此路径</p>
            <p className="text-xs mt-1">使用上方搜索添加候选人</p>
          </div>
        ) : (
          <div className="overflow-hidden border border-border rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-muted border-b border-border">
                  <th className="text-left px-4 py-3 text-fg-muted font-medium">姓名</th>
                  <th className="text-center px-4 py-3 text-fg-muted font-medium">状态</th>
                  <th className="text-center px-4 py-3 text-fg-muted font-medium">进度</th>
                  <th className="text-center px-4 py-3 text-fg-muted font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map(enrollment => (
                  <tr key={enrollment.id} className="border-b border-border-subtle hover:bg-surface-muted">
                    <td className="px-4 py-3 font-medium text-fg">
                      {enrollment.candidateName || enrollment.candidateId}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <select value={enrollment.status}
                        onChange={e => handleUpdate(enrollment.id, 'status', e.target.value)}
                        className="px-2 py-1 border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#1a4bc4]">
                        <option value="enrolled">已报名</option>
                        <option value="in_progress">学习中</option>
                        <option value="completed">已完成</option>
                        <option value="failed">未通过</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center gap-2 justify-center">
                        <input type="range" min="0" max="100" value={enrollment.progressPct}
                          onChange={e => handleUpdate(enrollment.id, 'progressPct', Number(e.target.value))}
                          className="w-16 h-1.5 accent-[#1a4bc4]" />
                        <span className="text-xs text-fg-muted w-8">{enrollment.progressPct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => handleDelete(enrollment.id)}
                        className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded transition-colors">
                        取消报名
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
};

// ─── Batch Enrollment Modal ─────────────────────────────────────────────────

const BatchEnrollModal = ({courses, paths, onClose, onDone}: {
  courses: TrainingCourse[];
  paths: LearningPath[];
  onClose: () => void;
  onDone: () => void;
}) => {
  const [targetType, setTargetType] = useState<'course' | 'path'>('course');
  const [targetId, setTargetId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{id: string; name: string}[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<{id: string; name: string}[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BatchEnrollResult | null>(null);

  const targets = targetType === 'course' ? courses : paths;
  const activeTargets = targetType === 'course'
    ? targets.filter((c: TrainingCourse) => c.isActive)
    : targets;

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const token = getAuthToken?.() ?? '';
      const url = `${buildEdgeFunctionUrl('/candidate-ops')}?search=${encodeURIComponent(searchQuery)}&pageSize=20`;
      const res = await fetch(url, {headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})}});
      const data = await res.json();
      const items = (data.items ?? data.data ?? []) as Record<string, unknown>[];
      setSearchResults(items.map((c: Record<string, unknown>) => ({id: String(c.id ?? ''), name: String(c.name ?? '')})));
    } catch (err) { console.error('Search failed:', err); }
    finally { setSearching(false); }
  };

  const toggleCandidate = (c: {id: string; name: string}) => {
    setSelectedCandidates(prev =>
      prev.some(x => x.id === c.id) ? prev.filter(x => x.id !== c.id) : [...prev, c]
    );
  };

  const handleSubmit = async () => {
    if (!targetId || selectedCandidates.length === 0) return;
    setSubmitting(true);
    try {
      const r = await batchEnroll({
        candidateIds: selectedCandidates.map(c => c.id),
        ...(targetType === 'course' ? {courseId: targetId} : {pathId: targetId}),
      });
      setResult(r);
    } catch (err) { console.error('Batch enroll failed:', err); }
    finally { setSubmitting(false); }
  };

  const handleClose = () => {
    if (result) { onDone(); } else { onClose(); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={handleClose}>
      <motion.div initial={{opacity: 0, scale: 0.95}} animate={{opacity: 1, scale: 1}}
        className="bg-surface rounded-2xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-fg">批量报名</h3>
          <button onClick={handleClose} className="p-1.5 text-fg-faint hover:text-fg-secondary rounded-lg hover:bg-surface-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        {result ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-emerald-700">{result.enrolled.length}</div>
                <div className="text-xs text-emerald-500">成功报名</div>
              </div>
              <div className="bg-amber-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-amber-700">{result.skipped.length}</div>
                <div className="text-xs text-amber-500">跳过</div>
              </div>
            </div>
            {result.skipped.length > 0 && (
              <div className="text-sm text-fg-muted">
                <p className="font-medium mb-1">跳过详情：</p>
                {result.skipped.map(s => (
                  <div key={s.candidateId} className="text-xs text-fg-faint">· {s.candidateId}: {s.reason}</div>
                ))}
              </div>
            )}
            <button onClick={handleClose} className="w-full py-2.5 bg-[#1a4bc4] text-white rounded-lg text-sm hover:bg-[#153da0]">
              完成
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Target Selection */}
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-2">报名目标</label>
              <div className="flex gap-2 mb-3">
                <button onClick={() => { setTargetType('course'); setTargetId(''); }}
                  className={`px-4 py-2 rounded-lg text-sm ${targetType === 'course' ? 'bg-[#1a4bc4] text-white' : 'bg-surface-muted text-fg-secondary'}`}>
                  课程
                </button>
                <button onClick={() => { setTargetType('path'); setTargetId(''); }}
                  className={`px-4 py-2 rounded-lg text-sm ${targetType === 'path' ? 'bg-[#1a4bc4] text-white' : 'bg-surface-muted text-fg-secondary'}`}>
                  学习路径
                </button>
              </div>
              <select value={targetId} onChange={e => setTargetId(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]">
                <option value="">选择{targetType === 'course' ? '课程' : '学习路径'}...</option>
                {activeTargets.map((t: TrainingCourse | LearningPath) => (
                  <option key={t.id} value={t.id}>
                    {t.title} {(t as LearningPath).category ? `· ${(t as LearningPath).category}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Candidate Search */}
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-2">选择候选人</label>
              <div className="flex gap-2 mb-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-faint" />
                  <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                    placeholder="搜索候选人姓名..." />
                </div>
                <button onClick={handleSearch} disabled={searching}
                  className="px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm hover:bg-[#153da0] disabled:opacity-50">
                  {searching ? '搜索中...' : '搜索'}
                </button>
              </div>

              {/* Selected candidates */}
              {selectedCandidates.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {selectedCandidates.map(c => (
                    <span key={c.id} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs">
                      {c.name}
                      <button onClick={() => toggleCandidate(c)} className="hover:text-blue-900"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}

              {/* Search results */}
              {searchResults.length > 0 && (
                <div className="border border-border rounded-lg divide-y divide-border-subtle max-h-48 overflow-y-auto">
                  {searchResults.map(c => {
                    const isSelected = selectedCandidates.some(s => s.id === c.id);
                    return (
                      <label key={c.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-surface-muted ${isSelected ? 'bg-blue-50' : ''}`}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleCandidate(c)}
                          className="w-4 h-4 rounded border-border text-[#1a4bc4] focus:ring-[#1a4bc4]" />
                        <span className="text-sm text-fg">{c.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={handleClose} className="px-4 py-2 text-sm text-fg-secondary hover:bg-surface-muted rounded-lg">取消</button>
              <button onClick={handleSubmit} disabled={!targetId || selectedCandidates.length === 0 || submitting}
                className="px-4 py-2 text-sm bg-[#1a4bc4] text-white rounded-lg hover:bg-[#153da0] disabled:opacity-50 flex items-center gap-2">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? '提交中...' : `报名 ${selectedCandidates.length} 人`}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default TrainingAcademyPage;
