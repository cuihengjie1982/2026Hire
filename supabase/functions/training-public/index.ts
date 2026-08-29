import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function jsonRes(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      ...headers,
    },
  });
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

type PublicTrainingClient = ReturnType<typeof createClient>;
const PRIVATE_TRAINING_REVIEW_BUCKET = 'training-review-materials';
const PRIVATE_TRAINING_REVIEW_PREFIX = 'bulk/negative/';
const PRIVATE_TRAINING_SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;

function isPublicVideoReviewStatus(value: unknown): boolean {
  return value === null || value === undefined || value === '' || value === 'approved' || value === 'published';
}

async function enrichCoursesWithVideoTaxonomy(
  supabase: PublicTrainingClient,
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
    return {
      ...course,
      task_category: taskCategoryId ? optionById.get(taskCategoryId) ?? null : null,
      video_scene: sceneId ? optionById.get(sceneId) ?? null : null,
      quality_tag_ids: qualityTagIds,
      quality_tags: qualityTagIds.map(id => optionById.get(id)).filter(Boolean),
    };
  });
}

async function enrichCoursesWithPrivateMedia(
  supabase: PublicTrainingClient,
  courses: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const privateCourses = courses.filter(course => (
    course.video_storage_bucket === PRIVATE_TRAINING_REVIEW_BUCKET
    && typeof course.video_storage_path === 'string'
    && course.video_storage_path.startsWith(PRIVATE_TRAINING_REVIEW_PREFIX)
  ));
  if (!privateCourses.length) return courses;

  const signedEntries = await Promise.all(privateCourses.map(async course => {
    const path = String(course.video_storage_path);
    const {data, error} = await supabase.storage
      .from(PRIVATE_TRAINING_REVIEW_BUCKET)
      .createSignedUrl(path, PRIVATE_TRAINING_SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) {
      console.error('[training-public private media] signed URL failed', {courseId: course.id, path, error: error?.message});
      return null;
    }
    return {courseId: String(course.id), signedUrl: data.signedUrl};
  }));
  const signedUrlByCourse = new Map(
    signedEntries
      .filter((entry): entry is {courseId: string; signedUrl: string} => Boolean(entry))
      .map(entry => [entry.courseId, entry.signedUrl]),
  );

  return courses.map(course => {
    const signedUrl = signedUrlByCourse.get(String(course.id));
    if (!signedUrl) return course;
    const content = Array.isArray(course.content)
      ? course.content.map(section => (
        section && typeof section === 'object' && !Array.isArray(section)
          ? {...section as Record<string, unknown>, contentUrl: signedUrl}
          : section
      ))
      : course.content;
    const materials = Array.isArray(course.materials)
      ? course.materials.map(material => (
        material && typeof material === 'object' && !Array.isArray(material)
          ? {...material as Record<string, unknown>, url: signedUrl}
          : material
      ))
      : course.materials;
    return {...course, content, materials};
  });
}

function getCourseId(req: Request): string {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/training-public/, '') || '/';
  const segments = path.split('/').filter(Boolean);
  return segments[0] === 'course' ? (segments[1] ?? '') : '';
}

function getPathSegments(req: Request): string[] {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/training-public/, '') || '/';
  return path.split('/').filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return jsonRes({ ok: true });
  if (req.method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      },
    });
  }
  if (req.method !== 'GET') {
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, 405);
  }

  try {
    const segments = getPathSegments(req);
    if (segments[0] === 'courses') {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );
      const { data, error } = await supabase
        .from('training_courses')
        .select('*, positions(name)')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      const publicCourses = ((data ?? []) as Record<string, unknown>[]).filter(course => isPublicVideoReviewStatus(course.video_review_status));
      const enrichedCourses = await enrichCoursesWithPrivateMedia(
        supabase,
        await enrichCoursesWithVideoTaxonomy(
          supabase,
          publicCourses,
        ),
      );
      const items = await Promise.all(enrichedCourses.map(async (course) => {
        const token = await createTrainingVideoToken(String(course.id));
        return {
          ...course,
          share_token: token,
          share_path: `/tv/${encodeURIComponent(String(course.id))}/${encodeURIComponent(token)}`,
        };
      }));

      return jsonRes({ items, total: items.length, page: 1, pageSize: items.length });
    }

    const courseId = getCourseId(req);
    if (!courseId) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Course ID required' } }, 400);
    }

    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (!(await verifyTrainingVideoToken(courseId, token))) {
      return jsonRes({ error: { code: 'FORBIDDEN', message: 'Invalid access token' } }, 403);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
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

    const [course] = await enrichCoursesWithPrivateMedia(
      supabase,
      await enrichCoursesWithVideoTaxonomy(supabase, [data]),
    );
    return jsonRes({course});
  } catch (e) {
    console.error('[training-public]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to load course' } }, 500);
  }
});
