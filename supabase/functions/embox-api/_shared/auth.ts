import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

export interface AuthResult {
  user: AuthUser;
  supabase: ReturnType<typeof createClient>;
}

/**
 * Verify JWT from Authorization header, fetch user's role from profiles,
 * and optionally enforce role-based access control.
 *
 * Returns { user, supabase } on success, or a Response (401/403) on failure.
 */
export async function authenticate(
  req: Request,
  options?: { requireRole?: string[] },
): Promise<{ data: AuthResult } | { error: Response }> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    return {
      error: new Response(
        JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Missing Authorization header' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    };
  }

  // Create a client with the service role key for DB operations
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // Verify the JWT and get user info
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !authUser) {
    return {
      error: new Response(
        JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    };
  }

  // Fetch role from profiles table
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authUser.id)
    .single();

  if (profileError || !profile) {
    return {
      error: new Response(
        JSON.stringify({ error: { code: 'FORBIDDEN', message: 'User profile not found' } }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ),
    };
  }

  const user: AuthUser = {
    id: authUser.id,
    email: authUser.email ?? '',
    role: profile.role,
  };

  // Role-based access control
  if (options?.requireRole && options.requireRole.length > 0) {
    if (!options.requireRole.includes(user.role)) {
      return {
        error: new Response(
          JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        ),
      };
    }
  }

  return { data: { user, supabase } };
}

/** Convenience: require admin role */
export async function requireAdmin(req: Request) {
  return authenticate(req, { requireRole: ['admin'] });
}

/** Convenience: require recruiter or admin */
export async function requireRecruiterOrAbove(req: Request) {
  return authenticate(req, { requireRole: ['admin', 'recruiter'] });
}

/** Convenience: require hiring_manager, recruiter, or admin */
export async function requireHiringManagerOrAbove(req: Request) {
  return authenticate(req, { requireRole: ['admin', 'recruiter', 'hiring_manager'] });
}

/** Convenience: any authenticated user */
export async function requireAuth(req: Request) {
  return authenticate(req);
}
