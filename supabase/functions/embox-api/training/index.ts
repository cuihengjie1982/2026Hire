import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';
import { callLLM, callVisionLLM, type ContentPart } from '../_shared/llmClient.ts';


function jsonRes(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function textRes(body: string, contentType: string, filename: string) {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

// Extract remaining path segments after the matched prefix
function getPathSegments(req: Request, prefix: string): string[] {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/embox-api/, '') || '/';
  const rest = path.startsWith(prefix) ? path.slice(prefix.length) : '';
  return rest.split('/').filter(Boolean);
}

// Extract query params
function getQuery(req: Request, key: string): string | null {
  return new URL(req.url).searchParams.get(key);
}

function getTrainingPortalSecret(): string {
  return Deno.env.get('TRAINING_PORTAL_SECRET')
    ?? Deno.env.get('SUPABASE_JWT_SECRET')
    ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    ?? '';
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function createTrainingPortalToken(candidateId: string): Promise<string> {
  const secret = getTrainingPortalSecret();
  if (!secret) return '';
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`training-portal:${candidateId}`));
  return base64Url(new Uint8Array(signature));
}

async function verifyTrainingPortalToken(candidateId: string, token: string | null): Promise<boolean> {
  if (!token) return false;
  const expected = await createTrainingPortalToken(candidateId);
  return !!expected && timingSafeEqual(token, expected);
}

async function createTrainingVideoToken(courseId: string): Promise<string> {
  const secret = getTrainingPortalSecret();
  if (!secret) return '';
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`training-video:${courseId}`));
  return base64Url(new Uint8Array(signature));
}

async function verifyTrainingVideoToken(courseId: string, token: string | null): Promise<boolean> {
  if (!token) return false;
  const expected = await createTrainingVideoToken(courseId);
  return !!expected && timingSafeEqual(token, expected);
}

type TrainingDatabaseClient = ReturnType<typeof createSupabaseAdmin>;
type VideoPolarity = 'positive' | 'negative';
type VideoSeverity = 'minor' | 'moderate' | 'severe';
type VideoReviewStatus = 'pending_review' | 'approved' | 'internal' | 'published';
const VIDEO_REVIEW_STATUSES: VideoReviewStatus[] = ['pending_review', 'approved', 'internal', 'published'];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeVideoPolarity(value: unknown, category?: unknown): VideoPolarity | undefined {
  if (value === 'positive' || value === 'negative') return value;
  if (category === '正向视频') return 'positive';
  if (category === '负向视频' || category === '负面视频') return 'negative';
  return undefined;
}

function normalizeVideoSeverity(value: unknown): VideoSeverity | null | undefined {
  if (value === null || value === '') return null;
  if (value === 'minor' || value === 'moderate' || value === 'severe') return value;
  return value === undefined ? undefined : null;
}

function isVideoReviewStatus(value: unknown): value is VideoReviewStatus {
  return typeof value === 'string' && VIDEO_REVIEW_STATUSES.includes(value as VideoReviewStatus);
}

function isPublicVideoReviewStatus(value: unknown): boolean {
  return value === null || value === undefined || value === '' || value === 'approved' || value === 'published';
}

function normalizeTaxonomyIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(id => String(id)).filter(id => UUID_PATTERN.test(id))));
}

async function enrichCoursesWithVideoTaxonomy(
  supabase: TrainingDatabaseClient,
  courses: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const courseIds = courses.map(course => String(course.id ?? '')).filter(Boolean);
  if (!courseIds.length) return courses;

  const [{data: options, error: optionsError}, {data: links, error: linksError}] = await Promise.all([
    supabase.from('training_video_taxonomy_options').select('*'),
    supabase.from('training_course_video_quality_tags').select('course_id, tag_id').in('course_id', courseIds),
  ]);
  if (optionsError) throw optionsError;
  if (linksError) throw linksError;

  const optionById = new Map((options ?? []).map(option => [String(option.id), option]));
  const tagIdsByCourse = new Map<string, string[]>();
  for (const link of links ?? []) {
    const courseId = String(link.course_id);
    const ids = tagIdsByCourse.get(courseId) ?? [];
    ids.push(String(link.tag_id));
    tagIdsByCourse.set(courseId, ids);
  }

  return courses.map(course => {
    const courseId = String(course.id ?? '');
    const taskCategoryId = course.video_task_category_id ? String(course.video_task_category_id) : '';
    const sceneId = course.video_scene_id ? String(course.video_scene_id) : '';
    const qualityTagIds = tagIdsByCourse.get(courseId) ?? [];
    const qualityTags = qualityTagIds
      .map(id => optionById.get(id))
      .filter((option): option is Record<string, unknown> => Boolean(option));
    return {
      ...course,
      task_category: taskCategoryId ? optionById.get(taskCategoryId) ?? null : null,
      video_scene: sceneId ? optionById.get(sceneId) ?? null : null,
      quality_tag_ids: qualityTagIds,
      quality_tags: qualityTags,
    };
  });
}

async function validateVideoTaxonomySelection(
  supabase: TrainingDatabaseClient,
  polarity: VideoPolarity | undefined,
  taskCategoryId: string | null | undefined,
  sceneId: string | null | undefined,
  qualityTagIds: string[] | undefined,
): Promise<string | null> {
  if (taskCategoryId && !UUID_PATTERN.test(taskCategoryId)) return '任务分类格式无效';
  if (sceneId && !UUID_PATTERN.test(sceneId)) return '场景格式无效';
  const ids = Array.from(new Set([
    ...(taskCategoryId ? [taskCategoryId] : []),
    ...(sceneId ? [sceneId] : []),
    ...(qualityTagIds ?? []),
  ]));
  if (!ids.length) return null;

  const {data, error} = await supabase
    .from('training_video_taxonomy_options')
    .select('id, kind, polarity, is_active')
    .in('id', ids);
  if (error) throw error;
  const optionById = new Map((data ?? []).map(option => [String(option.id), option]));
  if (ids.some(id => !optionById.has(id))) return '所选分类或标签不存在';

  if (taskCategoryId) {
    const task = optionById.get(taskCategoryId);
    if (task?.kind !== 'task') return '所选任务分类无效';
    if (!task.is_active) return '所选任务分类已停用';
  }

  if (sceneId) {
    const scene = optionById.get(sceneId);
    if (scene?.kind !== 'scene') return '所选场景无效';
    if (!scene.is_active) return '所选场景已停用';
  }

  for (const id of qualityTagIds ?? []) {
    const tag = optionById.get(id);
    if (tag?.kind !== 'quality') return '所选质量标签无效';
    if (!tag.is_active) return '所选质量标签已停用';
    if (polarity && tag.polarity !== polarity) return '质量标签与视频性质不匹配';
  }
  return null;
}

// =============================================================================
// Courses
// =============================================================================

const listOrGetCourse = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getPathSegments(req, '/training/courses');
    const id = segments[0];

    // GET /training/courses/:id
    if (id) {
      const { data, error } = await supabase
        .from('training_courses')
        .select('*, positions(name)')
        .eq('id', id)
        .single();
      if (error || !data) {
        return jsonRes({ error: { code: 'NOT_FOUND', message: `Course (${id}) not found` } }, 404);
      }
      const [enriched] = await enrichCoursesWithVideoTaxonomy(supabase, [data]);
      return jsonRes(enriched);
    }

    // GET /training/courses — list with filters
    const category = getQuery(req, 'category');
    const positionId = getQuery(req, 'positionId');
    const difficulty = getQuery(req, 'difficulty');
    const page = parseInt(getQuery(req, 'page') ?? '1', 10);
    const pageSize = Math.min(parseInt(getQuery(req, 'pageSize') ?? '50', 10), 200);
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('training_courses')
      .select('*, positions(name)', { count: 'exact' })
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (category) query = query.eq('category', category);
    if (positionId) query = query.eq('position_id', positionId);
    if (difficulty) query = query.eq('difficulty', difficulty);

    const { data, count, error } = await query;
    if (error) throw error;
    const items = await enrichCoursesWithVideoTaxonomy(supabase, (data ?? []) as Record<string, unknown>[]);

    return jsonRes({ items, total: count ?? 0, page, pageSize });
  } catch (e) {
    console.error('[training courses]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch courses' } }, 500);
  }
};

