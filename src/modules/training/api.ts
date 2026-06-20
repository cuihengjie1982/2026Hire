import {getItemsFromPayload} from '../../shared/lib/apiClient';
import {USE_MOCK_API, API_BASE_URL, SUPABASE_ANON_KEY, getAuthToken, setAuthToken} from '../../shared/lib/runtime';
import {supabase} from '../../shared/lib/supabase';
import * as tus from 'tus-js-client';
import type {DetailedError} from 'tus-js-client';
import {courseFixtures, enrollmentFixtures} from './fixtures';
import {
  type TrainingCourse,
  type TrainingEnrollment,
  type TrainingAssessment,
  type TrainingStats,
  type WeaknessAnalysis,
  type TrainingEffectiveness,
  type CourseRecommendation,
  type CourseMaterial,
  type CourseSection,
  type PathEnrollment,
  type BatchEnrollInput,
  type BatchEnrollResult,
  type MaterialUploadResult,
  type TrainingActionCaptionFrame,
  type TrainingActionCaptionResult,
} from './types';

// Re-export types for consumers
export type {
  TrainingCourse,
  TrainingEnrollment,
  TrainingAssessment,
  TrainingStats,
  WeaknessAnalysis,
  TrainingEffectiveness,
  CourseRecommendation,
  PathEnrollment,
  BatchEnrollInput,
  BatchEnrollResult,
  MaterialUploadResult,
  TrainingActionCaptionFrame,
  TrainingActionCaptionResult,
};

const MATERIAL_UPLOAD_TIMEOUT_MS = 15 * 60 * 1000;
const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;
const DIRECT_SIGNED_UPLOAD_RETRY_COUNT = 3;
const SUPABASE_TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;
const SUPABASE_TOKEN_REFRESH_SKEW_SECONDS = 10 * 60;
const VIDEO_FILE_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm', 'avi', 'mkv']);

const inferContentType = (file: File): string => {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  const mimeByExt: Record<string, string> = {
    mp4: 'video/mp4',
    m4v: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    txt: 'text/plain',
    md: 'text/markdown',
    zip: 'application/zip',
  };
  return ext ? mimeByExt[ext] ?? 'application/octet-stream' : 'application/octet-stream';
};

const normalizeUploadFile = (file: File): File => {
  const contentType = inferContentType(file);
  return file.type === contentType ? file : new File([file], file.name, {type: contentType, lastModified: file.lastModified});
};

const getFileExtension = (fileName: string): string => fileName.split('.').pop()?.toLowerCase() ?? '';

const isVideoUploadFile = (file: File): boolean => file.type.startsWith('video/') || VIDEO_FILE_EXTENSIONS.has(getFileExtension(file.name));

const getFreshAuthToken = async (): Promise<string | null> => {
  if (USE_MOCK_API) return getAuthToken();

  try {
    const {data} = await supabase.auth.getSession();
    const session = data.session;
    if (!session?.access_token) return getAuthToken();

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAt = session.expires_at ?? 0;
    if (expiresAt > 0 && expiresAt - nowSeconds <= SUPABASE_TOKEN_REFRESH_SKEW_SECONDS) {
      const {data: refreshed, error} = await supabase.auth.refreshSession();
      if (!error && refreshed.session?.access_token) {
        setAuthToken(refreshed.session.access_token);
        return refreshed.session.access_token;
      }
    }

    setAuthToken(session.access_token);
    return session.access_token;
  } catch {
    return getAuthToken();
  }
};

const getErrorMessageFromText = (text: string, fallback: string): string => {
  if (!text) return fallback;
  try {
    const data = JSON.parse(text) as {error?: {message?: string} | string; message?: string};
    return (typeof data.error === 'string' ? data.error : data.error?.message) || data.message || text;
  } catch {
    return text;
  }
};

const uploadSignedStorageFile = async (
  _bucket: string,
  _path: string,
  _token: string,
  signedUrl: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<void> => {
  onProgress?.(1);
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const timer = window.setTimeout(() => {
      xhr.abort();
      reject(new Error('上传超时，请检查网络后重试'));
    }, MATERIAL_UPLOAD_TIMEOUT_MS);

    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('x-upsert', 'false');

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !event.total) return;
      const progress = Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100)));
      onProgress?.(progress);
    };

    xhr.onload = () => {
      window.clearTimeout(timer);
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      const message = getErrorMessageFromText(xhr.responseText, `Storage upload failed ${xhr.status}`);
      reject(new Error(`Direct signed upload failed: ${message}`));
    };

    xhr.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('视频上传网络失败，请切换网络后重试'));
    };

    xhr.onabort = () => {
      window.clearTimeout(timer);
      reject(new Error('视频上传已中断，请重新选择文件上传'));
    };

    const formData = new FormData();
    formData.append('cacheControl', '3600');
    formData.append('', file);
    xhr.send(formData);
  });
};

const getStorageErrorMessage = (error: Error | DetailedError): string => {
  const detailed = error as DetailedError;
  const response = detailed.originalResponse;
  const status = response?.getStatus();
  const body = response?.getBody();
  if (!body) {
    const cause = detailed.causingError?.message;
    return cause || error.message || (status ? `Storage upload failed ${status}` : 'Storage upload failed');
  }

  try {
    const data = JSON.parse(body) as {error?: string; message?: string; statusCode?: string | number};
    const message = data.message || data.error;
    if (message) return status ? `Storage upload failed ${status}: ${message}` : message;
  } catch {
    // Plain text bodies from Storage are still useful for diagnostics.
  }

  return status ? `Storage upload failed ${status}: ${body}` : body;
};

const isTransientUploadError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('网络失败')
    || message.includes('NetworkError')
    || message.includes('Failed to fetch')
    || message.includes('中断')
    || message.includes('超时')
    || message.includes('ERR_CONNECTION_CLOSED');
};

const waitForUploadRetry = (attemptIndex: number): Promise<void> => new Promise((resolve) => {
  window.setTimeout(resolve, Math.min(10_000, 1_500 * 2 ** attemptIndex));
});

