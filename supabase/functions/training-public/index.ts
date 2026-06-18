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

function getCourseId(req: Request): string {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/training-public/, '') || '/';
  const segments = path.split('/').filter(Boolean);
  return segments[0] === 'course' ? (segments[1] ?? '') : '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return jsonRes({ ok: true });
  if (req.method !== 'GET') {
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, 405);
  }

  try {
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

    return jsonRes({ course: data });
  } catch (e) {
    console.error('[training-public]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to load course' } }, 500);
  }
});