const createCourse = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json() as Record<string, unknown>;
    if (!body.title) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'title is required' } }, 400);
    }

    const explicitPolarity = body.videoPolarity;
    if (explicitPolarity !== undefined && explicitPolarity !== 'positive' && explicitPolarity !== 'negative') {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: '视频性质无效' } }, 400);
    }
    const videoPolarity = normalizeVideoPolarity(explicitPolarity, body.category);
    const taskCategoryId = body.taskCategoryId === null || body.taskCategoryId === ''
      ? null
      : body.taskCategoryId === undefined ? undefined : String(body.taskCategoryId);
    const sceneId = body.videoSceneId === null || body.videoSceneId === ''
      ? null
      : body.videoSceneId === undefined ? undefined : String(body.videoSceneId);
    const qualityTagIds = normalizeTaxonomyIds(body.qualityTagIds);
    if (Array.isArray(body.qualityTagIds) && qualityTagIds.length !== body.qualityTagIds.length) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: '质量标签格式无效' } }, 400);
    }
    const taxonomyError = await validateVideoTaxonomySelection(
      supabase,
      videoPolarity,
      taskCategoryId,
      sceneId,
      qualityTagIds,
    );
    if (taxonomyError) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: taxonomyError } }, 400);
    }

    const videoSeverity = normalizeVideoSeverity(body.videoSeverity);
    if (body.videoSeverity !== undefined && body.videoSeverity !== null && videoSeverity === null) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: '严重程度无效' } }, 400);
    }

    const reviewStatusProvided = Object.prototype.hasOwnProperty.call(body, 'videoReviewStatus');
    if (reviewStatusProvided && body.videoReviewStatus !== null && body.videoReviewStatus !== '' && !isVideoReviewStatus(body.videoReviewStatus)) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: '审核状态无效' } }, 400);
    }
    const videoReviewStatus = reviewStatusProvided
      ? (body.videoReviewStatus === null || body.videoReviewStatus === '' ? null : body.videoReviewStatus as VideoReviewStatus)
      : videoPolarity === 'negative' ? 'pending_review' : videoPolarity === 'positive' ? 'published' : null;

    const { data, error } = await supabase.from('training_courses').insert({
      title: body.title,
      description: body.description ?? null,
      category: body.category ?? (videoPolarity === 'positive' ? '正向视频' : videoPolarity === 'negative' ? '负向视频' : '综合'),
      difficulty: body.difficulty ?? '初级',
      duration_minutes: body.durationMinutes ?? 30,
      content: body.content ?? [],
      materials: body.materials ?? [],
      assessment_config: body.assessmentConfig ?? {},
      position_id: body.positionId ?? null,
      competency_dimension: body.competencyDimension ?? null,
      video_polarity: videoPolarity ?? null,
      video_task_category_id: taskCategoryId ?? null,
      video_scene_id: sceneId ?? null,
      video_severity: videoPolarity === 'negative' ? videoSeverity ?? null : null,
      video_review_note: body.videoReviewNote ? String(body.videoReviewNote).trim().slice(0, 1000) : null,
      video_review_status: videoReviewStatus,
    }).select().single();

    if (error) throw error;
    if (qualityTagIds.length) {
      const {error: tagError} = await supabase.from('training_course_video_quality_tags').insert(
        qualityTagIds.map(tagId => ({course_id: data.id, tag_id: tagId})),
      );
      if (tagError) {
        await supabase.from('training_courses').delete().eq('id', data.id);
        throw tagError;
      }
    }
    const [enriched] = await enrichCoursesWithVideoTaxonomy(supabase, [data]);
    return jsonRes(enriched, 201);
  } catch (e) {
    console.error('[training courses create]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create course' } }, 500);
  }
};

const updateCourse = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getPathSegments(req, '/training/courses');
    const id = segments[0];
    if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Course ID required' } }, 400);

    const body = await req.json() as Record<string, unknown>;
    const {data: current, error: currentError} = await supabase
      .from('training_courses')
      .select('*')
      .eq('id', id)
      .single();
    if (currentError || !current) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: 'Course not found' } }, 404);
    }

    const polarityProvided = Object.prototype.hasOwnProperty.call(body, 'videoPolarity');
    if (polarityProvided && body.videoPolarity !== null && body.videoPolarity !== 'positive' && body.videoPolarity !== 'negative') {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: '视频性质无效' } }, 400);
    }
    const currentPolarity = normalizeVideoPolarity(current.video_polarity, current.category);
    const effectivePolarity = polarityProvided
      ? normalizeVideoPolarity(body.videoPolarity, body.category)
      : normalizeVideoPolarity(undefined, body.category) ?? currentPolarity;
    const taskCategoryProvided = Object.prototype.hasOwnProperty.call(body, 'taskCategoryId');
    const taskCategoryId = !taskCategoryProvided
      ? undefined
      : body.taskCategoryId === null || body.taskCategoryId === '' ? null : String(body.taskCategoryId);
    const sceneProvided = Object.prototype.hasOwnProperty.call(body, 'videoSceneId');
    const sceneId = !sceneProvided
      ? undefined
      : body.videoSceneId === null || body.videoSceneId === '' ? null : String(body.videoSceneId);
    const qualityTagsProvided = Object.prototype.hasOwnProperty.call(body, 'qualityTagIds')
      || polarityProvided;
    const qualityTagIds = qualityTagsProvided ? normalizeTaxonomyIds(body.qualityTagIds ?? []) : undefined;
    if (Array.isArray(body.qualityTagIds) && qualityTagIds && qualityTagIds.length !== body.qualityTagIds.length) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: '质量标签格式无效' } }, 400);
    }
    const taxonomyError = await validateVideoTaxonomySelection(
      supabase,
      effectivePolarity,
      taskCategoryId,
      sceneId,
      qualityTagIds,
    );
    if (taxonomyError) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: taxonomyError } }, 400);
    }

    const severityProvided = Object.prototype.hasOwnProperty.call(body, 'videoSeverity');
    const videoSeverity = normalizeVideoSeverity(body.videoSeverity);
    if (severityProvided && body.videoSeverity !== null && body.videoSeverity !== '' && videoSeverity === null) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: '严重程度无效' } }, 400);
    }
    const reviewStatusProvided = Object.prototype.hasOwnProperty.call(body, 'videoReviewStatus');
    if (reviewStatusProvided && body.videoReviewStatus !== null && body.videoReviewStatus !== '' && !isVideoReviewStatus(body.videoReviewStatus)) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: '审核状态无效' } }, 400);
    }
    const updates: Record<string, unknown> = {};
    const fieldMap: Record<string, string> = {
      title: 'title', description: 'description', category: 'category',
      difficulty: 'difficulty', durationMinutes: 'duration_minutes',
      content: 'content', materials: 'materials', assessmentConfig: 'assessment_config',
      positionId: 'position_id', competencyDimension: 'competency_dimension',
      isActive: 'is_active',
    };

    for (const [bodyKey, col] of Object.entries(fieldMap)) {
      if (body[bodyKey] !== undefined) {
        updates[col] = body[bodyKey];
      }
    }

    if (polarityProvided) {
      updates.video_polarity = body.videoPolarity ?? null;
      if (body.category === undefined && effectivePolarity) {
        updates.category = effectivePolarity === 'positive' ? '正向视频' : '负向视频';
      }
      if (effectivePolarity !== 'negative') updates.video_severity = null;
    }
    if (taskCategoryProvided) updates.video_task_category_id = taskCategoryId;
    if (sceneProvided) updates.video_scene_id = sceneId;
    if (severityProvided && effectivePolarity === 'negative') updates.video_severity = videoSeverity;
    if (Object.prototype.hasOwnProperty.call(body, 'videoReviewNote')) {
      updates.video_review_note = body.videoReviewNote
        ? String(body.videoReviewNote).trim().slice(0, 1000)
        : null;
    }
    if (reviewStatusProvided) {
      updates.video_review_status = body.videoReviewStatus === null || body.videoReviewStatus === ''
        ? null
        : body.videoReviewStatus;
    }

    if (Object.keys(updates).length === 0 && !qualityTagsProvided) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } }, 400);
    }

    let data = current;
    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      const result = await supabase.from('training_courses')
        .update(updates).eq('id', id).select().single();
      if (result.error || !result.data) throw result.error ?? new Error('Course update failed');
      data = result.data;
    }

    if (qualityTagsProvided && qualityTagIds) {
      const {data: oldLinks, error: oldLinksError} = await supabase
        .from('training_course_video_quality_tags')
        .select('tag_id')
        .eq('course_id', id);
      if (oldLinksError) throw oldLinksError;
      const {error: deleteError} = await supabase
        .from('training_course_video_quality_tags')
        .delete()
        .eq('course_id', id);
      if (deleteError) throw deleteError;
      if (qualityTagIds.length) {
        const {error: insertError} = await supabase.from('training_course_video_quality_tags').insert(
          qualityTagIds.map(tagId => ({course_id: id, tag_id: tagId})),
        );
        if (insertError) {
          const previousTagIds = (oldLinks ?? []).map(link => String(link.tag_id));
          if (previousTagIds.length) {
            await supabase.from('training_course_video_quality_tags').insert(
              previousTagIds.map(tagId => ({course_id: id, tag_id: tagId})),
            );
          }
          throw insertError;
        }
      }
    }

    const [enriched] = await enrichCoursesWithVideoTaxonomy(supabase, [data]);
    return jsonRes(enriched);
  } catch (e) {
    console.error('[training courses update]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update course' } }, 500);
  }
};

const deleteCourse = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getPathSegments(req, '/training/courses');
    const id = segments[0];
    if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Course ID required' } }, 400);

    const { error, data } = await supabase.from('training_courses').delete().eq('id', id).select('id').single();
    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: 'Course not found' } }, 404);
    }
    return jsonRes({ deleted: true, id: data.id });
  } catch (e) {
    console.error('[training courses delete]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete course' } }, 500);
  }
};

// =============================================================================
// Video taxonomy options
// =============================================================================