type SignedMaterialUploadInfo = {
  bucket: string;
  path: string;
  token: string;
  signedUrl: string;
  publicUrl: string;
  filename: string;
};

const createSignedMaterialUploadInfo = async (file: File, token: string | null): Promise<SignedMaterialUploadInfo> => {
  const prepareRes = await fetch(`${API_BASE_URL}/functions/v1/embox-api/training/materials/signed-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({filename: file.name, contentType: file.type, size: file.size}),
  });
  const prepareText = await prepareRes.text();
  const uploadInfo = prepareText ? JSON.parse(prepareText) : {};
  if (!prepareRes.ok) {
    throw new Error(uploadInfo?.error?.message || uploadInfo?.message || `Create upload URL failed ${prepareRes.status}`);
  }
  if (!uploadInfo?.signedUrl || !uploadInfo?.publicUrl) {
    throw new Error('Create upload URL failed: empty signed upload response');
  }
  if (!uploadInfo?.token) {
    throw new Error('Create upload URL failed: empty signed upload token');
  }

  return {
    bucket: String(uploadInfo.bucket ?? 'training-materials'),
    path: String(uploadInfo.path),
    token: String(uploadInfo.token),
    signedUrl: String(uploadInfo.signedUrl),
    publicUrl: String(uploadInfo.publicUrl),
    filename: String(uploadInfo.filename ?? file.name),
  };
};

const uploadWithRetriedSignedUrl = async (
  file: File,
  token: string | null,
  onProgress?: (progress: number) => void,
): Promise<SignedMaterialUploadInfo> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= DIRECT_SIGNED_UPLOAD_RETRY_COUNT; attempt += 1) {
    const uploadInfo = await createSignedMaterialUploadInfo(file, token);
    try {
      await uploadSignedStorageFile(
        uploadInfo.bucket,
        uploadInfo.path,
        uploadInfo.token,
        uploadInfo.signedUrl,
        file,
        onProgress,
      );
      return uploadInfo;
    } catch (error) {
      lastError = error;
      if (attempt >= DIRECT_SIGNED_UPLOAD_RETRY_COUNT || !isTransientUploadError(error)) {
        throw error;
      }
      console.warn(`[training upload] signed upload interrupted, retrying ${attempt + 1}/${DIRECT_SIGNED_UPLOAD_RETRY_COUNT}`, error);
      onProgress?.(1);
      await waitForUploadRetry(attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('视频上传失败，请稍后重试');
};

const uploadMaterialViaApi = async (
  url: string,
  file: File,
  token: string | null,
  onProgress?: (progress: number) => void,
): Promise<MaterialUploadResult> => {
  onProgress?.(1);
  return new Promise<MaterialUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const timer = window.setTimeout(() => {
      xhr.abort();
      reject(new Error('上传超时，请检查网络后重试'));
    }, MATERIAL_UPLOAD_TIMEOUT_MS);

    xhr.open('POST', url);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !event.total) return;
      const progress = Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100)));
      onProgress?.(progress);
    };

    xhr.onload = () => {
      window.clearTimeout(timer);
      const text = xhr.responseText || '';
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(text) as MaterialUploadResult;
          onProgress?.(100);
          resolve(data);
        } catch {
          reject(new Error('上传成功但返回数据格式异常'));
        }
        return;
      }
      reject(new Error(getErrorMessageFromText(text, `Upload failed ${xhr.status}`)));
    };

    xhr.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('视频上传网络失败，请切换网络后重试'));
    };

    xhr.onabort = () => {
      window.clearTimeout(timer);
      reject(new Error('视频上传已中断，请重新选择文件上传'));
    };

    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
};

const getSupabaseResumableUploadEndpoint = (): string => {
  try {
    return `${API_BASE_URL.replace(/\/$/, '')}/storage/v1/upload/resumable`;
  } catch {
    return '';
  }
};

const uploadSignedStorageFileResumable = async (
  bucket: string,
  path: string,
  authToken: string | null,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<void> => {
  const endpoint = getSupabaseResumableUploadEndpoint();
  if (!endpoint) {
    throw new Error('无法识别 Supabase 项目地址，不能使用大文件续传上传');
  }
  if (!authToken) {
    throw new Error('登录状态已过期，请重新登录后上传视频');
  }

  onProgress?.(1);
  await new Promise<void>((resolve, reject) => {
    let activeAuthToken = authToken;
    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000, 30000, 60000, 120000],
      chunkSize: SUPABASE_TUS_CHUNK_SIZE_BYTES,
      storeFingerprintForResuming: false,
      removeFingerprintOnSuccess: true,
      headers: {
        ...(SUPABASE_ANON_KEY ? {apikey: SUPABASE_ANON_KEY} : {}),
        authorization: `Bearer ${activeAuthToken}`,
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: false,
      onBeforeRequest: async (req) => {
        const nextAuthToken = await getFreshAuthToken();
        if (nextAuthToken) {
          activeAuthToken = nextAuthToken;
          req.setHeader('authorization', `Bearer ${nextAuthToken}`);
        }
        if (SUPABASE_ANON_KEY) {
          req.setHeader('apikey', SUPABASE_ANON_KEY);
        }
        req.setHeader('x-upsert', 'false');
      },
      onShouldRetry: (error) => {
        const status = error.originalResponse?.getStatus();
        if (!status) return true;
        if ([400, 401, 403, 404, 409, 413].includes(status)) return false;
        return status === 408 || status === 423 || status === 429 || status >= 500;
      },
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600',
      },
      onError: (error) => {
        reject(new Error(`TUS upload failed: ${getStorageErrorMessage(error)}`));
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        if (!bytesTotal) return;
        const progress = Math.max(1, Math.min(99, Math.round((bytesUploaded / bytesTotal) * 100)));
        onProgress?.(progress);
      },
      onSuccess: () => {
        onProgress?.(100);
        resolve();
      },
    });

    upload.start();
  });
};

// Helper to call embox-api Edge Function (production) or fall through to fetchJson (dev)
const trainingEndpoint = (path: string) => {
  const base = USE_MOCK_API ? '' : API_BASE_URL;
  const isLocalExpress = base.includes('localhost') || base.includes('127.0.0.1');
  return isLocalExpress ? `${base}/api${path}` : `${base}/functions/v1/embox-api${path}`;
};

const efetch = async <T>(path: string, method = 'GET', body?: Record<string, unknown>): Promise<T> => {
  const token = getAuthToken();
  const res = await fetch(trainingEndpoint(path), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `API error ${res.status}`);
  return data as T;
};

// ─── Mappers ────────────────────────────────────────────────────────────

const normalizeCourseVideoContent = (content: CourseSection[], materials: CourseMaterial[]): CourseSection[] => {
  if (content.some(section => section.contentType === 'video' && section.contentUrl)) {
    return content;
  }

  const materialVideo = [...materials].reverse().find(material => material.type === 'video' && material.url);
  if (!materialVideo?.url) return content;

  return [
    ...content,
    {
      sectionTitle: materialVideo.title || '培训视频',
      contentType: 'video',
      contentUrl: materialVideo.url,
    },
  ];
};

const proxyPublicTrainingMaterialUrl = (url?: string): string | undefined => {
  if (!url || typeof window === 'undefined') return url;
  const publicStoragePrefix = `${API_BASE_URL}/storage/v1/object/public/training-materials/`;
  if (!url.startsWith(publicStoragePrefix)) return url;
  const objectPath = url.slice(publicStoragePrefix.length);
  return `${window.location.origin}/training-media/${objectPath}`;
};

const proxyTrainingMaterialUrlForCurrentOrigin = (url?: string): string | undefined => {
  if (!url || typeof window === 'undefined') return url;
  const marker = '/storage/v1/object/public/training-materials/';
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) return url;
  return `${window.location.origin}/training-media/${url.slice(markerIndex + marker.length)}`;
};

const mapPublicCourseMediaUrls = (course: TrainingCourse): TrainingCourse => ({
  ...course,
  content: course.content.map(section => ({
    ...section,
    contentUrl: proxyPublicTrainingMaterialUrl(section.contentUrl) ?? section.contentUrl,
  })),
  materials: course.materials.map(material => ({
    ...material,
    url: proxyPublicTrainingMaterialUrl(material.url) ?? material.url,
  })),
});

const mapCourse = (raw: Record<string, unknown>): TrainingCourse => {
  const materials = (raw.materials ?? []) as CourseMaterial[];
  const content = normalizeCourseVideoContent((raw.content ?? []) as CourseSection[], materials);

  return {
    id: String(raw.id ?? ''),
    title: String(raw.title ?? ''),
    description: String(raw.description ?? ''),
    category: String(raw.category ?? '综合'),
    difficulty: String(raw.difficulty ?? '初级') as TrainingCourse['difficulty'],
    durationMinutes: Number(raw.duration_minutes ?? raw.durationMinutes ?? 30),
    content,
    materials,
    assessmentConfig: (raw.assessment_config ?? raw.assessmentConfig ?? {type: 'quiz', passingScore: 60}) as TrainingCourse['assessmentConfig'],
    positionId: raw.position_id ? String(raw.position_id) : undefined,
    positionName: (raw.positions as Record<string, unknown>)?.name
      ? String((raw.positions as Record<string, unknown>).name)
      : raw.position_name ? String(raw.position_name) : undefined,
    competencyDimension: raw.competency_dimension ? String(raw.competency_dimension) : undefined,
    isActive: Boolean(raw.is_active ?? raw.isActive ?? true),
    createdAt: String(raw.created_at ?? ''),
    updatedAt: String(raw.updated_at ?? ''),
  };
};

export interface TrainingShareLink {
  courseId: string;
  token: string;
  path: string;
  url: string;
}

const mapEnrollment = (raw: Record<string, unknown>): TrainingEnrollment => ({
  id: String(raw.id ?? ''),
  candidateId: String(raw.candidate_id ?? raw.candidateId ?? ''),
  candidateName: String(raw.candidate_name ?? raw.candidateName ?? ''),
  courseId: String(raw.course_id ?? raw.courseId ?? ''),
  courseTitle: raw.course_title ? String(raw.course_title) : undefined,
  courseCategory: raw.course_category ? String(raw.course_category) : undefined,
  status: String(raw.status ?? 'enrolled') as TrainingEnrollment['status'],
  enrolledAt: String(raw.enrolled_at ?? raw.enrolledAt ?? ''),
  completedAt: raw.completed_at ? String(raw.completed_at) : undefined,
  progressPct: Number(raw.progress_pct ?? raw.progressPct ?? 0),
  finalScore: raw.final_score as number | undefined,
  preInterviewScore: raw.pre_interview_score as number | undefined,
  postInterviewScore: raw.post_interview_score as number | undefined,
  notes: raw.notes ? String(raw.notes) : undefined,
  createdAt: String(raw.created_at ?? ''),
  updatedAt: String(raw.updated_at ?? ''),
});

const mapAssessment = (raw: Record<string, unknown>): TrainingAssessment => ({
  id: String(raw.id ?? ''),
  enrollmentId: String(raw.enrollment_id ?? raw.enrollmentId ?? ''),
  score: Number(raw.score ?? 0),
  passed: Boolean(raw.passed ?? false),
  answers: (raw.answers ?? []) as TrainingAssessment['answers'],
  assessor: raw.assessor ? String(raw.assessor) : undefined,
  feedback: raw.feedback ? String(raw.feedback) : undefined,
  createdAt: String(raw.created_at ?? ''),
});

// ─── Mock data store ────────────────────────────────────────────────────

let courses = [...courseFixtures];
let enrollments = [...enrollmentFixtures];
let assessments: TrainingAssessment[] = [];

const mockDelay = () => new Promise<void>(r => setTimeout(r, 150 + Math.random() * 200));

// ─── Courses ────────────────────────────────────────────────────────────

export const listCourses = async (filters?: {
  category?: string;
  positionId?: string;
  difficulty?: string;
  page?: number;
  pageSize?: number;
}): Promise<{items: TrainingCourse[]; total: number; page: number; pageSize: number}> => {
  if (USE_MOCK_API) {
    await mockDelay();
    let filtered = courses.filter(c => c.isActive);
    if (filters?.category) filtered = filtered.filter(c => c.category === filters.category);
    if (filters?.difficulty) filtered = filtered.filter(c => c.difficulty === filters.difficulty);
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 50;
    return {items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize};
  }

  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.positionId) params.set('positionId', filters.positionId);
  if (filters?.difficulty) params.set('difficulty', filters.difficulty);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));

  const qs = params.toString();
  const payload = await efetch<Record<string, unknown>>(`/training/courses${qs ? `?${qs}` : ''}`);
  return {
    items: getItemsFromPayload<Record<string, unknown>>(payload).map(mapCourse),
    total: (payload.total as number) ?? 0,
    page: (payload.page as number) ?? 1,
    pageSize: (payload.pageSize as number) ?? 50,
  };
};

export const getCourse = async (id: string): Promise<TrainingCourse> => {
  if (USE_MOCK_API) { await mockDelay(); const c = courses.find(x => x.id === id); if (!c) throw new Error('Course not found'); return c; }
  const raw = await efetch<Record<string, unknown>>(`/training/courses/${id}`);
  return mapCourse(raw);
};

export const createCourse = async (input: Partial<TrainingCourse> & {title: string}): Promise<TrainingCourse> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const course: TrainingCourse = {
      id: Date.now().toString(),
      title: input.title,
      description: input.description ?? '',
      category: input.category ?? '综合',
      difficulty: input.difficulty ?? '初级',
      durationMinutes: input.durationMinutes ?? 30,
      content: input.content ?? [],
      materials: input.materials ?? [],
      assessmentConfig: input.assessmentConfig ?? {type: 'quiz', passingScore: 60},
      positionId: input.positionId,
      competencyDimension: input.competencyDimension,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    courses.push(course);
    return course;
  }

  const raw = await efetch<Record<string, unknown>>('/training/courses', 'POST', input as unknown as Record<string, unknown>);
  return mapCourse(raw);
};

export const updateCourse = async (id: string, updates: Partial<TrainingCourse>): Promise<TrainingCourse> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const idx = courses.findIndex(c => c.id === id);
    if (idx === -1) throw new Error('Course not found');
    courses[idx] = {...courses[idx], ...updates, updatedAt: new Date().toISOString()};
    return courses[idx];
  }

  const raw = await efetch<Record<string, unknown>>(`/training/courses/${id}`, 'PATCH', updates as unknown as Record<string, unknown>);
  return mapCourse(raw);
};

export const deleteCourse = async (id: string): Promise<void> => {
  if (USE_MOCK_API) { await mockDelay(); courses = courses.filter(c => c.id !== id); return; }
  await efetch(`/training/courses/${id}`, 'DELETE');
};

export const createTrainingShareLink = async (courseId: string): Promise<TrainingShareLink> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const token = `mock-${courseId}`;
    const path = `/tv/${encodeURIComponent(courseId)}/${encodeURIComponent(token)}`;
    return {courseId, token, path, url: `${window.location.origin}${path}`};
  }

  const raw = await efetch<{courseId: string; token: string; path: string}>('/training/share-links', 'POST', {courseId});
  const path = `/tv/${encodeURIComponent(raw.courseId)}/${encodeURIComponent(raw.token)}`;
  return {...raw, path, url: `${window.location.origin}${path}`};
};

export const getPublicTrainingCourse = async (courseId: string, token: string): Promise<TrainingCourse> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const c = courses.find(course => course.id === courseId);
    if (!c) throw new Error('课程不存在');
    return c;
  }

  const params = new URLSearchParams({token});
  const isLocalExpress = API_BASE_URL.includes('localhost') || API_BASE_URL.includes('127.0.0.1');
  const url = isLocalExpress
    ? trainingEndpoint(`/training/public/course/${encodeURIComponent(courseId)}?${params.toString()}`)
    : `/training-public-api/course/${encodeURIComponent(courseId)}?${params.toString()}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `API error ${res.status}`);
  const course = mapCourse((data.course ?? data) as Record<string, unknown>);
  return isLocalExpress ? course : mapPublicCourseMediaUrls(course);
};

