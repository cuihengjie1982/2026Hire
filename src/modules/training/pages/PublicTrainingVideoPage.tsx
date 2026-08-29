import {useEffect, useState} from 'react';
import {useLocation, useParams, useSearchParams} from 'react-router-dom';
import {AlertCircle, Download, ExternalLink, FileText, Loader2} from 'lucide-react';
import {getPublicTrainingCourse} from '../api';
import type {TrainingCourse} from '../types';
import {VideoLearningAssistant} from '../components/VideoLearningAssistant/VideoLearningAssistant';
import {getPublicTrainingMetadata} from '../publicTrainingMetadata';

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

const getComparableUrl = (url?: string): string => {
  if (!url) return '';
  try {
    const parsed = new URL(url, window.location.origin);
    const marker = '/storage/v1/object/public/training-materials/';
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex !== -1) return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
    const trainingMediaPrefix = '/training-media/';
    if (parsed.pathname.startsWith(trainingMediaPrefix)) return decodeURIComponent(parsed.pathname.slice(trainingMediaPrefix.length));
    return decodeURIComponent(parsed.pathname);
  } catch {
    const marker = '/storage/v1/object/public/training-materials/';
    const markerIndex = url.indexOf(marker);
    if (markerIndex !== -1) return decodeURIComponent(url.slice(markerIndex + marker.length).split('?')[0] ?? '');
    return decodeURIComponent(url.split('?')[0] ?? '');
  }
};

const urlsMatch = (a?: string, b?: string) => {
  if (!a || !b) return false;
  if (a === b) return true;
  return getComparableUrl(a) === getComparableUrl(b);
};

const extractTrainingShareFromText = (value?: string | null): {courseId: string; token: string} | null => {
  if (!value) return null;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  const matches = Array.from(decoded.matchAll(/\/tv\/([0-9a-f-]{36})\/([A-Za-z0-9_-]{20,})/g));
  const match = matches.at(-1);
  return match ? {courseId: match[1], token: match[2]} : null;
};

const getActionCaptionsForTarget = (course: TrainingCourse, targetUrl?: string) => {
  const byUrl = course.assessmentConfig.actionCaptionsByUrl ?? {};
  if (targetUrl) {
    if (byUrl[targetUrl]?.length) return byUrl[targetUrl];
    const matchedKey = Object.keys(byUrl).find(key => urlsMatch(key, targetUrl));
    if (matchedKey && byUrl[matchedKey]?.length) return byUrl[matchedKey];
    if (urlsMatch(course.assessmentConfig.actionCaptionTargetUrl, targetUrl) && course.assessmentConfig.actionCaptions?.length) {
      return course.assessmentConfig.actionCaptions;
    }
  }
  return course.assessmentConfig.actionCaptions ?? [];
};

const getCourseForTargetVideo = (course: TrainingCourse, targetUrl: string): TrainingCourse => {
  const sectionMatch = course.content.find(section => section.contentUrl && urlsMatch(section.contentUrl, targetUrl));
  const materialMatch = course.materials.find(material => material.url && urlsMatch(material.url, targetUrl));
  const selectedUrl = sectionMatch?.contentUrl ?? materialMatch?.url ?? targetUrl;
  const selectedTitle = sectionMatch?.sectionTitle ?? materialMatch?.title ?? course.title;
  const textSections = course.content.filter(section => section.contentType === 'text');

  return {
    ...course,
    content: [
      ...textSections,
      {
        sectionTitle: selectedTitle,
        contentType: 'video',
        contentUrl: selectedUrl,
      },
    ],
    materials: course.materials.filter(material => !material.url || !urlsMatch(material.url, selectedUrl)),
    assessmentConfig: {
      ...course.assessmentConfig,
      actionCaptions: getActionCaptionsForTarget(course, selectedUrl),
    },
  };
};

const getDocumentItems = (course: TrainingCourse, targetUrl?: string) => {
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

  const documents = [...sectionDocs, ...materialDocs];
  if (!targetUrl) return documents;

  const matched = documents.find(document => urlsMatch(document.url, targetUrl));
  if (matched) return [matched];

  return [{
    title: course.title || '培训文档',
    url: targetUrl,
    type: getUrlExtension(targetUrl),
  }];
};

const getDocumentPreviewPath = (document: {title: string; url: string; type: string}) => {
  const params = new URLSearchParams({
    file: document.url,
    title: document.title,
    type: document.type,
  });
  return `/training/docs/pdf?${params.toString()}`;
};