export const handleVideoTaxonomy = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getPathSegments(req, '/training/video-taxonomy');
    const optionId = segments[0];

    if (req.method === 'GET') {
      const includeInactive = getQuery(req, 'includeInactive') === 'true';
      let query = supabase
        .from('training_video_taxonomy_options')
        .select('*')
        .order('sort_order', {ascending: true})
        .order('name', {ascending: true});
      if (!includeInactive) query = query.eq('is_active', true);
      const {data, error} = await query;
      if (error) throw error;
      return jsonRes({items: data ?? []});
    }

    if (req.method === 'POST') {
      const body = await req.json() as Record<string, unknown>;
      const kind = body.kind === 'task' || body.kind === 'scene' || body.kind === 'quality' ? body.kind : '';
      const polarity = body.polarity === 'positive' || body.polarity === 'negative' ? body.polarity : null;
      const name = String(body.name ?? '').trim().slice(0, 100);
      if (!kind || !name || (kind === 'quality' && !polarity) || (kind !== 'quality' && polarity)) {
        return jsonRes({ error: { code: 'VALIDATION_ERROR', message: '分类名称、类型和方向不完整' } }, 400);
      }
      const {data: lastOption} = await supabase
        .from('training_video_taxonomy_options')
        .select('sort_order')
        .eq('kind', kind)
        .order('sort_order', {ascending: false})
        .limit(1)
        .maybeSingle();
      const requestedSortOrder = Number(body.sortOrder);
      const sortOrder = Number.isFinite(requestedSortOrder)
        ? Math.trunc(requestedSortOrder)
        : Number(lastOption?.sort_order ?? 0) + 10;
      const {data, error} = await supabase
        .from('training_video_taxonomy_options')
        .insert({kind, polarity: kind === 'quality' ? polarity : null, name, sort_order: sortOrder})
        .select()
        .single();
      if (error?.code === '23505') {
        return jsonRes({ error: { code: 'DUPLICATE', message: '同名分类或标签已经存在' } }, 409);
      }
      if (error) throw error;
      return jsonRes(data, 201);
    }

    if (!optionId || !UUID_PATTERN.test(optionId)) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: '分类 ID 无效' } }, 400);
    }

    if (req.method === 'PATCH') {
      const body = await req.json() as Record<string, unknown>;
      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) {
        const name = String(body.name).trim().slice(0, 100);
        if (!name) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: '分类名称不能为空' } }, 400);
        updates.name = name;
      }
      if (body.sortOrder !== undefined) {
        const sortOrder = Number(body.sortOrder);
        if (!Number.isFinite(sortOrder)) {
          return jsonRes({ error: { code: 'VALIDATION_ERROR', message: '排序值无效' } }, 400);
        }
        updates.sort_order = Math.trunc(sortOrder);
      }
      if (body.isActive !== undefined) updates.is_active = Boolean(body.isActive);
      if (!Object.keys(updates).length) {
        return jsonRes({ error: { code: 'VALIDATION_ERROR', message: '没有可保存的修改' } }, 400);
      }
      updates.updated_at = new Date().toISOString();
      const {data, error} = await supabase
        .from('training_video_taxonomy_options')
        .update(updates)
        .eq('id', optionId)
        .select()
        .single();
      if (error?.code === '23505') {
        return jsonRes({ error: { code: 'DUPLICATE', message: '同名分类或标签已经存在' } }, 409);
      }
      if (error || !data) {
        return jsonRes({ error: { code: 'NOT_FOUND', message: '分类不存在' } }, 404);
      }
      return jsonRes(data);
    }

    if (req.method === 'DELETE') {
      const {data: option, error: optionError} = await supabase
        .from('training_video_taxonomy_options')
        .select('id, kind')
        .eq('id', optionId)
        .single();
      if (optionError || !option) {
        return jsonRes({ error: { code: 'NOT_FOUND', message: '分类不存在' } }, 404);
      }
      const usageResult = option.kind === 'task'
        ? await supabase.from('training_courses').select('id', {count: 'exact', head: true}).eq('video_task_category_id', optionId)
        : option.kind === 'scene'
          ? await supabase.from('training_courses').select('id', {count: 'exact', head: true}).eq('video_scene_id', optionId)
          : await supabase.from('training_course_video_quality_tags').select('course_id', {count: 'exact', head: true}).eq('tag_id', optionId);
      if (usageResult.error) throw usageResult.error;
      if ((usageResult.count ?? 0) > 0) {
        return jsonRes({ error: { code: 'IN_USE', message: '该分类已被视频使用，请改为停用' } }, 409);
      }
      const {error} = await supabase.from('training_video_taxonomy_options').delete().eq('id', optionId);
      if (error) throw error;
      return jsonRes({deleted: true, id: optionId});
    }

    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, 405);
  } catch (e) {
    console.error('[training video taxonomy]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to manage video taxonomy' } }, 500);
  }
};

// =============================================================================
// Enrollments
// =============================================================================

const listEnrollments = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const candidateId = getQuery(req, 'candidateId');
    const courseId = getQuery(req, 'courseId');
    const status = getQuery(req, 'status');
    const page = parseInt(getQuery(req, 'page') ?? '1', 10);
    const pageSize = Math.min(parseInt(getQuery(req, 'pageSize') ?? '50', 10), 200);
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('training_enrollments')
      .select('*, training_courses!inner(title, category)', { count: 'exact' })
      .order('enrolled_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (candidateId) query = query.eq('candidate_id', candidateId);
    if (courseId) query = query.eq('course_id', courseId);
    if (status) query = query.eq('status', status);

    const { data, count, error } = await query;
    if (error) throw error;

    // Flatten course_title / course_category
    const items = (data ?? []).map((e: Record<string, unknown>) => {
      const course = (e.training_courses ?? {}) as Record<string, unknown>;
      const { training_courses: _, ...rest } = e;
      return {
        ...rest,
        course_title: course.title ?? '',
        course_category: course.category ?? '',
      };
    });

    return jsonRes({ items, total: count ?? 0, page, pageSize });
  } catch (e) {
    console.error('[training enrollments]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch enrollments' } }, 500);
  }
};

const createEnrollment = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();
    const { candidateId, candidateName, courseId, preInterviewScore, notes } = body;

    if (!candidateId || !candidateName || !courseId) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'candidateId, candidateName, courseId required' } }, 400);
    }

    // Get latest interview score if not provided
    let preScore = preInterviewScore ?? null;
    if (preScore === null || preScore === undefined) {
      const { data: lastInterview } = await supabase
        .from('interview_results')
        .select('total_score')
        .eq('candidate_id', candidateId)
        .order('interview_date', { ascending: false })
        .limit(1)
        .single();
      preScore = lastInterview?.total_score ?? null;
    }

    const { data, error } = await supabase.from('training_enrollments').insert({
      candidate_id: candidateId,
      candidate_name: candidateName,
      course_id: courseId,
      pre_interview_score: preScore,
      notes: notes ?? null,
    }).select().single();

    if (error) {
      if (error.code === '23505') {
        return jsonRes({ error: { code: 'DUPLICATE', message: 'Candidate already enrolled in this course' } }, 409);
      }
      throw error;
    }
    return jsonRes(data, 201);
  } catch (e) {
    console.error('[training enrollments create]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create enrollment' } }, 500);
  }
};

const updateEnrollment = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getPathSegments(req, '/training/enrollments');
    const id = segments[0];
    if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Enrollment ID required' } }, 400);

    const body = await req.json();
    const updates: Record<string, unknown> = {};
    const fieldMap: Record<string, string> = {
      status: 'status', progressPct: 'progress_pct', finalScore: 'final_score',
      postInterviewScore: 'post_interview_score', notes: 'notes',
    };

    for (const [bodyKey, col] of Object.entries(fieldMap)) {
      if (body[bodyKey] !== undefined) updates[col] = body[bodyKey];
    }

    if (body.status === 'completed' || body.status === 'failed') {
      updates['completed_at'] = new Date().toISOString();
    }
    updates['updated_at'] = new Date().toISOString();

    const { data, error } = await supabase.from('training_enrollments')
      .update(updates).eq('id', id).select().single();

    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: 'Enrollment not found' } }, 404);
    }
    return jsonRes(data);
  } catch (e) {
    console.error('[training enrollments update]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update enrollment' } }, 500);
  }
};

const deleteEnrollment = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getPathSegments(req, '/training/enrollments');
    const id = segments[0];
    if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Enrollment ID required' } }, 400);

    const { error, data } = await supabase.from('training_enrollments').delete().eq('id', id).select('id').single();
    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: 'Enrollment not found' } }, 404);
    }
    return jsonRes({ deleted: true, id: data.id });
  } catch (e) {
    console.error('[training enrollments delete]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete enrollment' } }, 500);
  }
};

// =============================================================================
// Assessments
// =============================================================================

const listAssessments = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getPathSegments(req, '/training/enrollments');
    const enrollmentId = segments[0]; // /training/enrollments/:id/assessments

    const { data, error } = await supabase
      .from('training_assessments')
      .select('*')
      .eq('enrollment_id', enrollmentId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return jsonRes(data ?? []);
  } catch (e) {
    console.error('[training assessments]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch assessments' } }, 500);
  }
};

const submitAssessment = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getPathSegments(req, '/training/enrollments');
    const enrollmentId = segments[0];
    const body = await req.json();
    const { score, passed, answers, assessor, feedback } = body;

    if (score === undefined) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'score required' } }, 400);
    }

    // Verify enrollment exists
    const { data: enrollment } = await supabase
      .from('training_enrollments').select('*').eq('id', enrollmentId).single();
    if (!enrollment) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: 'Enrollment not found' } }, 404);
    }

    const finalPassed = passed ?? (Number(score) >= 60);
    const { data: assessment, error } = await supabase.from('training_assessments').insert({
      enrollment_id: enrollmentId,
      score: Number(score),
      passed: finalPassed,
      answers: answers ?? [],
      assessor: assessor ?? null,
      feedback: feedback ?? null,
    }).select().single();

    if (error) throw error;

    // Update enrollment
    await supabase.from('training_enrollments').update({
      final_score: Number(score),
      status: finalPassed ? 'completed' : 'failed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', enrollmentId);

    return jsonRes(assessment, 201);
  } catch (e) {
    console.error('[training assessments submit]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to submit assessment' } }, 500);
  }
};

// =============================================================================
// Analytics — Weakness Analysis
// =============================================================================

const weaknessAnalysis = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const positionId = getQuery(req, 'positionId');

    // Get low-scoring interview results
    let query = supabase
      .from('interview_results')
      .select('candidate_id, total_score, grade, dimensions, candidates!inner(name, position_id)')
      .lt('total_score', 60)
      .order('interview_date', { ascending: false })
      .limit(100);

    if (positionId) {
      query = query.eq('candidates.position_id', positionId);
    }

    const { data: weakResults, error } = await query;
    if (error) throw error;

    // Aggregate dimension weaknesses
    const dimensionStats: Record<string, { count: number; totalScore: number; candidates: string[] }> = {};

    for (const r of (weakResults ?? [])) {
      const dims = (r.dimensions ?? []) as { name: string; score: number }[];
      const candidateName = (r.candidates as Record<string, unknown>)?.name as string ?? '';
      for (const d of dims) {
        if (d.score < 60) {
          if (!dimensionStats[d.name]) dimensionStats[d.name] = { count: 0, totalScore: 0, candidates: [] };
          dimensionStats[d.name].count++;
          dimensionStats[d.name].totalScore += d.score;
          if (!dimensionStats[d.name].candidates.includes(candidateName)) {
            dimensionStats[d.name].candidates.push(candidateName);
          }
        }
      }
    }

    const weaknesses = Object.entries(dimensionStats)
      .map(([name, stat]) => ({
        dimension: name,
        frequency: stat.count,
        avgScore: Math.round((stat.totalScore / stat.count) * 100) / 100,
        affectedCandidates: stat.candidates.slice(0, 10),
      }))
      .sort((a, b) => b.frequency - a.frequency);

    return jsonRes({ totalAnalyzed: (weakResults ?? []).length, weaknesses });
  } catch (e) {
    console.error('[training analytics weakness]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to analyze weaknesses' } }, 500);
  }
};