const findCourseVideoUrl = (course: TrainingCourse): string => {
  const sectionVideo = [...course.content].reverse().find(section => section.contentType === 'video' && section.contentUrl);
  if (sectionVideo?.contentUrl) return sectionVideo.contentUrl;
  const materialVideo = [...course.materials].reverse().find(material => material.type === 'video' && material.url);
  return materialVideo?.url ?? '';
};

const waitForVideoEvent = (video: HTMLVideoElement, eventName: keyof HTMLMediaElementEventMap, timeoutMs = 12000): Promise<void> => new Promise((resolve, reject) => {
  const timer = window.setTimeout(() => {
    cleanup();
    reject(new Error('视频加载超时，无法抽取画面'));
  }, timeoutMs);
  const cleanup = () => {
    window.clearTimeout(timer);
    video.removeEventListener(eventName, handleEvent);
    video.removeEventListener('error', handleError);
  };
  const handleEvent = () => {
    cleanup();
    resolve();
  };
  const handleError = () => {
    cleanup();
    reject(new Error('视频无法加载，无法生成动作字幕'));
  };
  video.addEventListener(eventName, handleEvent, {once: true});
  video.addEventListener('error', handleError, {once: true});
});

const seekVideo = async (video: HTMLVideoElement, time: number): Promise<void> => {
  video.currentTime = Math.min(Math.max(time, 0), Math.max((video.duration || 0) - 0.1, 0));
  await waitForVideoEvent(video, 'seeked', 10000);
};

