import {useEffect, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {AlertCircle, Download, ExternalLink, FileText, Loader2} from 'lucide-react';
import {getPublicTrainingCourse} from '../api';
import type {TrainingCourse} from '../types';
import {VideoLearningAssistant} from '../components/VideoLearningAssistant/VideoLearningAssistant';

const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm', 'avi', 'mkv']);
const DOCUMENT_EXTENSIONS = new Set(['doc', 'docx', 'pdf', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'md']);

const getUrlExtension = (url?: string): string => {
  if (!url) return '';
  try {
    const parsed = new URL(url, window.location.origin);
    const pathname = decodeURIComponent(parsed.pathname);
    return pathname.split('.').pop()?.toLowerCase() ?? '';
  } catch {
    return url.split('?')[0]?.split('.').pop()?.toLowerCase() ?? '';
  }
};

const isVideoUrl = (url?: string): boolean => VIDEO_EXTENSIONS.has(getUrlExtension(url));
const isDocumentUrl = (url?: string): boolean => DOCUMENT_EXTENSIONS.has(getUrlExtension(url));

const getDocumentItems = (course: TrainingCourse) => {
  const sectionDocs = course.content
    .filter(section => section.contentUrl && !isVideoUrl(section.contentUrl) && (section.contentType !== 'text' || isDocumentUrl(section.contentUrl)))
    .map(section => ({
      title: section.sectionTitle || '培训文档',
      url: section.contentUrl!,
      type: getUrlExtension(section.contentUrl),
    }));
  const materialDocs = course.materials
    .filter(material => material.url && material.type !== 'video')
    .map(material => ({
      title: material.title || '培训资料',
      url: material.url!,
      type: getUrlExtension(material.url),
    }));

  return [...sectionDocs, ...materialDocs];
};

const courseHasPlayableVideo = (course: TrainingCourse): boolean => (
  course.content.some(section => section.contentUrl && isVideoUrl(section.contentUrl))
  || course.materials.some(material => material.url && material.type === 'video' && isVideoUrl(material.url))
);

const PublicTrainingDocumentPage = ({course}: {course: TrainingCourse}) => {
  const documents = getDocumentItems(course);
  const textSections = course.content.filter(section => section.contentType === 'text' && section.text);

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-3xl mx-auto px-5 py-8 space-y-5">
        <div>
          <p className="text-sm font-semibold text-indigo-600">员工培训资料</p>
          <h1 className="mt-2 text-2xl font-bold text-gray-950">{course.title}</h1>
          {course.description && <p className="mt-2 text-sm text-gray-500">{course.description}</p>}
        </div>

        {documents.length > 0 ? (
          <div className="space-y-3">
            {documents.map((document, index) => (
              <div key={`${document.url}-${index}`} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold text-gray-900 break-words">{document.title}</h2>
                    <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">{document.type || 'document'}</p>
                    <div className="mt-4 flex flex-col sm:flex-row gap-2">
                      <a
                        href={document.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#111827] text-white text-sm font-medium hover:bg-black"
                      >
                        <ExternalLink className="w-4 h-4" /> 打开文档
                      </a>
                      <a
                        href={document.url}
                        download
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50"
                      >
                        <Download className="w-4 h-4" /> 下载文件
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-5 text-sm text-gray-500">
            当前链接没有可打开的培训文档，请联系管理员检查课程内容。
          </div>
        )}

        {textSections.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            {textSections.map((section, index) => (
              <section key={`${section.sectionTitle}-${index}`} className="space-y-2">
                <h2 className="font-semibold text-gray-900">{section.sectionTitle || '文字内容'}</h2>
                <p className="whitespace-pre-wrap text-sm leading-6 text-gray-600">{section.text}</p>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export const PublicTrainingVideoPage = () => {
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get('courseId') ?? '';
  const token = searchParams.get('token') ?? '';
  const [course, setCourse] = useState<TrainingCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!courseId || !token) {
      setError('培训链接缺少必要参数');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    getPublicTrainingCourse(courseId, token)
      .then((result) => {
        if (!cancelled) setCourse(result);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '链接无效或课程不存在');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [courseId, token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center space-y-3 max-w-sm">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h1 className="text-lg font-semibold text-gray-900">培训链接不可用</h1>
          <p className="text-sm text-gray-500">{error || '请联系管理员获取新的培训链接'}</p>
        </div>
      </div>
    );
  }

  if (!courseHasPlayableVideo(course)) {
    return <PublicTrainingDocumentPage course={course} />;
  }

  return <VideoLearningAssistant course={course} publicMode />;
};

export default PublicTrainingVideoPage;