// =============================================================================
// Analytics — Training Effectiveness
// =============================================================================

const trainingEffectiveness = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);

    const { data: completed, error } = await supabase
      .from('training_enrollments')
      .select('pre_interview_score, post_interview_score, final_score, candidate_name, training_courses!inner(title, category)')
      .in('status', ['completed', 'failed'])
      .not('pre_interview_score', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    let totalImprovement = 0;
    let improved = 0;
    const byCategory: Record<string, { count: number; avgPre: number; avgPost: number; improved: number }> = {};

    for (const r of (completed ?? [])) {
      const pre = Number(r.pre_interview_score);
      const post = Number(r.post_interview_score ?? r.final_score);
      const improvement = post - pre;
      totalImprovement += improvement;
      if (improvement > 0) improved++;

      const cat = (r.training_courses as Record<string, unknown>)?.category as string ?? '未知';
      if (!byCategory[cat]) byCategory[cat] = { count: 0, avgPre: 0, avgPost: 0, improved: 0 };
      byCategory[cat].count++;
      byCategory[cat].avgPre += pre;
      byCategory[cat].avgPost += post;
      if (improvement > 0) byCategory[cat].improved++;
    }

    for (const v of Object.values(byCategory)) {
      v.avgPre = v.count > 0 ? Math.round((v.avgPre / v.count) * 100) / 100 : 0;
      v.avgPost = v.count > 0 ? Math.round((v.avgPost / v.count) * 100) / 100 : 0;
    }

    const totalCompleted = (completed ?? []).length;
    return jsonRes({
      totalCompleted,
      avgImprovement: totalCompleted > 0 ? Math.round((totalImprovement / totalCompleted) * 100) / 100 : 0,
      improvementRate: totalCompleted > 0 ? Math.round((improved / totalCompleted) * 100) : 0,
      byCategory,
    });
  } catch (e) {
    console.error('[training analytics effectiveness]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to analyze effectiveness' } }, 500);
  }
};

// =============================================================================
// Analytics — Recommend Courses
// =============================================================================

const recommendCourses = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();
    const { candidateId } = body;

    if (!candidateId) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'candidateId required' } }, 400);
    }

    // Get candidate's interview results with weak dimensions
    const { data: results } = await supabase
      .from('interview_results')
      .select('dimensions')
      .eq('candidate_id', candidateId);

    const weakDimSet = new Set<string>();
    for (const r of (results ?? [])) {
      const dims = (r.dimensions ?? []) as { name: string; score: number }[];
      for (const d of dims) {
        if (d.score < 60) weakDimSet.add(d.name);
      }
    }
    const dimensions = Array.from(weakDimSet);

    if (dimensions.length === 0) {
      return jsonRes({ dimensions: [], recommendations: [] });
    }

    // Find matching courses
    const { data: courses } = await supabase
      .from('training_courses')
      .select('*')
      .eq('is_active', true)
      .or(dimensions.map(d => `competency_dimension.eq.${d},category.eq.${d}`).join(','))
      .order('difficulty', { ascending: true })
      .order('created_at', { ascending: false });

    return jsonRes({ dimensions, recommendations: courses ?? [] });
  } catch (e) {
    console.error('[training recommend]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to recommend courses' } }, 500);
  }
};

// =============================================================================
// CSV Export
// =============================================================================

const exportEnrollmentsCsv = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const status = getQuery(req, 'status');
    const courseId = getQuery(req, 'courseId');

    let query = supabase
      .from('training_enrollments')
      .select('candidate_name, training_courses!inner(title, category), status, progress_pct, pre_interview_score, final_score, post_interview_score, enrolled_at, completed_at')
      .order('enrolled_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (courseId) query = query.eq('course_id', courseId);

    const { data, error } = await query;
    if (error) throw error;

    const STATUS_MAP: Record<string, string> = {
      enrolled: '已报名', in_progress: '学习中', completed: '已完成', failed: '未通过',
    };

    const header = '学员姓名,课程名称,分类,状态,进度(%),培训前面试分,考核分,培训后面试分,报名时间,完成时间\n';
    const csvRows = (data ?? []).map((r: Record<string, unknown>) => {
      const course = (r.training_courses ?? {}) as Record<string, unknown>;
      const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('zh-CN') : '';
      return [
        r.candidate_name ?? '',
        course.title ?? '',
        course.category ?? '',
        STATUS_MAP[r.status as string] ?? r.status,
        r.progress_pct ?? 0,
        r.pre_interview_score ?? '',
        r.final_score ?? '',
        r.post_interview_score ?? '',
        fmtDate(r.enrolled_at as string),
        fmtDate(r.completed_at as string),
      ].join(',');
    }).join('\n');

    const date = new Date().toISOString().slice(0, 10);
    return textRes('\uFEFF' + header + csvRows, 'text/csv; charset=utf-8', `training-enrollments-${date}.csv`);
  } catch (e) {
    console.error('[training export csv]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to export CSV' } }, 500);
  }
};

// =============================================================================
// Stats
// =============================================================================

const getTrainingStats = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);

    const [
      { count: totalCourses },
      { count: activeEnrollments },
      { count: completedEnrollments },
      { count: failedEnrollments },
      { data: avgData },
    ] = await Promise.all([
      supabase.from('training_courses').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('training_enrollments').select('*', { count: 'exact', head: true }).in('status', ['enrolled', 'in_progress']),
      supabase.from('training_enrollments').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('training_enrollments').select('*', { count: 'exact', head: true }).eq('status', 'failed'),
      supabase.from('training_enrollments').select('final_score').not('final_score', 'is', null),
    ]);

    const scores = (avgData ?? []).map(r => Number(r.final_score));
    const totalDone = (completedEnrollments ?? 0) + (failedEnrollments ?? 0);
    const completionRate = totalDone > 0 ? Math.round(((completedEnrollments ?? 0) / totalDone) * 100) : 0;
    const avgScore = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0;

    return jsonRes({
      totalCourses: totalCourses ?? 0,
      activeEnrollments: activeEnrollments ?? 0,
      completedEnrollments: completedEnrollments ?? 0,
      failedEnrollments: failedEnrollments ?? 0,
      completionRate,
      avgScore,
    });
  } catch (e) {
    console.error('[training stats]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch stats' } }, 500);
  }
};

// =============================================================================
// Public Portal — candidate training progress (no auth)
// =============================================================================

const portalHandler = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getPathSegments(req, '/training/portal');
    const candidateId = segments[0];

    if (!candidateId) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Candidate ID required' } }, 400);
    }

    const token = new URL(req.url).searchParams.get('token');
    if (!(await verifyTrainingPortalToken(candidateId, token))) {
      return jsonRes({ error: { code: 'FORBIDDEN', message: 'Invalid access token' } }, 403);
    }

    // Fetch enrollments with course details
    const { data: enrollments } = await supabase
      .from('training_enrollments')
      .select('*, training_courses!inner(*)')
      .eq('candidate_id', candidateId)
      .order('enrolled_at', { ascending: false });

    // Fetch assessments for each enrollment
    const result = [];
    for (const e of (enrollments ?? [])) {
      const { data: assessments } = await supabase
        .from('training_assessments')
        .select('*')
        .eq('enrollment_id', e.id)
        .order('created_at', { ascending: false });

      const course = (e.training_courses ?? {}) as Record<string, unknown>;
      const { training_courses: _, ...enrollment } = e;
      result.push({ ...enrollment, course_title: course.title, course_category: course.category, course_description: course.description, difficulty: course.difficulty, duration_minutes: course.duration_minutes, content: course.content, materials: course.materials, assessments: assessments ?? [] });
    }

    // Get candidate info
    const { data: candidate } = await supabase
      .from('candidates')
      .select('id, name, email, phone')
      .eq('id', candidateId)
      .single();

    return jsonRes({ candidate: candidate ?? null, enrollments: result });
  } catch (e) {
    console.error('[training portal]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to load portal data' } }, 500);
  }
};

// =============================================================================
// Public Employee Video Share — no enrollment required
// =============================================================================

const shareLinkHandler = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const courseId = String(body.courseId ?? '');
    if (!courseId) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'courseId is required' } }, 400);
    }

    const { data: course, error } = await supabase
      .from('training_courses')
      .select('id, title, video_review_status')
      .eq('id', courseId)
      .eq('is_active', true)
      .single();
    if (error || !course) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: 'Course not found' } }, 404);
    }
    if (!isPublicVideoReviewStatus(course.video_review_status)) {
      return jsonRes({ error: { code: 'REVIEW_REQUIRED', message: '该视频尚未通过公开审核' } }, 409);
    }

    const token = await createTrainingVideoToken(courseId);
    return jsonRes({
      courseId,
      token,
      path: `/tv/${encodeURIComponent(courseId)}/${encodeURIComponent(token)}`,
    });
  } catch (e) {
    console.error('[training share link]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create share link' } }, 500);
  }
};

const publicVideoCourseHandler = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getPathSegments(req, '/training/public/course');
    const courseId = segments[0];
    if (!courseId) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Course ID required' } }, 400);
    }

    const token = new URL(req.url).searchParams.get('token');
    if (!(await verifyTrainingVideoToken(courseId, token))) {
      return jsonRes({ error: { code: 'FORBIDDEN', message: 'Invalid access token' } }, 403);
    }

    const { data, error } = await supabase
      .from('training_courses')
      .select('*, positions(name)')
      .eq('id', courseId)
      .eq('is_active', true)
      .single();
    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: 'Course not found' } }, 404);
    }
    if (!isPublicVideoReviewStatus(data.video_review_status)) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: 'Course not found' } }, 404);
    }

    const [course] = await enrichCoursesWithVideoTaxonomy(supabase, [data]);
    return jsonRes({ course });
  } catch (e) {
    console.error('[training public video]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to load course' } }, 500);
  }
};