const extractVideoFrames = async (
  course: TrainingCourse,
  onProgress?: (progress: number) => void,
): Promise<{frames: TrainingActionCaptionFrame[]; duration: number}> => {
  const rawUrl = findCourseVideoUrl(course);
  const videoUrl = proxyTrainingMaterialUrlForCurrentOrigin(rawUrl) ?? rawUrl;
  if (!videoUrl) throw new Error('课程还没有可分析的视频');

  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = videoUrl;
  video.load();

  await waitForVideoEvent(video, 'loadedmetadata', 15000);
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : course.durationMinutes * 60;
  const sampleCount = Math.min(10, Math.max(4, Math.ceil(duration / 8)));
  const startOffset = duration > 2 ? 1 : 0;
  const times = Array.from({length: sampleCount}, (_, index) => {
    if (sampleCount === 1) return startOffset;
    return startOffset + ((Math.max(duration - startOffset - 0.5, 0)) * index) / (sampleCount - 1);
  });

  const canvas = document.createElement('canvas');
  const width = 640;
  const ratio = video.videoWidth && video.videoHeight ? video.videoHeight / video.videoWidth : 9 / 16;
  canvas.width = width;
  canvas.height = Math.max(240, Math.round(width * ratio));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器不支持视频抽帧');

  const frames: TrainingActionCaptionFrame[] = [];
  for (let index = 0; index < times.length; index += 1) {
    await seekVideo(video, times[index]);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    let dataUrl = '';
    try {
      dataUrl = canvas.toDataURL('image/jpeg', 0.72);
    } catch {
      throw new Error('当前视频地址不允许浏览器抽帧，请使用系统上传的视频文件');
    }
    frames.push({
      time: Math.round(times[index] * 10) / 10,
      image: dataUrl.replace(/^data:image\/jpeg;base64,/, ''),
      mediaType: 'image/jpeg',
    });
    onProgress?.(Math.round(((index + 1) / times.length) * 65));
  }

  video.removeAttribute('src');
  video.load();
  return {frames, duration};
};

