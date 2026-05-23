import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Service-role client — bypasses RLS. Handlers must filter by userId explicitly. */
export function createSupabaseAdmin(_req?: Request) {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

/** User-scoped client — sets Authorization to the caller's JWT so RLS applies. */
export function createUserClient(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');

  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}