// =============================================================================
// Course handler — routes GET/POST/PATCH/DELETE for /training/courses
// =============================================================================

export const handleCourses = async (req: Request): Promise<Response> => {
  const method = req.method;
  switch (method) {
    case 'GET': return listOrGetCourse(req);
    case 'POST': return createCourse(req);
    case 'PATCH': return updateCourse(req);
    case 'DELETE': return deleteCourse(req);
    default: return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, 405);
  }
};

// =============================================================================
// Enrollment handlers — routes GET/POST/PATCH/DELETE for /training/enrollments
// =============================================================================

export const handleEnrollments = async (req: Request): Promise<Response> => {
  // Check if path ends with /:id/assessments
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/embox-api/, '') || '/';

  if (path.includes('/assessments')) {
    if (req.method === 'GET') return listAssessments(req);
    if (req.method === 'POST') return submitAssessment(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, 405);
  }

  switch (req.method) {
    case 'GET': return listEnrollments(req);
    case 'POST': return createEnrollment(req);
    case 'PATCH': return updateEnrollment(req);
    case 'DELETE': return deleteEnrollment(req);
    default: return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, 405);
  }
};

// =============================================================================
// Learning Path handlers
// =============================================================================

const listPaths = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const category = getQuery(req, 'category');
    const positionId = getQuery(req, 'positionId');
    const level = getQuery(req, 'level');
    const active = getQuery(req, 'active');

    let query = supabase.from('training_paths').select('*');
    if (category) query = query.eq('category', category);
    if (positionId) query = query.eq('position_id', positionId);
    if (level) query = query.eq('level', level);
    if (active === '0') query = query.eq('is_active', false);
    else query = query.eq('is_active', true);

    query = query.order('created_at', { ascending: false });

    // For each path, fetch its courses
    const { data: paths, error } = await query;
    if (error) throw error;

    const result = [];
    for (const p of (paths ?? [])) {
      // Get courses associated with this path
      const { data: pathCourses } = await supabase
        .from('training_path_courses')
        .select('*, training_courses(*)')
        .eq('path_id', p.id)
        .order('sort_order');

      // Fetch enrollment stats
      const { count: enrolledCount } = await supabase
        .from('training_path_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('path_id', p.id);

      result.push({
        ...p,
        courses: (pathCourses ?? []).map((pc: Record<string, unknown>) => ({
          id: pc.id,
          pathId: pc.path_id,
          courseId: pc.course_id,
          sortOrder: pc.sort_order,
          isRequired: pc.is_required,
          course: pc.training_courses,
        })),
        enrolledCount: enrolledCount ?? 0,
      });
    }

    return jsonRes({ items: result, total: result.length });
  } catch (e) {
    console.error('[training paths list]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch paths' } }, 500);
  }
};

const getPath = async (req: Request, pathId: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);

    const { data: path, error } = await supabase
      .from('training_paths')
      .select('*')
      .eq('id', pathId)
      .single();

    if (error || !path) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Path (${pathId}) not found` } }, 404);
    }

    const { data: pathCourses } = await supabase
      .from('training_path_courses')
      .select('*, training_courses(*)')
      .eq('path_id', pathId)
      .order('sort_order');

    return jsonRes({
      ...path,
      courses: (pathCourses ?? []).map((pc: Record<string, unknown>) => ({
        id: pc.id,
        pathId: pc.path_id,
        courseId: pc.course_id,
        sortOrder: pc.sort_order,
        isRequired: pc.is_required,
        course: pc.training_courses,
      })),
    });
  } catch (e) {
    console.error('[training paths get]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch path' } }, 500);
  }
};

const createPath = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();

    if (!body.title) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'title is required' } }, 400);
    }

    const { data: path, error } = await supabase.from('training_paths').insert({
      title: body.title,
      description: body.description ?? null,
      category: body.category ?? '通用',
      level: body.level ?? '初级',
      is_certified: body.isCertified ?? false,
      position_id: body.positionId ?? null,
      cover_image_url: body.coverImageUrl ?? null,
    }).select().single();

    if (error) throw error;

    // Attach courses if provided
    const courseIds = body.courseIds as string[] | undefined;
    if (courseIds && courseIds.length > 0) {
      const rows = courseIds.map((cid, i) => ({
        path_id: path.id,
        course_id: cid,
        sort_order: i,
        is_required: true,
      }));
      await supabase.from('training_path_courses').insert(rows);
    }

    return jsonRes(path, 201);
  } catch (e) {
    console.error('[training paths create]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create path' } }, 500);
  }
};

const updatePath = async (req: Request, pathId: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();

    const updates: Record<string, unknown> = {};
    const fieldMap: Record<string, string> = {
      title: 'title', description: 'description', category: 'category',
      level: 'level', isCertified: 'is_certified',
      positionId: 'position_id', coverImageUrl: 'cover_image_url',
      isActive: 'is_active',
    };

    for (const [bodyKey, col] of Object.entries(fieldMap)) {
      if (body[bodyKey] !== undefined) {
        updates[col] = body[bodyKey];
      }
    }

    if (Object.keys(updates).length === 0 && !body.courseIds) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } }, 400);
    }

    if (Object.keys(updates).length > 0) {
      updates['updated_at'] = new Date().toISOString();
      const { error } = await supabase.from('training_paths')
        .update(updates).eq('id', pathId);
      if (error) throw error;
    }

    // Re-sync course associations
    if (body.courseIds !== undefined) {
      const courseIds = body.courseIds as string[];
      // Remove existing
      await supabase.from('training_path_courses').delete().eq('path_id', pathId);
      // Insert new
      if (courseIds.length > 0) {
        const rows = courseIds.map((cid, i) => ({
          path_id: pathId,
          course_id: cid,
          sort_order: i,
          is_required: true,
        }));
        await supabase.from('training_path_courses').insert(rows);
      }
    }

    return getPath(req, pathId);
  } catch (e) {
    console.error('[training paths update]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update path' } }, 500);
  }
};

const deletePath = async (req: Request, pathId: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const { error } = await supabase.from('training_paths').delete().eq('id', pathId);
    if (error) throw error;
    return jsonRes({ deleted: true });
  } catch (e) {
    console.error('[training paths delete]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete path' } }, 500);
  }
};

const addCourseToPath = async (req: Request, pathId: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();
    if (!body.courseId) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'courseId is required' } }, 400);
    }
    const { data, error } = await supabase.from('training_path_courses').insert({
      path_id: pathId,
      course_id: body.courseId,
      sort_order: body.sortOrder ?? 0,
      is_required: body.isRequired ?? true,
    }).select().single();
    if (error) throw error;
    return jsonRes(data, 201);
  } catch (e) {
    console.error('[training paths addCourse]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to add course to path' } }, 500);
  }
};

const removeCourseFromPath = async (req: Request, pathId: string, courseId: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const { error } = await supabase.from('training_path_courses')
      .delete().eq('path_id', pathId).eq('course_id', courseId);
    if (error) throw error;
    return jsonRes({ deleted: true });
  } catch (e) {
    console.error('[training paths removeCourse]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to remove course from path' } }, 500);
  }
};

const getPathEnrollments = async (req: Request, pathId: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const { data, error } = await supabase
      .from('training_path_enrollments')
      .select('*, candidates(id, name)')
      .eq('path_id', pathId)
      .order('enrolled_at', { ascending: false });

    if (error) throw error;
    return jsonRes({ items: data ?? [], total: (data ?? []).length });
  } catch (e) {
    console.error('[training paths enrollments]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch path enrollments' } }, 500);
  }
};

const enrollCandidateInPath = async (req: Request, pathId: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();
    if (!body.candidateId) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'candidateId is required' } }, 400);
    }
    const { data, error } = await supabase.from('training_path_enrollments').insert({
      path_id: pathId,
      candidate_id: body.candidateId,
    }).select().single();
    if (error) {
      if (error.code === '23505') {
        return jsonRes({ error: { code: 'DUPLICATE', message: 'Candidate already enrolled in this path' } }, 409);
      }
      throw error;
    }
    return jsonRes(data, 201);
  } catch (e) {
    console.error('[training paths enroll]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to enroll candidate' } }, 500);
  }
};

const updatePathEnrollment = async (req: Request, enrollmentId: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();
    const updates: Record<string, unknown> = {};
    const fieldMap: Record<string, string> = {
      status: 'status', progressPct: 'progress_pct',
    };
    for (const [bodyKey, col] of Object.entries(fieldMap)) {
      if (body[bodyKey] !== undefined) updates[col] = body[bodyKey];
    }
    if (body.status === 'completed' || body.status === 'failed') {
      updates['completed_at'] = new Date().toISOString();
    }
    updates['updated_at'] = new Date().toISOString();

    const { data, error } = await supabase.from('training_path_enrollments')
      .update(updates).eq('id', enrollmentId).select().single();
    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: 'Path enrollment not found' } }, 404);
    }
    return jsonRes(data);
  } catch (e) {
    console.error('[training paths updateEnrollment]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update enrollment' } }, 500);
  }
};

const deletePathEnrollment = async (req: Request, enrollmentId: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const { error, data } = await supabase.from('training_path_enrollments')
      .delete().eq('id', enrollmentId).select('id').single();
    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: 'Path enrollment not found' } }, 404);
    }
    return jsonRes({ deleted: true, id: data.id });
  } catch (e) {
    console.error('[training paths deleteEnrollment]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete enrollment' } }, 500);
  }
};

export const handlePaths = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/embox-api/, '') || '/';
  // Extract pathId and sub-resource from path: /training/paths/:id
  const afterPaths = path.replace(/^\/training\/paths\/?/, '');
  const segments = afterPaths.split('/').filter(Boolean);
  const pathId = segments[0];
  const subResource = segments[1]; // 'courses', 'enrollments', or a courseId
  const subId = segments[2]; // courseId for /:pathId/courses/:courseId, or candidateId for /:pathId/enrollments

  const method = req.method;

  // No pathId — list or create
  if (!pathId) {
    if (method === 'GET') return listPaths(req);
    if (method === 'POST') return createPath(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, 405);
  }

  // Path-level operations
  if (!subResource) {
    if (method === 'GET') return getPath(req, pathId);
    if (method === 'PATCH') return updatePath(req, pathId);
    if (method === 'DELETE') return deletePath(req, pathId);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, 405);
  }

  // /:pathId/courses and /:pathId/courses/:courseId
  if (subResource === 'courses') {
    if (subId) {
      if (method === 'DELETE') return removeCourseFromPath(req, pathId, subId);
      return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, 405);
    }
    if (method === 'POST') return addCourseToPath(req, pathId);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, 405);
  }

  // /:pathId/enrollments and /:pathId/enrollments/:enrollmentId
  if (subResource === 'enrollments') {
    if (subId) {
      if (method === 'PATCH') return updatePathEnrollment(req, subId);
      if (method === 'DELETE') return deletePathEnrollment(req, subId);
      return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, 405);
    }
    if (method === 'GET') return getPathEnrollments(req, pathId);
    if (method === 'POST') return enrollCandidateInPath(req, pathId);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, 405);
  }

  return jsonRes({ error: { code: 'NOT_FOUND', message: 'Path sub-resource not found' } }, 404);
};

// =============================================================================
// File Upload for training materials
// =============================================================================

const TRAINING_MATERIALS_BUCKET = 'training-materials';
const TRAINING_MATERIALS_MAX_FILE_BYTES = 500 * 1024 * 1024;

const inferTrainingMaterialContentType = (file: File): string => {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  const byExt: Record<string, string> = {
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
  return ext ? byExt[ext] ?? 'application/octet-stream' : 'application/octet-stream';
};

const ensureTrainingMaterialsBucket = async (
  supabase: ReturnType<typeof createSupabaseAdmin>,
) => {
  const { data: existingBucket, error: getBucketError } = await supabase.storage.getBucket(TRAINING_MATERIALS_BUCKET);
  if (existingBucket) {
    const existingLimit = Number((existingBucket as { file_size_limit?: number | null; fileSizeLimit?: number | null }).file_size_limit
      ?? (existingBucket as { fileSizeLimit?: number | null }).fileSizeLimit
      ?? 0);
    const shouldUpdateBucket = existingBucket.public !== true
      || existingLimit <= 0
      || existingLimit < TRAINING_MATERIALS_MAX_FILE_BYTES;
    if (shouldUpdateBucket) {
      const { error: updateBucketError } = await supabase.storage.updateBucket(TRAINING_MATERIALS_BUCKET, {
        public: true,
        fileSizeLimit: TRAINING_MATERIALS_MAX_FILE_BYTES,
        allowedMimeTypes: null,
      });
      if (updateBucketError) {
        throw new Error(`Update storage bucket failed: ${updateBucketError.message}`);
      }
    }
    return;
  }

  if (getBucketError) {
    console.info('[training signed upload] bucket lookup failed, trying to create bucket', {
      bucket: TRAINING_MATERIALS_BUCKET,
      error: getBucketError.message,
    });
  }

  const { error: createBucketError } = await supabase.storage.createBucket(TRAINING_MATERIALS_BUCKET, {
    public: true,
    fileSizeLimit: TRAINING_MATERIALS_MAX_FILE_BYTES,
    allowedMimeTypes: null,
  });
  if (createBucketError) {
    throw new Error(`Create storage bucket failed: ${createBucketError.message}`);
  }
};

const createSignedMaterialUpload = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const filenameRaw = String(body.filename ?? 'video.mp4');
    const ext = filenameRaw.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const fileSize = Number(body.size ?? 0);

    if (fileSize > TRAINING_MATERIALS_MAX_FILE_BYTES) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'File too large (max 500MB)' } }, 400);
    }

    await ensureTrainingMaterialsBucket(supabase);

    const path = `materials/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const { data, error } = await supabase.storage
      .from(TRAINING_MATERIALS_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });

    if (error || !data) {
      throw new Error(`Create signed upload URL failed: ${error?.message ?? 'empty response'}`);
    }

    const { data: urlData } = supabase.storage
      .from(TRAINING_MATERIALS_BUCKET)
      .getPublicUrl(path);

    return jsonRes({
      bucket: TRAINING_MATERIALS_BUCKET,
      path,
      token: data.token,
      signedUrl: data.signedUrl,
      publicUrl: urlData.publicUrl,
      filename: filenameRaw,
    });
  } catch (e) {
    console.error('[training signed upload]', e);
    const message = e instanceof Error ? e.message : 'Failed to create upload URL';
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message } }, 500);
  }
};