export const generateTrainingActionCaptions = async (
  course: TrainingCourse,
  onProgress?: (progress: number) => void,
): Promise<TrainingActionCaptionResult> => {
  if (USE_MOCK_API) {
    await mockDelay();
    onProgress?.(100);
    return {
      generatedAt: new Date().toISOString(),
      captions: [
        {start: 0, end: 5, text: '打开培训页面，准备开始操作演示', confidence: 0.7},
        {start: 5, end: 12, text: '根据画面提示完成关键步骤', confidence: 0.7},
      ],
      model: 'mock',
    };
  }

  if (typeof document === 'undefined') {
    throw new Error('当前环境无法抽取视频画面');
  }

  const {frames, duration} = await extractVideoFrames(course, onProgress);
  onProgress?.(72);
  const result = await efetch<TrainingActionCaptionResult>('/training/ai/action-captions', 'POST', {
    courseId: course.id,
    title: course.title,
    description: course.description,
    duration,
    frames: frames as unknown as Record<string, unknown>[],
  });
  onProgress?.(100);
  return result;
};

// ─── Enrollments ────────────────────────────────────────────────────────

export const listEnrollments = async (filters?: {
  candidateId?: string;
  courseId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{items: TrainingEnrollment[]; total: number; page: number; pageSize: number}> => {
  if (USE_MOCK_API) {
    await mockDelay();
    let filtered = [...enrollments];
    if (filters?.candidateId) filtered = filtered.filter(e => e.candidateId === filters.candidateId);
    if (filters?.courseId) filtered = filtered.filter(e => e.courseId === filters.courseId);
    if (filters?.status) filtered = filtered.filter(e => e.status === filters.status);
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 50;
    return {items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize};
  }

  const params = new URLSearchParams();
  if (filters?.candidateId) params.set('candidateId', filters.candidateId);
  if (filters?.courseId) params.set('courseId', filters.courseId);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));

  const qs = params.toString();
  const payload = await efetch<Record<string, unknown>>(`/training/enrollments${qs ? `?${qs}` : ''}`);
  return {
    items: getItemsFromPayload<Record<string, unknown>>(payload).map(mapEnrollment),
    total: (payload.total as number) ?? 0,
    page: (payload.page as number) ?? 1,
    pageSize: (payload.pageSize as number) ?? 50,
  };
};

export const createEnrollment = async (input: {
  candidateId: string;
  candidateName: string;
  courseId: string;
  preInterviewScore?: number;
  notes?: string;
}): Promise<TrainingEnrollment> => {
  if (USE_MOCK_API) {
    await mockDelay();
    // Find course title
    const course = courses.find(c => c.id === input.courseId);
    const enrollment: TrainingEnrollment = {
      id: Date.now().toString(),
      candidateId: input.candidateId,
      candidateName: input.candidateName,
      courseId: input.courseId,
      courseTitle: course?.title ?? '',
      courseCategory: course?.category ?? '',
      status: 'enrolled',
      enrolledAt: new Date().toISOString(),
      progressPct: 0,
      preInterviewScore: input.preInterviewScore,
      notes: input.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    enrollments.push(enrollment);
    return enrollment;
  }

  const raw = await efetch<Record<string, unknown>>('/training/enrollments', 'POST', input as unknown as Record<string, unknown>);
  return mapEnrollment(raw);
};

export const updateEnrollment = async (
  id: string,
  updates: Partial<Pick<TrainingEnrollment, 'status' | 'progressPct' | 'finalScore' | 'postInterviewScore' | 'notes'>>,
): Promise<TrainingEnrollment> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const idx = enrollments.findIndex(e => e.id === id);
    if (idx === -1) throw new Error('Enrollment not found');
    enrollments[idx] = {...enrollments[idx], ...updates, updatedAt: new Date().toISOString()};
    return enrollments[idx];
  }

  const raw = await efetch<Record<string, unknown>>(`/training/enrollments/${id}`, 'PATCH', updates as unknown as Record<string, unknown>);
  return mapEnrollment(raw);
};

export const deleteEnrollment = async (id: string): Promise<void> => {
  if (USE_MOCK_API) { await mockDelay(); enrollments = enrollments.filter(e => e.id !== id); return; }
  await efetch(`/training/enrollments/${id}`, 'DELETE');
};

