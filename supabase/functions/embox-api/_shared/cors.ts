const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:3000').split(',').map(s => s.trim()).filter(Boolean);

function getAllowedOrigin(req: Request): string | null {
  const origin = req.headers.get('Origin');
  if (!origin) return null;
  // Allow any localhost origin for development
  if (/^http:\/\/localhost:\d+$/.test(origin)) return origin;
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  return null;
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const allowedOrigin = getAllowedOrigin(req);
  // If no allowed origin matches, fall back to the request's own origin
  // so the browser at least gets a readable error instead of a CORS blackout
  const origin = allowedOrigin ?? req.headers.get('Origin') ?? ALLOWED_ORIGINS[0] ?? 'http://localhost:3000';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, PATCH, DELETE',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }
  return null;
}