const uploadMaterial = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'file is required' } }, 400);
    }

    if (file.size > TRAINING_MATERIALS_MAX_FILE_BYTES) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'File too large (max 500MB)' } }, 400);
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const filename = `materials/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    await ensureTrainingMaterialsBucket(supabase);

    const { data, error } = await supabase.storage
      .from(TRAINING_MATERIALS_BUCKET)
      .upload(filename, await file.arrayBuffer(), {
        contentType: inferTrainingMaterialContentType(file),
        upsert: false,
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from(TRAINING_MATERIALS_BUCKET)
      .getPublicUrl(filename);

    return jsonRes({ url: urlData.publicUrl, filename: file.name }, 201);
  } catch (e) {
    console.error('[training upload]', e);
    const message = e instanceof Error ? e.message : 'Failed to upload file';
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message } }, 500);
  }
};

// =============================================================================
// Batch Enrollment — enroll multiple candidates into a course or path
// =============================================================================

const batchEnroll = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();
    const { candidateIds, courseId, pathId } = body;

    if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'candidateIds array is required' } }, 400);
    }
    if (!courseId && !pathId) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'courseId or pathId is required' } }, 400);
    }

    // Fetch candidate names
    const { data: candidates } = await supabase
      .from('candidates')
      .select('id, name')
      .in('id', candidateIds);

    const candidateMap = new Map((candidates ?? []).map((c: Record<string, unknown>) => [c.id, c.name]));
    const enrolled: { candidateId: string; candidateName: string }[] = [];
    const skipped: { candidateId: string; reason: string }[] = [];

    for (const cid of candidateIds) {
      const name = candidateMap.get(cid) as string | undefined;
      if (!name) {
        skipped.push({ candidateId: cid, reason: 'Candidate not found' });
        continue;
      }

      if (pathId) {
        const { error } = await supabase.from('training_path_enrollments').insert({
          path_id: pathId, candidate_id: cid,
        });
        if (error) {
          if (error.code === '23505') {
            skipped.push({ candidateId: cid, reason: 'Already enrolled' });
          } else {
            skipped.push({ candidateId: cid, reason: error.message });
          }
        } else {
          enrolled.push({ candidateId: cid, candidateName: name });
        }
      } else {
        const { error } = await supabase.from('training_enrollments').insert({
          candidate_id: cid, candidate_name: name, course_id: courseId,
        });
        if (error) {
          if (error.code === '23505') {
            skipped.push({ candidateId: cid, reason: 'Already enrolled' });
          } else {
            skipped.push({ candidateId: cid, reason: error.message });
          }
        } else {
          enrolled.push({ candidateId: cid, candidateName: name });
        }
      }
    }

    return jsonRes({ enrolled, skipped, total: candidateIds.length }, 201);
  } catch (e) {
    console.error('[training batchEnroll]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to batch enroll' } }, 500);
  }
};

// =============================================================================
// Training Notes CRUD — authenticated route; mutations are restricted by router auth.
// =============================================================================

const handleNotes = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/embox-api/, '') || '/';
    const method = req.method;

    // GET /training/notes/:enrollmentId — list notes
    if (method === 'GET' && path.match(/^\/training\/notes\/[^/]+$/)) {
      const enrollmentId = path.split('/')[3];
      const { data, error } = await supabase
        .from('training_notes')
        .select('*')
        .eq('enrollment_id', enrollmentId)
        .order('video_timestamp', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return jsonRes({ items: data ?? [], total: data?.length ?? 0 });
    }

    // POST /training/notes — create note
    if (method === 'POST' && path === '/training/notes') {
      const body = await req.json();
      const { enrollmentId, candidateId, videoTimestamp, noteTitle, noteContent } = body;
      if (!enrollmentId || !candidateId || !noteTitle) {
        return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'enrollmentId, candidateId, noteTitle required' } }, 400);
      }
      const { data, error } = await supabase.from('training_notes').insert({
        enrollment_id: enrollmentId,
        candidate_id: candidateId,
        video_timestamp: videoTimestamp ?? 0,
        note_title: noteTitle,
        note_content: noteContent ?? null,
      }).select().single();
      if (error) throw error;
      return jsonRes(data, 201);
    }

    // PATCH /training/notes/:id — update note
    if (method === 'PATCH' && path.match(/^\/training\/notes\/[^/]+$/)) {
      const noteId = path.split('/')[3];
      const body = await req.json();
      const { noteTitle, noteContent, videoTimestamp } = body;
      const updates: Record<string, unknown> = {};
      if (noteTitle !== undefined) updates.note_title = noteTitle;
      if (noteContent !== undefined) updates.note_content = noteContent;
      if (videoTimestamp !== undefined) updates.video_timestamp = videoTimestamp;
      updates.updated_at = new Date().toISOString();
      const { data, error } = await supabase
        .from('training_notes')
        .update(updates)
        .eq('id', noteId)
        .select()
        .single();
      if (error) throw error;
      if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Note not found' } }, 404);
      return jsonRes(data);
    }

    // DELETE /training/notes/:id — delete note
    if (method === 'DELETE' && path.match(/^\/training\/notes\/[^/]+$/)) {
      const noteId = path.split('/')[3];
      const { error } = await supabase.from('training_notes').delete().eq('id', noteId);
      if (error) throw error;
      return jsonRes({ deleted: true, id: noteId });
    }

    return jsonRes({ error: { code: 'NOT_FOUND', message: 'Notes endpoint not found' } }, 404);
  } catch (e) {
    console.error('[training notes]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to process notes' } }, 500);
  }
};

// =============================================================================
// AI Summarize & Q&A — call LLM with course content/transcript
// =============================================================================

async function resolveTrainingLLMConfig(supabase: ReturnType<typeof createSupabaseAdmin>) {
  let { data } = await supabase
    .from('ai_model_configs')
    .select('*')
    .eq('is_default', true)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!data) {
    const fallback = await supabase
      .from('ai_model_configs')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    data = fallback.data;
  }

  const row = data as Record<string, unknown> | null;
  if (!row) return null;
  return {
    id: String(row.id),
    provider: String(row.provider),
    model_name: String(row.model_name),
    api_key: String(row.api_key),
    base_url: row.base_url ? String(row.base_url) : null,
    temperature: Number(row.temperature ?? 0.7),
    max_tokens: Number(row.max_tokens ?? 4096),
  };
}

async function resolveTrainingVisionLLMConfig(supabase: ReturnType<typeof createSupabaseAdmin>) {
  const getRow = async (query: ReturnType<typeof supabase.from>['select']) => {
    const { data } = await query;
    return data as Record<string, unknown> | null;
  };

  let row: Record<string, unknown> | null = null;
  const visionPatterns = ['glm-5v', 'glm-4v', 'MiniMax-01', 'MiniMax-VL', 'gpt-4o', 'gpt-4v', 'vision', 'gemini'];
  for (const pattern of visionPatterns) {
    row = await getRow(
      supabase.from('ai_model_configs')
        .select('*')
        .ilike('model_name', `%${pattern}%`)
        .eq('is_active', true)
        .limit(1)
        .single(),
    );
    if (row) break;
  }

  if (!row) {
    return resolveTrainingLLMConfig(supabase);
  }

  return {
    id: String(row.id),
    provider: String(row.provider),
    model_name: String(row.model_name),
    api_key: String(row.api_key),
    base_url: row.base_url ? String(row.base_url) : null,
    temperature: Number(row.temperature ?? 0.1),
    max_tokens: Number(row.max_tokens ?? 4096),
  };
}

type TrainingActionCaption = {
  start: number;
  end: number;
  text: string;
  title?: string;
  description?: string;
  handAction?: string;
  objects?: string[];
  result?: string;
  confidence?: number;
};

type TrainingActionCaptionFrame = {
  time?: number;
  image?: string;
  mediaType?: string;
};

type TrainingActionCaptionPayload = {
  courseId?: string;
  title?: string;
  description?: string;
  duration?: number;
  targetUrl?: string;
  frames?: TrainingActionCaptionFrame[];
};

function parseJsonObject(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}

function normalizeActionCaptions(value: unknown, duration: number): TrainingActionCaption[] {
  const items = Array.isArray(value) ? value : [];
  return items
    .map((item) => {
      const row = item as Record<string, unknown>;
      const start = Math.max(0, Number(row.start ?? row.startTime ?? 0));
      const endRaw = Number(row.end ?? row.endTime ?? start + 3);
      const end = Math.max(start + 0.5, Math.min(Number.isFinite(duration) && duration > 0 ? duration : endRaw, endRaw));
      const title = String(row.title ?? row.actionTitle ?? row.action ?? '').trim();
      const description = String(row.description ?? row.detail ?? row.details ?? '').trim();
      const handAction = String(row.handAction ?? row.hand_action ?? row.hand ?? '').trim();
      const result = String(row.result ?? row.outcome ?? '').trim();
      const objects = Array.isArray(row.objects)
        ? row.objects.map(object => String(object).trim()).filter(Boolean).slice(0, 6)
        : [];
      const text = String(row.text ?? row.caption ?? title ?? '').trim();
      const confidence = row.confidence === undefined ? undefined : Math.max(0, Math.min(1, Number(row.confidence)));
      return text ? {
        start,
        end,
        text,
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(handAction ? { handAction } : {}),
        ...(objects.length ? { objects } : {}),
        ...(result ? { result } : {}),
        ...(Number.isFinite(confidence) ? { confidence } : {}),
      } : null;
    })
    .filter((item): item is TrainingActionCaption => Boolean(item))
    .sort((a, b) => a.start - b.start)
    .slice(0, 80);
}

const ACTION_CAPTION_JOB_SELECT = 'id, course_id, target_url, status, progress, error, captions, model, created_at, updated_at, completed_at';

function safeActionCaptionFrames(frames: unknown): TrainingActionCaptionFrame[] {
  return (Array.isArray(frames) ? frames : [])
    .filter((frame): frame is TrainingActionCaptionFrame => {
      const row = frame as TrainingActionCaptionFrame;
      return typeof row.image === 'string' && row.image.length > 0;
    })
    .slice(0, 10);
}

function actionCaptionSystemPrompt(): string {
  return `你是培训视频动作流分析助手。请根据连续视频截图，识别画面中手部动作、身体动作、鼠标/键盘/触控、工具/物品变化和业务操作结果，生成员工观看时可同步显示的中文动作流。