// ─── Assessments ────────────────────────────────────────────────────────

export const listAssessments = async (enrollmentId: string): Promise<TrainingAssessment[]> => {
  if (USE_MOCK_API) { await mockDelay(); return assessments.filter(a => a.enrollmentId === enrollmentId); }
  const rows = await efetch<Record<string, unknown>[]>(`/training/enrollments/${enrollmentId}/assessments`);
  return rows.map(mapAssessment);
};

export const submitAssessment = async (
  enrollmentId: string,
  input: {score: number; passed?: boolean; answers?: unknown[]; assessor?: string; feedback?: string},
): Promise<TrainingAssessment> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const record: TrainingAssessment = {
      id: Date.now().toString(),
      enrollmentId,
      score: input.score,
      passed: input.passed ?? input.score >= 60,
      answers: (input.answers ?? []) as TrainingAssessment['answers'],
      assessor: input.assessor,
      feedback: input.feedback,
      createdAt: new Date().toISOString(),
    };
    assessments.push(record);

    // Update enrollment
    const idx = enrollments.findIndex(e => e.id === enrollmentId);
    if (idx !== -1) {
      enrollments[idx] = {
        ...enrollments[idx],
        status: record.passed ? 'completed' : 'failed',
        finalScore: record.score,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    return record;
  }

  const raw = await efetch<Record<string, unknown>>(`/training/enrollments/${enrollmentId}/assessments`, 'POST', input as unknown as Record<string, unknown>);
  return mapAssessment(raw);
};

// ─── Analytics ──────────────────────────────────────────────────────────

export const getWeaknessAnalysis = async (positionId?: string): Promise<WeaknessAnalysis> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return {
      totalAnalyzed: 15,
      weaknesses: [
        {dimension: '沟通表达', frequency: 12, avgScore: 38.5, affectedCandidates: ['张三', '王五', '赵六', '刘七']},
        {dimension: '专业能力', frequency: 9, avgScore: 42.1, affectedCandidates: ['李四', '孙八', '周九']},
        {dimension: '应变能力', frequency: 7, avgScore: 35.8, affectedCandidates: ['张三', '李四', '吴十']},
        {dimension: '综合素质', frequency: 4, avgScore: 48.2, affectedCandidates: ['王五', '赵六']},
      ],
    };
  }

  const qs = positionId ? `?positionId=${encodeURIComponent(positionId)}` : '';
  return efetch<WeaknessAnalysis>(`/training/analytics/weakness-analysis${qs}`);
};

export const getTrainingEffectiveness = async (): Promise<TrainingEffectiveness> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return {
      totalCompleted: 8,
      avgImprovement: 18.5,
      improvementRate: 75,
      byCategory: {
        '沟通表达': {count: 4, avgPre: 42.5, avgPost: 68.2, improved: 3},
        '专业能力': {count: 3, avgPre: 38.0, avgPost: 61.3, improved: 2},
        '应变能力': {count: 1, avgPre: 35.0, avgPost: 55.0, improved: 1},
      },
    };
  }

  return efetch<TrainingEffectiveness>('/training/analytics/training-effectiveness');
};

export const recommendCourses = async (candidateId: string): Promise<CourseRecommendation> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return {
      dimensions: ['沟通表达', '应变能力'],
      recommendations: courses.filter(c => ['沟通表达', '应变能力'].includes(c.category)),
    };
  }

  const raw = await efetch<CourseRecommendation>('/training/analytics/recommend-courses', 'POST', {candidateId});
  return raw;
};

// ─── Stats ──────────────────────────────────────────────────────────────