const PublicTrainingMetadataPanel = ({course}: {course: TrainingCourse}) => {
  const metadata = getPublicTrainingMetadata(course);
  const isNegative = metadata.polarityLabel === '负向视频';

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-label="培训分类信息">
      <div className="flex flex-wrap gap-2 text-xs font-medium">
        <span className={`rounded-md px-2.5 py-1 ${isNegative ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {metadata.polarityLabel}
        </span>
        <span className="rounded-md bg-blue-50 px-2.5 py-1 text-blue-700">任务：{metadata.taskLabel}</span>
        <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-emerald-700">场景：{metadata.sceneLabel}</span>
        <span className="rounded-md bg-violet-50 px-2.5 py-1 text-violet-700">难度：{metadata.difficultyLabel}</span>
        {metadata.durationLabel && (
          <span className="rounded-md bg-gray-100 px-2.5 py-1 text-gray-600">时长：{metadata.durationLabel}</span>
        )}
      </div>

      {metadata.qualityLabels.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-gray-500">质量标签</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {metadata.qualityLabels.map(label => (
              <span key={label} className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700">
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      {metadata.reviewNote && (
        <div className={`mt-3 rounded-lg border px-3 py-2.5 ${isNegative ? 'border-rose-100 bg-rose-50' : 'border-blue-100 bg-blue-50'}`}>
          <p className={`text-xs font-semibold ${isNegative ? 'text-rose-700' : 'text-blue-700'}`}>
            {isNegative ? '质量说明' : '拍摄要点'}
          </p>
          <p className={`mt-1 whitespace-pre-wrap text-sm leading-6 ${isNegative ? 'text-rose-800' : 'text-blue-800'}`}>
            {metadata.reviewNote}
          </p>
        </div>
      )}
    </section>
  );
};

const courseHasPlayableVideo = (course: TrainingCourse): boolean => (
  course.content.some(section => section.contentUrl && isVideoUrl(section.contentUrl))
  || course.materials.some(material => material.url && material.type === 'video' && isVideoUrl(material.url))
);

const PublicTrainingDocumentPage = ({course, targetUrl}: {course: TrainingCourse; targetUrl?: string}) => {
  const documents = getDocumentItems(course, targetUrl);
  const textSections = course.content.filter(section => section.contentType === 'text' && section.text);

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-3xl mx-auto px-5 py-8 space-y-5">
        <div>
          <p className="text-sm font-semibold text-indigo-600">员工培训资料</p>
          <h1 className="mt-2 text-2xl font-bold text-gray-950">{course.title}</h1>
          {course.description && <p className="mt-2 text-sm text-gray-500">{course.description}</p>}
        </div>

        <PublicTrainingMetadataPanel course={course} />

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
                        href={getDocumentPreviewPath(document)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#111827] text-white text-sm font-medium hover:bg-black"
                      >
                        <ExternalLink className="w-4 h-4" /> 预览文档
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
  const location = useLocation();
  const params = useParams<{courseId?: string; token?: string}>();
  const recoveredShare = extractTrainingShareFromText(location.pathname) ?? extractTrainingShareFromText(searchParams.get('sharePath'));
  const courseId = searchParams.get('courseId') ?? params.courseId ?? recoveredShare?.courseId ?? '';
  const token = searchParams.get('token') ?? params.token ?? recoveredShare?.token ?? '';
  const targetUrl = searchParams.get('target') ?? '';
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

  if (targetUrl && !isVideoUrl(targetUrl)) {
    return <PublicTrainingDocumentPage course={course} targetUrl={targetUrl} />;
  }

  if (targetUrl && isVideoUrl(targetUrl)) {
    return (
      <div className="min-h-screen bg-gray-50">
        <main className="mx-auto max-w-5xl space-y-4 px-4 py-5 sm:px-6 sm:py-8">
          <div>
            <p className="text-sm font-semibold text-indigo-600">员工培训视频</p>
            <h1 className="mt-1 text-xl font-bold text-gray-950">{course.title}</h1>
          </div>
          <PublicTrainingMetadataPanel course={course} />
          <VideoLearningAssistant course={getCourseForTargetVideo(course, targetUrl)} publicMode />
        </main>
      </div>
    );
  }

  if (!courseHasPlayableVideo(course)) {
    return <PublicTrainingDocumentPage course={course} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-5 sm:px-6 sm:py-8">
        <div>
          <p className="text-sm font-semibold text-indigo-600">员工培训视频</p>
          <h1 className="mt-1 text-xl font-bold text-gray-950">{course.title}</h1>
        </div>
        <PublicTrainingMetadataPanel course={course} />
        <VideoLearningAssistant course={course} publicMode />
      </main>
    </div>
  );
};

export default PublicTrainingVideoPage;