要求：
1. 只返回 JSON，不要解释。
2. 输出 {"captions":[{"start":数字秒,"end":数字秒,"title":"动作标题","text":"短字幕","description":"画面动作说明","handAction":"手部或鼠标键盘动作","objects":["物品或界面元素"],"result":"动作结果","confidence":0到1}]}。
3. title 用 4 到 10 个汉字，text 用 6 到 18 个汉字，适合播放时大字显示。
4. description 说明画面中真实可见的动作和变化，handAction 专门描述手、鼠标、键盘、工具或身体动作。
5. objects 只列画面中能看见或能明确判断的物品/界面元素，不要编造。
6. result 写该动作造成的结果，例如“输入完成”“桌面变干净”“咖啡粉压实”“页面保存成功”。
7. 如果看不清具体文字，可以描述可见动作，不要编造系统不存在的内容。
8. 时间段必须覆盖相邻截图之间的主要动作，动作变化明显时拆成更细片段。`;
}

async function processActionCaptionJob(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  jobId: string,
): Promise<void> {
  try {
    await supabase
      .from('training_action_caption_jobs')
      .update({status: 'running', progress: 72, updated_at: new Date().toISOString()})
      .eq('id', jobId);

    const {data: job, error: jobError} = await supabase
      .from('training_action_caption_jobs')
      .select('id, course_id, target_url, input_payload')
      .eq('id', jobId)
      .single();
    if (jobError || !job) throw jobError ?? new Error('Action caption job not found');

    const payload = ((job as Record<string, unknown>).input_payload ?? {}) as TrainingActionCaptionPayload;
    const courseId = String((job as Record<string, unknown>).course_id ?? payload.courseId ?? '');
    const targetUrl = String((job as Record<string, unknown>).target_url ?? payload.targetUrl ?? '');
    const safeFrames = safeActionCaptionFrames(payload.frames);
    if (!courseId) throw new Error('courseId is required');
    if (safeFrames.length === 0) throw new Error('valid frames are required');

    const { data: course, error: courseError } = await supabase
      .from('training_courses')
      .select('id, title, description, assessment_config')
      .eq('id', courseId)
      .single();
    if (courseError || !course) throw courseError ?? new Error('Course not found');

    const visionConfig = await resolveTrainingVisionLLMConfig(supabase);
    if (!visionConfig) throw new Error('No active vision AI model configured');

    const frameTimes = safeFrames.map(frame => Number(frame.time ?? 0));
    const parts: ContentPart[] = [
      {
        type: 'text',
        text: `课程标题：${payload.title ?? course.title ?? '培训视频'}\n课程描述：${payload.description ?? course.description ?? ''}\n视频时长：${payload.duration ?? '未知'} 秒\n截图时间点：${frameTimes.join(', ')} 秒\n请按时间点生成动作字幕。`,
      },
      ...safeFrames.map(frame => ({
        type: 'image' as const,
        image: {
          media_type: frame.mediaType === 'image/png' ? 'image/png' : 'image/jpeg',
          data: String(frame.image),
        },
      })),
    ];

    await supabase
      .from('training_action_caption_jobs')
      .update({progress: 86, updated_at: new Date().toISOString()})
      .eq('id', jobId);

    const raw = await callVisionLLM(visionConfig, actionCaptionSystemPrompt(), parts);
    const parsed = parseJsonObject(raw);
    const captions = normalizeActionCaptions(parsed.captions, Number(payload.duration ?? 0));
    if (captions.length === 0) throw new Error('AI did not return valid action captions');

    const assessmentConfig = ((course as Record<string, unknown>).assessment_config ?? {}) as Record<string, unknown>;
    const generatedAt = new Date().toISOString();
    const existingByUrl = (
      assessmentConfig.actionCaptionsByUrl
      && typeof assessmentConfig.actionCaptionsByUrl === 'object'
      && !Array.isArray(assessmentConfig.actionCaptionsByUrl)
    )
      ? assessmentConfig.actionCaptionsByUrl as Record<string, unknown>
      : {};
    const captionsByUrl = targetUrl
      ? {...existingByUrl, [targetUrl]: captions}
      : existingByUrl;
    const nextAssessmentConfig = {
      ...assessmentConfig,
      actionCaptions: captions,
      actionCaptionsByUrl: captionsByUrl,
      actionCaptionGeneratedAt: generatedAt,
      actionCaptionSource: 'vision-frames',
      ...(targetUrl ? {actionCaptionTargetUrl: targetUrl} : {}),
    };

    const { error: updateError } = await supabase
      .from('training_courses')
      .update({ assessment_config: nextAssessmentConfig, updated_at: generatedAt })
      .eq('id', courseId);
    if (updateError) throw updateError;

    const { error: completeError } = await supabase
      .from('training_action_caption_jobs')
      .update({
        status: 'succeeded',
        progress: 100,
        captions,
        model: `${visionConfig.provider}/${visionConfig.model_name}`,
        error: null,
        input_payload: {},
        updated_at: generatedAt,
        completed_at: generatedAt,
      })
      .eq('id', jobId);
    if (completeError) throw completeError;
  } catch (error) {
    const now = new Date().toISOString();
    const message = error instanceof Error ? error.message : '生成动作流失败';
    console.error('[training action caption job]', jobId, error);
    await supabase
      .from('training_action_caption_jobs')
      .update({
        status: 'failed',
        progress: 100,
        error: message,
        input_payload: {},
        updated_at: now,
        completed_at: now,
      })
      .eq('id', jobId);
  }
}

function runInBackground(promise: Promise<unknown>): void {
  const runtime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(promise);
    return;
  }
  promise.catch(error => console.error('[background task]', error));
}

const handleTrainingAi = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/embox-api/, '') || '/';

    // GET /training/ai/action-captions/jobs/:id
    if (req.method === 'GET' && path.includes('/action-captions/jobs/')) {
      const jobId = path.split('/action-captions/jobs/')[1]?.split('/')[0];
      if (!jobId) {
        return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'jobId is required' } }, 400);
      }
      const {data, error} = await supabase
        .from('training_action_caption_jobs')
        .select(ACTION_CAPTION_JOB_SELECT)
        .eq('id', jobId)
        .single();
      if (error || !data) {
        return jsonRes({ error: { code: 'NOT_FOUND', message: 'Action caption job not found' } }, 404);
      }
      return jsonRes(data);
    }

    const body = await req.json();

    // POST /training/ai/action-captions/jobs
    if (path.endsWith('/action-captions/jobs')) {
      const { courseId, title, description, duration, targetUrl, frames } = body as TrainingActionCaptionPayload;
      if (!courseId) {
        return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'courseId is required' } }, 400);
      }
      const safeFrames = safeActionCaptionFrames(frames);
      if (safeFrames.length === 0) {
        return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'valid frames are required' } }, 400);
      }

      const { data: course, error: courseError } = await supabase
        .from('training_courses')
        .select('id')
        .eq('id', courseId)
        .single();
      if (courseError || !course) {
        return jsonRes({ error: { code: 'NOT_FOUND', message: 'Course not found' } }, 404);
      }

      const {data: job, error: insertError} = await supabase
        .from('training_action_caption_jobs')
        .insert({
          course_id: courseId,
          target_url: targetUrl ?? null,
          status: 'running',
          progress: 70,
          input_payload: {
            courseId,
            title,
            description,
            duration,
            targetUrl,
            frames: safeFrames,
          },
        })
        .select(ACTION_CAPTION_JOB_SELECT)
        .single();
      if (insertError || !job) throw insertError ?? new Error('Failed to create action caption job');

      runInBackground(processActionCaptionJob(supabase, String(job.id)));
      return jsonRes(job, 202);
    }

    // POST /training/ai/action-captions
    if (path.endsWith('/action-captions')) {
      const { courseId, title, description, duration, targetUrl, frames } = body as {
        courseId?: string;
        title?: string;
        description?: string;
        duration?: number;
        targetUrl?: string;
        frames?: Array<{time?: number; image?: string; mediaType?: string}>;
      };
      if (!courseId) {
        return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'courseId is required' } }, 400);
      }
      if (!Array.isArray(frames) || frames.length === 0) {
        return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'frames are required' } }, 400);
      }

      const { data: course, error: courseError } = await supabase
        .from('training_courses')
        .select('id, title, description, assessment_config')
        .eq('id', courseId)
        .single();
      if (courseError || !course) {
        return jsonRes({ error: { code: 'NOT_FOUND', message: 'Course not found' } }, 404);
      }

      const visionConfig = await resolveTrainingVisionLLMConfig(supabase);
      if (!visionConfig) {
        return jsonRes({ error: { code: 'AI_CONFIG_MISSING', message: 'No active vision AI model configured' } }, 400);
      }

      const safeFrames = safeActionCaptionFrames(frames);
      if (safeFrames.length === 0) {
        return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'valid frames are required' } }, 400);
      }
      const frameTimes = safeFrames.map(frame => Number(frame.time ?? 0));
      const parts: ContentPart[] = [
        {
          type: 'text',
          text: `课程标题：${title ?? course.title ?? '培训视频'}\n课程描述：${description ?? course.description ?? ''}\n视频时长：${duration ?? '未知'} 秒\n截图时间点：${frameTimes.join(', ')} 秒\n请按时间点生成动作字幕。`,
        },
        ...safeFrames.map(frame => ({
          type: 'image' as const,
          image: {
            media_type: frame.mediaType === 'image/png' ? 'image/png' : 'image/jpeg',
            data: String(frame.image),
          },
        })),
      ];

      const raw = await callVisionLLM(visionConfig, actionCaptionSystemPrompt(), parts);
      const parsed = parseJsonObject(raw);
      const captions = normalizeActionCaptions(parsed.captions, Number(duration ?? 0));
      if (captions.length === 0) {
        return jsonRes({ error: { code: 'AI_PARSE_ERROR', message: 'AI did not return valid action captions' } }, 502);
      }

      const assessmentConfig = ((course as Record<string, unknown>).assessment_config ?? {}) as Record<string, unknown>;
      const generatedAt = new Date().toISOString();
      const existingByUrl = (
        assessmentConfig.actionCaptionsByUrl
        && typeof assessmentConfig.actionCaptionsByUrl === 'object'
        && !Array.isArray(assessmentConfig.actionCaptionsByUrl)
      )
        ? assessmentConfig.actionCaptionsByUrl as Record<string, unknown>
        : {};
      const captionsByUrl = targetUrl
        ? {...existingByUrl, [targetUrl]: captions}
        : existingByUrl;
      const nextAssessmentConfig = {
        ...assessmentConfig,
        actionCaptions: captions,
        actionCaptionsByUrl: captionsByUrl,
        actionCaptionGeneratedAt: generatedAt,
        actionCaptionSource: 'vision-frames',
        ...(targetUrl ? {actionCaptionTargetUrl: targetUrl} : {}),
      };
      const { error: updateError } = await supabase
        .from('training_courses')
        .update({ assessment_config: nextAssessmentConfig, updated_at: generatedAt })
        .eq('id', courseId);
      if (updateError) throw updateError;

      return jsonRes({
        captions,
        generatedAt,
        model: `${visionConfig.provider}/${visionConfig.model_name}`,
      });
    }

    const llmConfig = await resolveTrainingLLMConfig(supabase);
    if (!llmConfig) {
      return jsonRes({ error: { code: 'AI_CONFIG_MISSING', message: 'No active AI model configured' } }, 400);
    }

    // POST /training/ai/summarize
    if (path.endsWith('/summarize')) {
      const { content, title } = body;
      if (!content) {
        return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'content is required' } }, 400);
      }
      const systemPrompt = '你是一个专业的培训课程助手。请根据提供的课程内容，生成一个简洁的中文摘要，包括：1）课程主题；2）核心知识点（3-5点）；3）学习建议。回复格式清晰，用中文。';
      const userMessage = `课程标题：${title ?? '未命名课程'}\n\n课程内容：\n${typeof content === 'string' ? content : JSON.stringify(content)}`;
      const result = await callLLM(llmConfig, systemPrompt, userMessage);
      return jsonRes({ summary: result });
    }

    // POST /training/ai/qa
    if (path.endsWith('/qa')) {
      const { question, transcript, videoTime, courseTitle } = body;
      if (!question) {
        return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'question is required' } }, 400);
      }
      const systemPrompt = '你是一个专业的视频学习助手。基于提供的视频文字稿，准确回答用户的问题。如果文字稿中没有相关信息，请说明并尝试基于常识回答。回复用中文，简洁明了。';
      const userMessage = `课程标题：${courseTitle ?? '未知课程'}\n视频时间点：${videoTime ?? '未知'}\n\n文字稿内容：\n${transcript ?? '（无文字稿）'}\n\n用户问题：${question}`;
      const result = await callLLM(llmConfig, systemPrompt, userMessage);
      return jsonRes({ answer: result });
    }

    // POST /training/ai/topics
    if (path.endsWith('/topics')) {
      const { content, title, duration } = body;
      if (!content) {
        return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'content is required' } }, 400);
      }
      const systemPrompt = `你是一个视频内容分析专家。根据提供的带时间戳的视频文字稿，提取3-8个主要主题/话题。