export const exportEnrollmentsCSV = async (filters?: {status?: string; courseId?: string}): Promise<void> => {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.courseId) params.set('courseId', filters.courseId);
  const qs = params.toString();

  const token = getAuthToken() ?? '';
  const base = USE_MOCK_API ? '' : API_BASE_URL;
  const url = `${base}/functions/v1/embox-api/training/export/enrollments${qs ? `?${qs}` : ''}`;

  const resp = await fetch(url, {
    headers: {Authorization: `Bearer ${token}`},
  });
  if (!resp.ok) throw new Error(`Export failed: ${resp.status}`);

  const blob = await resp.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `training-enrollments-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

export const getTrainingStats = async (): Promise<TrainingStats> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const completed = enrollments.filter(e => e.status === 'completed').length;
    const failed = enrollments.filter(e => e.status === 'failed').length;
    const totalDone = completed + failed;
    const scores = enrollments.filter(e => e.finalScore !== undefined).map(e => e.finalScore!);
    return {
      totalCourses: courses.filter(c => c.isActive).length,
      activeEnrollments: enrollments.filter(e => e.status === 'enrolled' || e.status === 'in_progress').length,
      completedEnrollments: completed,
      failedEnrollments: failed,
      completionRate: totalDone > 0 ? Math.round((completed / totalDone) * 100) : 0,
      avgScore: scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0,
    };
  }

  return efetch<TrainingStats>('/training/stats');
};

// ─── Learning Paths ─────────────────────────────────────────────────────

const mapPathCourse = (raw: Record<string, unknown>): import('../training/types').PathCourse => ({
  id: String(raw.id ?? ''),
  pathId: String(raw.pathId ?? raw.path_id ?? ''),
  courseId: String(raw.courseId ?? raw.course_id ?? ''),
  sortOrder: Number(raw.sortOrder ?? raw.sort_order ?? 0),
  isRequired: Boolean(raw.isRequired ?? raw.is_required ?? true),
  course: mapCourse((raw.course ?? raw.training_courses ?? {}) as Record<string, unknown>),
});

const mapPath = (raw: Record<string, unknown>): import('../training/types').LearningPath => ({
  id: String(raw.id ?? ''),
  title: String(raw.title ?? ''),
  description: String(raw.description ?? ''),
  category: String(raw.category ?? '通用'),
  level: (String(raw.level ?? '初级')) as '初级' | '中级' | '高级',
  isCertified: Boolean(raw.isCertified ?? raw.is_certified ?? false),
  positionId: (raw.positionId ?? raw.position_id ?? undefined) as string | undefined,
  coverImageUrl: (raw.coverImageUrl ?? raw.cover_image_url ?? undefined) as string | undefined,
  isActive: Boolean(raw.isActive ?? raw.is_active ?? true),
  courses: ((raw.courses ?? []) as Record<string, unknown>[]).map(mapPathCourse),
  enrolledCount: Number(raw.enrolledCount ?? 0),
  createdAt: String(raw.createdAt ?? raw.created_at ?? ''),
  updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ''),
});

export const listPaths = async (filters?: {
  category?: string; positionId?: string; level?: string;
}): Promise<{ items: import('../training/types').LearningPath[]; total: number }> => {
  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.positionId) params.set('positionId', filters.positionId);
  if (filters?.level) params.set('level', filters.level);
  const qs = params.toString();

  if (USE_MOCK_API) {
    await mockDelay();
    return { items: [], total: 0 };
  }

  const payload = await efetch<Record<string, unknown>>(`/training/paths${qs ? `?${qs}` : ''}`);
  return {
    items: (payload.items as Record<string, unknown>[] | undefined ?? []).map(mapPath),
    total: (payload.total as number) ?? 0,
  };
};

export const createPath = async (input: {
  title: string;
  description?: string;
  category?: string;
  level?: string;
  isCertified?: boolean;
  positionId?: string;
  coverImageUrl?: string;
  courseIds?: string[];
}): Promise<import('../training/types').LearningPath> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return {
      id: Date.now().toString(),
      title: input.title,
      description: input.description ?? '',
      category: input.category ?? '通用',
      level: (input.level ?? '初级') as '初级' | '中级' | '高级',
      isCertified: input.isCertified ?? false,
      positionId: input.positionId,
      courses: [],
      enrolledCount: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  const raw = await efetch<Record<string, unknown>>('/training/paths', 'POST', input as unknown as Record<string, unknown>);
  return mapPath(raw);
};

export const updatePath = async (id: string, updates: {
  title?: string; description?: string; category?: string; level?: string;
  isCertified?: boolean; isActive?: boolean; coverImageUrl?: string;
  courseIds?: string[];
}): Promise<import('../training/types').LearningPath> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return { /* simplified mock */ } as import('../training/types').LearningPath;
  }

  const raw = await efetch<Record<string, unknown>>(`/training/paths/${id}`, 'PATCH', updates as unknown as Record<string, unknown>);
  return mapPath(raw);
};

export const deletePath = async (id: string): Promise<void> => {
  if (USE_MOCK_API) { await mockDelay(); return; }
  await efetch(`/training/paths/${id}`, 'DELETE');
};

const mapPathEnrollment = (raw: Record<string, unknown>): PathEnrollment => ({
  id: String(raw.id ?? ''),
  pathId: String(raw.path_id ?? raw.pathId ?? ''),
  candidateId: String(raw.candidate_id ?? raw.candidateId ?? ''),
  candidateName: (raw.candidate_name ?? raw.candidateName ?? undefined) as string | undefined,
  status: String(raw.status ?? 'enrolled') as PathEnrollment['status'],
  enrolledAt: String(raw.enrolled_at ?? raw.enrolledAt ?? ''),
  completedAt: (raw.completed_at ?? raw.completedAt ?? undefined) as string | undefined,
  progressPct: Number(raw.progress_pct ?? raw.progressPct ?? 0),
});

export const getPathEnrollments = async (pathId: string): Promise<{ items: PathEnrollment[]; total: number }> => {
  if (USE_MOCK_API) { await mockDelay(); return { items: [], total: 0 }; }
  const payload = await efetch<Record<string, unknown>>(`/training/paths/${pathId}/enrollments`);
  return {
    items: (payload.items as Record<string, unknown>[] ?? []).map(mapPathEnrollment),
    total: (payload.total as number) ?? 0,
  };
};

export const enrollCandidateInPath = async (pathId: string, candidateId: string): Promise<PathEnrollment> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return {
      id: Date.now().toString(),
      pathId,
      candidateId,
      status: 'enrolled',
      enrolledAt: new Date().toISOString(),
      progressPct: 0,
    };
  }
  const raw = await efetch<Record<string, unknown>>(`/training/paths/${pathId}/enrollments`, 'POST', { candidateId });
  return mapPathEnrollment(raw);
};

export const updatePathEnrollment = async (
  pathId: string,
  enrollmentId: string,
  updates: { status?: string; progressPct?: number },
): Promise<PathEnrollment> => {
  if (USE_MOCK_API) { await mockDelay(); return { id: enrollmentId, pathId, candidateId: '', status: 'enrolled' as const, enrolledAt: '', progressPct: 0, ...updates } as PathEnrollment; }
  const raw = await efetch<Record<string, unknown>>(`/training/paths/${pathId}/enrollments/${enrollmentId}`, 'PATCH', updates as unknown as Record<string, unknown>);
  return mapPathEnrollment(raw);
};

export const deletePathEnrollment = async (pathId: string, enrollmentId: string): Promise<void> => {
  if (USE_MOCK_API) { await mockDelay(); return; }
  await efetch(`/training/paths/${pathId}/enrollments/${enrollmentId}`, 'DELETE');
};

export const uploadMaterial = async (
  file: File,
  onProgress?: (progress: number) => void,
): Promise<MaterialUploadResult> => {
  if (USE_MOCK_API) {
    await mockDelay();
    onProgress?.(100);
    return { url: URL.createObjectURL(file), filename: file.name };
  }

  const uploadFile = normalizeUploadFile(file);
  const token = getAuthToken();
  // In local Vite dev, use the same-origin /api proxy so uploads do not hit CORS.
  // In production, go through Supabase Edge Function.
  const isLocalDev = API_BASE_URL.includes('localhost') || API_BASE_URL.includes('127.0.0.1');
  if (isLocalDev) {
    return uploadMaterialViaApi('/api/training/materials/upload', uploadFile, token, onProgress);
  }

  const shouldUseResumableUpload = isVideoUploadFile(uploadFile) || uploadFile.size > RESUMABLE_UPLOAD_THRESHOLD_BYTES;
  if (shouldUseResumableUpload) {
    const freshToken = await getFreshAuthToken();
    const uploadInfo = await createSignedMaterialUploadInfo(uploadFile, freshToken ?? token);
    await uploadSignedStorageFileResumable(
      uploadInfo.bucket,
      uploadInfo.path,
      freshToken ?? token,
      uploadFile,
      onProgress,
    );
    return {url: uploadInfo.publicUrl, filename: uploadFile.name};
  }

  const uploadInfo = await uploadWithRetriedSignedUrl(uploadFile, token, onProgress);
  return {url: uploadInfo.publicUrl, filename: uploadFile.name};
};

export const batchEnroll = async (input: BatchEnrollInput): Promise<BatchEnrollResult> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return { enrolled: [], skipped: [], total: input.candidateIds.length };
  }
  return efetch<BatchEnrollResult>('/training/enrollments/batch', 'POST', input as unknown as Record<string, unknown>);
};

// ─── Training Notes ─────────────────────────────────────────────────────

export interface TrainingNote {
  id: string;
  enrollmentId: string;
  candidateId: string;
  videoTimestamp: number;
  noteTitle: string;
  noteContent: string | null;
  createdAt: string;
  updatedAt: string;
}

export const listNotes = async (enrollmentId: string): Promise<{items: TrainingNote[]; total: number}> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return { items: [], total: 0 };
  }
  const payload = await efetch<Record<string, unknown>>(`/training/notes/${encodeURIComponent(enrollmentId)}`);
  return {
    items: (payload.items as Record<string, unknown>[] ?? []).map((r) => ({
      id: String(r.id ?? ''),
      enrollmentId: String(r.enrollment_id ?? ''),
      candidateId: String(r.candidate_id ?? ''),
      videoTimestamp: Number(r.video_timestamp ?? 0),
      noteTitle: String(r.note_title ?? ''),
      noteContent: r.note_content ? String(r.note_content) : null,
      createdAt: String(r.created_at ?? ''),
      updatedAt: String(r.updated_at ?? ''),
    })),
    total: (payload.total as number) ?? 0,
  };
};

export const createNote = async (input: {
  enrollmentId: string;
  candidateId: string;
  videoTimestamp: number;
  noteTitle: string;
  noteContent?: string;
}): Promise<TrainingNote> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return { id: Date.now().toString(), ...input, noteContent: input.noteContent ?? null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  }
  const raw = await efetch<Record<string, unknown>>('/training/notes', 'POST', input);
  return {
    id: String(raw.id ?? ''),
    enrollmentId: String(raw.enrollment_id ?? ''),
    candidateId: String(raw.candidate_id ?? ''),
    videoTimestamp: Number(raw.video_timestamp ?? 0),
    noteTitle: String(raw.note_title ?? ''),
    noteContent: raw.note_content ? String(raw.note_content) : null,
    createdAt: String(raw.created_at ?? ''),
    updatedAt: String(raw.updated_at ?? ''),
  };
};

export const updateNote = async (id: string, updates: {noteTitle?: string; noteContent?: string; videoTimestamp?: number}): Promise<TrainingNote> => {
  if (USE_MOCK_API) { return { id, enrollmentId: '', candidateId: '', videoTimestamp: 0, noteTitle: '', noteContent: null, createdAt: '', updatedAt: new Date().toISOString() } as TrainingNote; }
  const raw = await efetch<Record<string, unknown>>(`/training/notes/${encodeURIComponent(id)}`, 'PATCH', updates);
  return {
    id: String(raw.id ?? ''),
    enrollmentId: String(raw.enrollment_id ?? ''),
    candidateId: String(raw.candidate_id ?? ''),
    videoTimestamp: Number(raw.video_timestamp ?? 0),
    noteTitle: String(raw.note_title ?? ''),
    noteContent: raw.note_content ? String(raw.note_content) : null,
    createdAt: String(raw.created_at ?? ''),
    updatedAt: String(raw.updated_at ?? ''),
  };
};

export const deleteNote = async (id: string): Promise<void> => {
  if (USE_MOCK_API) { return; }
  await efetch(`/training/notes/${encodeURIComponent(id)}`, 'DELETE');
};

// ─── AI Summarize & Q&A ──────────────────────────────────────────────────

export const summarizeContent = async (content: string, title?: string): Promise<string> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return `【AI摘要】\n课程主题：${title ?? '未命名课程'}\n核心知识点：\n1. 第一知识点\n2. 第二知识点\n3. 第三知识点\n学习建议：建议结合实际案例加深理解。`;
  }
  const raw = await efetch<Record<string, unknown>>('/training/ai/summarize', 'POST', { content, title });
  return String(raw.summary ?? '');
};

export const askAI = async (question: string, transcript: string, videoTime: number, courseTitle?: string): Promise<string> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return `AI 回复：您的问题是"${question.substring(0, 20)}..."。根据视频内容，建议您重点关注相关章节的学习。`;
  }
  const raw = await efetch<Record<string, unknown>>('/training/ai/qa', 'POST', { question, transcript, videoTime, courseTitle });
  return String(raw.answer ?? '');
};

// ─── AI Topic Extraction ─────────────────────────────────────────────────

export interface TopicSegment {
  title: string;
  startTime: number;
  endTime: number;
}

export const generateTopics = async (content: string, title?: string, duration?: number): Promise<TopicSegment[]> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return [
      {title: '开场介绍', startTime: 0, endTime: 60},
      {title: '核心概念', startTime: 60, endTime: 180},
      {title: '案例分析', startTime: 180, endTime: 360},
    ];
  }
  const raw = await efetch<Record<string, unknown>>('/training/ai/topics', 'POST', { content, title, duration });
  const topics = raw.topics as TopicSegment[] | undefined;
  return Array.isArray(topics) ? topics : [];
};
