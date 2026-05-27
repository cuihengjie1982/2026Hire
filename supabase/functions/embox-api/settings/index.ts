import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// GET /settings/users — list all users (profiles)
export const listUsers = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    return jsonRes(data ?? []);
  } catch (e) {
    console.error('[settings]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// GET /settings/users/me — current user info
export const getMe = async (req: Request, userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
    return jsonRes(data);
  } catch (e) {
    console.error('[settings]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// POST /settings/users — create user via Supabase Auth Admin API
export const createUser = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json() as Record<string, unknown>;
    const { name, email, password, role = 'viewer', department } = body;

    if (!name || !email || !password) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'name, email, and password are required' } }, 400);
    if (String(password).length < 6) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 6 characters' } }, 400);

    const { data: existing } = await supabase.from('profiles').select('id').eq('email', email).single();
    if (existing) return jsonRes({ error: { code: 'CONFLICT', message: 'Email already registered' } }, 409);

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: String(email),
      password: String(password),
      email_confirm: true,
    });

    if (authError || !authData.user) return jsonRes({ error: { code: 'AUTH_ERROR', message: authError?.message ?? 'Failed to create user' } }, 400);

    const userId = authData.user.id;

    const { data: profile } = await supabase.from('profiles').update({
      name: String(name),
      role: String(role),
      department: department ? String(department) : null,
    }).eq('id', userId).select('*').single();

    return jsonRes(profile, 201);
  } catch (e) {
    console.error('[settings]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// PATCH /settings/users/:id — update user profile (admin only, enforced by router)
export const updateUser = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const url = new URL(req.url);
    const match = url.pathname.match(/\/settings\/users\/([^/]+)/);
    if (!match) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'User ID required' } }, 400);
    const id = match[1];

    const body = await req.json() as Record<string, unknown>;
    const allowed = ['name', 'email', 'role', 'phone', 'department', 'avatar', 'status'];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    const { data } = await supabase.from('profiles').update(updates).eq('id', id).select('*').single();
    if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: `User (${id}) not found` } }, 404);
    return jsonRes(data);
  } catch (e) {
    console.error('[settings]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// DELETE /settings/users/:id — delete user via Auth Admin API (admin only)
export const deleteUser = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const url = new URL(req.url);
    const match = url.pathname.match(/\/settings\/users\/([^/]+)/);
    if (!match) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'User ID required' } }, 400);
    const id = match[1];

    const { data: profile } = await supabase.from('profiles').delete().eq('id', id).select('id').single();
    if (!profile) return jsonRes({ error: { code: 'NOT_FOUND', message: `User (${id}) not found` } }, 404);

    await supabase.auth.admin.deleteUser(id);
    return jsonRes({ deleted: true, id });
  } catch (e) {
    console.error('[settings]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// POST /settings/users/reset-password (admin only)
export const resetPassword = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);

    const { userId: id, newPassword } = await req.json() as Record<string, unknown>;
    if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'User ID required' } }, 400);
    if (!newPassword || String(newPassword).length < 6) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: '新密码至少 6 位' } }, 400);

    const { data: user } = await supabase.from('profiles').select('id, name').eq('id', id).single();
    if (!user) return jsonRes({ error: { code: 'NOT_FOUND', message: `User (${id}) not found` } }, 404);

    const { error } = await supabase.auth.admin.updateUserById(id, { password: String(newPassword) });
    if (error) return jsonRes({ error: { code: 'AUTH_ERROR', message: error.message } }, 400);

    return jsonRes({ success: true, message: `${(user as Record<string, unknown>).name} 的密码已重置` });
  } catch (e) {
    console.error('[settings]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// GET /settings/permissions — static permission list
export const getPermissions = async (_req: Request, _userId: string, _userRole: string): Promise<Response> => {
  return jsonRes([
    { key: 'projects:view', label: 'View Projects' },
    { key: 'projects:manage', label: 'Manage Projects' },
    { key: 'positions:view', label: 'View Positions' },
    { key: 'positions:manage', label: 'Manage Positions' },
    { key: 'candidates:view', label: 'View Candidates' },
    { key: 'candidates:manage', label: 'Manage Candidates' },
    { key: 'interviews:view', label: 'View Interviews' },
    { key: 'interviews:manage', label: 'Manage Interviews' },
    { key: 'approvals:view', label: 'View Approvals' },
    { key: 'approvals:decide', label: 'Decide Approvals' },
    { key: 'shortlist:view', label: 'View Shortlist' },
    { key: 'shortlist:manage', label: 'Manage Shortlist' },
    { key: 'outreach:view', label: 'View Outreach' },
    { key: 'outreach:manage', label: 'Manage Outreach' },
    { key: 'agents:view', label: 'View Agents' },
    { key: 'agents:manage', label: 'Manage Agents' },
    { key: 'settings:view', label: 'View Settings' },
    { key: 'settings:manage', label: 'Manage Settings' },
    { key: 'contacts:view', label: 'View Contacts' },
    { key: 'contacts:manage', label: 'Manage Contacts' },
    { key: 'analytics:view', label: 'View Analytics' },
    { key: 'integrations:manage', label: 'Manage Integrations' },
  ]);
};

// GET /settings/role-permissions — static role-permission mapping
export const getRolePermissions = async (_req: Request, _userId: string, _userRole: string): Promise<Response> => {
  return jsonRes([
    { role: 'admin', label: 'Administrator', permissions: ['projects:view', 'projects:manage', 'positions:view', 'positions:manage', 'candidates:view', 'candidates:manage', 'interviews:view', 'interviews:manage', 'approvals:view', 'approvals:decide', 'shortlist:view', 'shortlist:manage', 'outreach:view', 'outreach:manage', 'agents:view', 'agents:manage', 'settings:view', 'settings:manage', 'contacts:view', 'contacts:manage', 'analytics:view', 'integrations:manage'] },
    { role: 'recruiter', label: 'Recruiter', permissions: ['projects:view', 'positions:view', 'candidates:view', 'candidates:manage', 'interviews:view', 'interviews:manage', 'approvals:view', 'shortlist:view', 'shortlist:manage', 'outreach:view', 'outreach:manage', 'agents:view', 'contacts:view', 'contacts:manage', 'analytics:view'] },
    { role: 'interviewer', label: 'Interviewer', permissions: ['projects:view', 'positions:view', 'candidates:view', 'interviews:view', 'interviews:manage', 'approvals:view', 'analytics:view'] },
    { role: 'viewer', label: 'Viewer', permissions: ['projects:view', 'positions:view', 'candidates:view', 'interviews:view', 'approvals:view', 'shortlist:view', 'outreach:view', 'agents:view', 'contacts:view', 'analytics:view'] },
  ]);
};

// PATCH /settings/role-permissions — update role permissions
export const updateRolePermissions = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const { role, permissions } = await req.json() as Record<string, unknown>;
    if (!role) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'role is required' } }, 400);
    return jsonRes({ role, permissions, updated: true });
  } catch (e) {
    console.error('[settings]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// GET /settings/notification-settings (scoped to current user)
export const listNotificationSettings = async (req: Request, userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const { data } = await supabase.from('notification_settings').select('*').eq('user_id', userId).order('type').order('category');
    return jsonRes(data ?? []);
  } catch (e) {
    console.error('[settings]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// PATCH /settings/notification-settings/:id
export const updateNotificationSetting = async (req: Request, userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const url = new URL(req.url);
    const match = url.pathname.match(/\/settings\/notification-settings\/([^/]+)/);
    if (!match) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Setting ID required' } }, 400);
    const id = match[1];

    const { enabled } = await req.json() as Record<string, unknown>;
    if (typeof enabled !== 'boolean') return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'enabled (boolean) is required' } }, 400);

    // Verify ownership: the setting must belong to the current user
    const { data: existing } = await supabase.from('notification_settings').select('user_id').eq('id', id).single();
    if (!existing) return jsonRes({ error: { code: 'NOT_FOUND', message: `Notification setting (${id}) not found` } }, 404);
    if ((existing as Record<string, unknown>).user_id !== userId) {
      return jsonRes({ error: { code: 'FORBIDDEN', message: 'Cannot modify another user\'s settings' } }, 403);
    }

    const { data } = await supabase.from('notification_settings').update({ enabled }).eq('id', id).select('*').single();
    if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: `Notification setting (${id}) not found` } }, 404);
    return jsonRes(data);
  } catch (e) {
    console.error('[settings]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// GET /settings/invites (admin only)
export const listInvites = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const { data } = await supabase.from('team_invites').select('*').order('invited_at', { ascending: false });
    return jsonRes(data ?? []);
  } catch (e) {
    console.error('[settings]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// POST /settings/invites (admin only)
export const createInvite = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const { email, role, invitedBy } = await req.json() as Record<string, unknown>;
    if (!email || !role) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'email and role are required' } }, 400);

    const { data } = await supabase.from('team_invites').upsert({
      email: String(email), role: String(role), status: 'pending', invited_by: invitedBy ? String(invitedBy) : null,
    }, { onConflict: 'email,role' }).select('*').single();

    return jsonRes(data, 201);
  } catch (e) {
    console.error('[settings]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// DELETE /settings/invites/:email (admin only)
export const deleteInvite = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const url = new URL(req.url);
    const match = url.pathname.match(/\/settings\/invites\/([^/]+)/);
    if (!match) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Email required' } }, 400);

    const email = decodeURIComponent(match[1]);
    const role = url.searchParams.get('role');
    if (!role) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'role query parameter is required' } }, 400);

    const { data } = await supabase.from('team_invites').delete().eq('email', email).eq('role', role).select('email').single();
    if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: `Invite for (${email}, ${role}) not found` } }, 404);
    return jsonRes({ deleted: true, email });
  } catch (e) {
    console.error('[settings]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};