要求：
1. 每个主题必须包含：title（主题名称）、startTime（开始秒数）、endTime（结束秒数）
2. 主题之间可以有间隔，也可以有重叠
3. 时间范围必须基于文字稿中的时间戳
4. 主题名称简洁，2-6个字
5. 必须严格返回JSON格式，不要包含其他文字

返回格式示例：
{"topics":[{"title":"开场介绍","startTime":0,"endTime":150},{"title":"STAR法则","startTime":150,"endTime":480}]}`;
      const userMessage = `课程标题：${title ?? '未命名课程'}\n视频总时长：${duration ? Math.floor(duration) + '秒' : '未知'}\n\n文字稿内容：\n${typeof content === 'string' ? content : JSON.stringify(content)}`;
      const result = await callLLM(llmConfig, systemPrompt, userMessage);
      let topics;
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        topics = jsonMatch ? JSON.parse(jsonMatch[0]) : { topics: [] };
      } catch { topics = { topics: [] }; }
      return jsonRes(topics);
    }

    return jsonRes({ error: { code: 'NOT_FOUND', message: 'AI endpoint not found' } }, 404);
  } catch (e) {
    console.error('[training ai]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to process AI request' } }, 500);
  }
};

// =============================================================================
// Analytics handlers
// =============================================================================

export const handleAnalytics = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/embox-api/, '') || '/';

  if (path.includes('weakness-analysis')) return weaknessAnalysis(req);
  if (path.includes('training-effectiveness')) return trainingEffectiveness(req);
  if (path.includes('recommend-courses')) return recommendCourses(req);

  return jsonRes({ error: { code: 'NOT_FOUND', message: 'Analytics endpoint not found' } }, 404);
};

// Export individual handlers for direct route registration
export {
  getTrainingStats,
  exportEnrollmentsCsv,
  portalHandler,
  shareLinkHandler,
  publicVideoCourseHandler,
  createSignedMaterialUpload,
  uploadMaterial,
  batchEnroll,
  handleNotes,
  handleTrainingAi,
};
