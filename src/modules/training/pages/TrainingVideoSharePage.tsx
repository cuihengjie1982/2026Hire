import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {motion} from 'motion/react';
import {Loader2, PlayCircle, Settings2, Share2, Upload} from 'lucide-react';
import {
  createVideoTaxonomyOption,
  createCourse,
  deleteVideoTaxonomyOption,
  deleteCourse,
  listPublicVideoShareCourses,
  listCourses,
  listVideoTaxonomy,
  updateCourse,
  updateVideoTaxonomyOption,
  type TrainingCourse,
  type VideoPolarity,
  type VideoReviewStatus,
  type VideoSeverity,
  type VideoTaxonomy,
} from '../api';
import {CreateCourseModal, VideoShareTab} from './TrainingAcademyPage';
import {getCurrentUser} from '../../settings/api';
import {getAuthToken} from '../../../shared/lib/runtime';
import {EMPTY_VIDEO_TAXONOMY} from '../videoTaxonomy';
import {VideoTaxonomyManager} from '../components/VideoTaxonomyManager';

type VideoCourseInput = {
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
};

export const TrainingVideoSharePage = () => {
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateCourse, setShowCreateCourse] = useState(false);
  const [editingCourse, setEditingCourse] = useState<TrainingCourse | null>(null);
  const [taxonomy, setTaxonomy] = useState<VideoTaxonomy>(EMPTY_VIDEO_TAXONOMY);
  const [showTaxonomyManager, setShowTaxonomyManager] = useState(false);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const navigate = useNavigate();
  const hasAuthToken = Boolean(getAuthToken());
  const isPublicAccess = !hasAuthToken;
  const canManage = hasAuthToken && currentRole !== null && currentRole !== 'video_viewer';

  const hasActionCaptions = (course: TrainingCourse) => {
    if ((course.assessmentConfig.actionCaptions?.length ?? 0) > 0) return true;
    return Object.values(course.assessmentConfig.actionCaptionsByUrl ?? {}).some(captions => captions.length > 0);
  };

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      if (isPublicAccess) {
        const result = await listPublicVideoShareCourses();
        setCourses(result.items);
        return;
      }
      try {
        const result = await listCourses();
        setCourses(result.items);
      } catch (e) {
        const message = e instanceof Error ? e.message : '';
        const isAuthError = /token|unauthorized|401|expired|auth/i.test(message);
        if (!isAuthError) throw e;
        const result = await listPublicVideoShareCourses();
        setCourses(result.items);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载视频课程失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!hasAuthToken) {
      setCurrentRole('public');
      return;
    }
    let mounted = true;
    getCurrentUser()
      .then(user => {
        if (mounted) setCurrentRole(user.role);
      })
      .catch(e => {
        console.warn('[VideoShare] Failed to resolve current user role:', e);
      });
    return () => { mounted = false; };
  }, [hasAuthToken]);

  const loadTaxonomy = async () => {
    try {
      setTaxonomy(await listVideoTaxonomy(true));
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载视频分类失败');
    }
  };

  useEffect(() => {
    if (canManage) void loadTaxonomy();
  }, [canManage]);

  useEffect(() => {
    if (canManage) return;
    setShowCreateCourse(false);
    setEditingCourse(null);
    setShowTaxonomyManager(false);
  }, [canManage]);

  const handleCreateCourse = async (input: VideoCourseInput) => {
    await createCourse({
      ...input,
      category: input.category || '综合',
      difficulty: input.difficulty as '初级' | '中级' | '高级',
      content: input.content?.map(section => ({
        ...section,
        contentType: section.contentType as 'text' | 'video' | 'link',
      })),
      materials: input.materials?.map(material => ({
        ...material,
        type: material.type as 'pdf' | 'video' | 'article' | 'exercise',
      })),
    } as Parameters<typeof createCourse>[0]);
    setShowCreateCourse(false);
    await loadData();
  };

  const handleUpdateCourse = async (input: VideoCourseInput) => {
    if (!editingCourse) return;
    await updateCourse(editingCourse.id, input as Parameters<typeof updateCourse>[1]);
    setEditingCourse(null);
    await loadData();
  };

  const handleDeleteCourse = async (course: TrainingCourse) => {
    if (!confirm(`确定要删除视频「${course.title}」吗？删除后已复制出去的公开链接也将不可用。`)) return;
    setError('');
    try {
      await deleteCourse(course.id);
      if (editingCourse?.id === course.id) setEditingCourse(null);
      setCourses(prev => prev.filter(item => item.id !== course.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除视频失败');
    }
  };

  if (loading) {
    return (
      <div className="max-w-[1500px] mx-auto w-full p-6">
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-4">
          <div className="h-7 w-44 rounded-lg bg-surface-muted animate-pulse" />
          <div className="h-28 rounded-xl bg-surface-muted animate-pulse" />
          <div className="h-72 rounded-xl bg-surface-muted animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1500px] mx-auto w-full p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#111827] rounded-xl flex items-center justify-center">
            <Share2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-fg">视频分享</h1>
            <p className="text-sm text-fg-muted">
              {isPublicAccess
                ? '公开培训资料库，无需登录即可打开视频和文档。'
                : '面向已入职员工的公开培训视频，可微信转发、免登录观看、生成实时动作流。'}
            </p>
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTaxonomyManager(true)}
              className="flex items-center justify-center gap-2 px-4 py-2 border border-border bg-surface text-fg-secondary rounded-lg text-sm hover:bg-surface-muted transition-colors"
            >
              <Settings2 className="w-4 h-4" /> 分类管理
            </button>
            <button
              onClick={() => setShowCreateCourse(true)}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm hover:bg-[#153da0] transition-colors"
            >
              <Upload className="w-4 h-4" /> 新建视频
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div initial={{opacity: 0, y: 8}} animate={{opacity: 1, y: 0}} className="bg-surface rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <PlayCircle className="w-4 h-4 text-[#1a4bc4]" />
            可分享视频
          </div>
          <p className="mt-2 text-2xl font-bold text-fg">
            {courses.filter(course =>
              course.content.some(section => section.contentType === 'video' && section.contentUrl)
              || course.materials.some(material => material.type === 'video' && material.url),
            ).length}
          </p>
        </motion.div>
        <motion.div initial={{opacity: 0, y: 8}} animate={{opacity: 1, y: 0}} transition={{delay: 0.04}} className="bg-surface rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <Share2 className="w-4 h-4 text-emerald-600" />
            已生成动作流
          </div>
          <p className="mt-2 text-2xl font-bold text-fg">
            {courses.filter(hasActionCaptions).length}
          </p>
        </motion.div>
        <motion.div initial={{opacity: 0, y: 8}} animate={{opacity: 1, y: 0}} transition={{delay: 0.08}} className="bg-surface rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <Loader2 className="w-4 h-4 text-fg-muted" />
            总课程
          </div>
          <p className="mt-2 text-2xl font-bold text-fg">{courses.length}</p>
        </motion.div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <VideoShareTab
        courses={courses}
        readonly={!canManage}
        onAddCourse={canManage ? () => setShowCreateCourse(true) : undefined}
        onEditCourse={canManage ? setEditingCourse : undefined}
        onDeleteCourse={canManage ? handleDeleteCourse : undefined}
        onPreview={(courseId) => navigate(`/training/preview?courseId=${courseId}`)}
        onCaptionsGenerated={canManage ? loadData : undefined}
        publicAccess={isPublicAccess}
      />

      {showCreateCourse && (
        <CreateCourseModal
          defaultContentType="video"
          videoSharingMode
          videoTaxonomy={taxonomy}
          onManageTaxonomy={() => setShowTaxonomyManager(true)}
          onClose={() => setShowCreateCourse(false)}
          onSubmit={handleCreateCourse}
        />
      )}
      {editingCourse && (
        <CreateCourseModal
          initial={editingCourse}
          videoSharingMode
          videoTaxonomy={taxonomy}
          onManageTaxonomy={() => setShowTaxonomyManager(true)}
          onClose={() => setEditingCourse(null)}
          onSubmit={handleUpdateCourse}
        />
      )}
      {showTaxonomyManager && (
        <VideoTaxonomyManager
          taxonomy={taxonomy}
          onClose={() => setShowTaxonomyManager(false)}
          onCreate={async input => {
            await createVideoTaxonomyOption(input);
            await loadTaxonomy();
          }}
          onUpdate={async (id, updates) => {
            await updateVideoTaxonomyOption(id, updates);
            await loadTaxonomy();
          }}
          onDelete={async id => {
            await deleteVideoTaxonomyOption(id);
            await loadTaxonomy();
          }}
        />
      )}
    </div>
  );
};

export default TrainingVideoSharePage;
