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
    { id: 'projects:view', name: '查看项目', description: '查看项目列表和详情', category: 'position' },
    { id: 'projects:manage', name: '管理项目', description: '创建、编辑、删除项目', category: 'position' },
    { id: 'positions:view', name: '查看岗位', description: '查看岗位列表和详情', category: 'position' },
    { id: 'positions:manage', name: '管理岗位', description: '创建、编辑、删除岗位', category: 'position' },
    { id: 'candidates:view', name: '查看候选人', description: '查看候选人列表和详情', category: 'candidate' },
    { id: 'candidates:manage', name: '管理候选人', description: '导入、编辑、删除候选人', category: 'candidate' },
    { id: 'interviews:view', name: '查看面试', description: '查看面试安排和结果', category: 'interview' },
    { id: 'interviews:manage', name: '管理面试', description: '创建、编辑面试模板和安排', category: 'interview' },
    { id: 'approvals:view', name: '查看审批', description: '查看审批申请列表', category: 'approval' },
    { id: 'approvals:decide', name: '审批决策', description: '批准或拒绝审批申请', category: 'approval' },
    { id: 'shortlist:view', name: '查看短名单', description: '查看短名单和招聘推进', category: 'candidate' },
    { id: 'shortlist:manage', name: '管理短名单', description: '添加、移除短名单候选人', category: 'candidate' },
    { id: 'outreach:view', name: '查看外联', description: '查看外联记录和活动', category: 'candidate' },
    { id: 'outreach:manage', name: '管理外联', description: '创建、编辑外联活动', category: 'candidate' },
    { id: 'agents:view', name: '查看代理', description: '查看AI代理列表和状态', category: 'settings' },
    { id: 'agents:manage', name: '管理代理', description: '创建、编辑、启停AI代理', category: 'settings' },
    { id: 'settings:view', name: '查看设置', description: '查看系统设置', category: 'settings' },
    { id: 'settings:manage', name: '管理设置', description: '修改系统设置和权限', category: 'settings' },
    { id: 'contacts:view', name: '查看联系人', description: '查看联系人列表', category: 'candidate' },
    { id: 'contacts:manage', name: '管理联系人', description: '添加、编辑联系人', category: 'candidate' },
    { id: 'analytics:view', name: '查看数据', description: '查看数据洞察和分析', category: 'data' },
    { id: 'integrations:manage', name: '管理集成', description: '管理外部系统集成', category: 'settings' },
    { id: 'training:view', name: '查看培训', description: '查看培训课程、路径和分析', category: 'training' },
    { id: 'training:manage', name: '管理培训', description: '创建课程、路径，管理报名和评估', category: 'training' },
  ]);
};

// GET /settings/role-permissions — static role-permission mapping
export const getRolePermissions = async (_req: Request, _userId: string, _userRole: string): Promise<Response> => {
  return jsonRes([
    { role: 'admin', permissions: ['projects:view', 'projects:manage', 'positions:view', 'positions:manage', 'candidates:view', 'candidates:manage', 'interviews:view', 'interviews:manage', 'approvals:view', 'approvals:decide', 'shortlist:view', 'shortlist:manage', 'outreach:view', 'outreach:manage', 'agents:view', 'agents:manage', 'settings:view', 'settings:manage', 'contacts:view', 'contacts:manage', 'analytics:view', 'integrations:manage', 'training:view', 'training:manage'] },
    { role: 'hiring_manager', permissions: ['projects:view', 'positions:view', 'candidates:view', 'interviews:view', 'interviews:manage', 'approvals:view', 'approvals:decide', 'shortlist:view', 'outreach:view', 'agents:view', 'contacts:view', 'analytics:view', 'training:view'] },
    { role: 'recruiter', permissions: ['projects:view', 'positions:view', 'candidates:view', 'candidates:manage', 'interviews:view', 'interviews:manage', 'approvals:view', 'shortlist:view', 'shortlist:manage', 'outreach:view', 'outreach:manage', 'agents:view', 'contacts:view', 'contacts:manage', 'analytics:view', 'training:view', 'training:manage'] },
    { role: 'viewer', permissions: ['projects:view', 'positions:view', 'candidates:view', 'interviews:view', 'approvals:view', 'shortlist:view', 'outreach:view', 'agents:view', 'contacts:view', 'analytics:view', 'training:view'] },
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
