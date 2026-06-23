import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {motion} from 'motion/react';
import {Loader2, PlayCircle, Share2, Upload} from 'lucide-react';
import {
  createCourse,
  deleteCourse,
  listCourses,
  updateCourse,
  type TrainingCourse,
} from '../api';
import {CreateCourseModal, VideoShareTab} from './TrainingAcademyPage';

export const TrainingVideoSharePage = () => {
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateCourse, setShowCreateCourse] = useState(false);
  const [editingCourse, setEditingCourse] = useState<TrainingCourse | null>(null);
  const navigate = useNavigate();

  const hasActionCaptions = (course: TrainingCourse) => {
    if ((course.assessmentConfig.actionCaptions?.length ?? 0) > 0) return true;
    return Object.values(course.assessmentConfig.actionCaptionsByUrl ?? {}).some(captions => captions.length > 0);
  };

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listCourses();
      setCourses(result.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载视频课程失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleCreateCourse = async (input: {
    title: string; category: string; difficulty: string; description: string;
    durationMinutes?: number; content?: {sectionTitle: string; contentType: string; text?: string; contentUrl?: string}[];
    materials?: {title: string; type: string; url?: string}[];
    assessmentConfig?: {type: string; passingScore: number};
    competencyDimension?: string;
  }) => {
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

  const handleUpdateCourse = async (input: {
    title: string; category: string; difficulty: string; description: string;
    durationMinutes?: number; content?: {sectionTitle: string; contentType: string; text?: string; contentUrl?: string}[];
    materials?: {title: string; type: string; url?: string}[];
    assessmentConfig?: {type: string; passingScore: number};
    competencyDimension?: string;
  }) => {
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
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="h-7 w-44 rounded-lg bg-gray-100 animate-pulse" />
          <div className="h-28 rounded-xl bg-gray-100 animate-pulse" />
          <div className="h-72 rounded-xl bg-gray-100 animate-pulse" />
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
            <h1 className="text-xl font-bold text-gray-900">视频分享</h1>
            <p className="text-sm text-gray-500">面向已入职员工的公开培训视频，可微信转发、免登录观看、生成实时动作流。</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateCourse(true)}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm hover:bg-[#153da0] transition-colors"
        >
          <Upload className="w-4 h-4" /> 新建视频
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div initial={{opacity: 0, y: 8}} animate={{opacity: 1, y: 0}} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <PlayCircle className="w-4 h-4 text-[#1a4bc4]" />
            可分享视频
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {courses.filter(course =>
              course.content.some(section => section.contentType === 'video' && section.contentUrl)
              || course.materials.some(material => material.type === 'video' && material.url),
            ).length}
          </p>
        </motion.div>
        <motion.div initial={{opacity: 0, y: 8}} animate={{opacity: 1, y: 0}} transition={{delay: 0.04}} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Share2 className="w-4 h-4 text-emerald-600" />
            已生成动作流
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {courses.filter(hasActionCaptions).length}
          </p>
        </motion.div>
        <motion.div initial={{opacity: 0, y: 8}} animate={{opacity: 1, y: 0}} transition={{delay: 0.08}} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 text-gray-500" />
            总课程
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900">{courses.length}</p>
        </motion.div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <VideoShareTab
        courses={courses}
        onAddCourse={() => setShowCreateCourse(true)}
        onEditCourse={setEditingCourse}
        onDeleteCourse={handleDeleteCourse}
        onPreview={(courseId) => navigate(`/training/preview?courseId=${courseId}`)}
        onCaptionsGenerated={loadData}
      />

      {showCreateCourse && (
        <CreateCourseModal
          defaultContentType="video"
          onClose={() => setShowCreateCourse(false)}
          onSubmit={handleCreateCourse}
        />
      )}
      {editingCourse && (
        <CreateCourseModal
          initial={editingCourse}
          onClose={() => setEditingCourse(null)}
          onSubmit={handleUpdateCourse}
        />
      )}
    </div>
  );
};

export default TrainingVideoSharePage;
