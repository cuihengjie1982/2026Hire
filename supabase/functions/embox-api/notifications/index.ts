import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// GET /notifications — list current user's notifications
export const listNotifications = async (req: Request, userId: string, _userRole: string): Promise<Response> => {
  try {
    console.log('[notifications] listNotifications called, userId:', userId, 'url:', req.url);
    const supabase = createSupabaseAdmin(req);
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const unreadOnly = url.searchParams.get('unread') === 'true';

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) query = query.eq('read', false);

    const { data, error } = await query;
    if (error) {
      console.error('[notifications] DB query error:', JSON.stringify(error));
      return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
    }

    // Also get unread count
    const { count, error: countError } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (countError) {
      console.error('[notifications] Count query error:', JSON.stringify(countError));
    }

    return jsonRes({ notifications: data ?? [], unreadCount: count ?? 0 });
  } catch (err) {
    console.error('[notifications] Unhandled error:', err);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) } }, 500);
  }
};

// PATCH /notifications/mark-read — mark one or all as read
export const markRead = async (req: Request, userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json() as Record<string, unknown>;
    const notificationId = body.id as string | undefined;

    if (notificationId) {
      // Mark single notification
      const { data } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId)
        .eq('user_id', userId)
        .select('*')
        .single();
      return jsonRes(data);
    } else {
      // Mark all as read
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false);
      return jsonRes({ success: true });
    }
  } catch (e) {
    console.error('[notifications]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// DELETE /notifications/:id — dismiss a notification
export const dismissNotification = async (req: Request, userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const url = new URL(req.url);
    const match = url.pathname.match(/\/notifications\/([^/]+)/);
    if (!match) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Notification ID required' } }, 400);

    await supabase
      .from('notifications')
      .delete()
      .eq('id', match[1])
      .eq('user_id', userId);

    return jsonRes({ success: true });
  } catch (e) {
    console.error('[notifications]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// POST /notifications/create — internal: create a notification for a user
export const createNotification = async (
  supabase: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  type: string,
  title: string,
  message: string,
  link?: string,
): Promise<void> => {
  await supabase.from('notifications').insert({
    user_id: userId,
    type,
    title,
    message,
    link: link ?? null,
  });
};

/** Notify all users with a given role */
export const notifyByRole = async (
  supabase: ReturnType<typeof createSupabaseAdmin>,
  role: string,
  type: string,
  title: string,
  message: string,
  link?: string,
): Promise<void> => {
  const { data: users } = await supabase.from('profiles').select('id').eq('role', role).eq('status', 'active');
  if (!users) return;
  const rows = users.map((u: Record<string, unknown>) => ({
    user_id: u.id,
    type,
    title,
    message,
    link: link ?? null,
  }));
  if (rows.length > 0) {
    await supabase.from('notifications').insert(rows);
  }
};

/** Notify all admins */
export const notifyAdmins = async (
  supabase: ReturnType<typeof createSupabaseAdmin>,
  type: string,
  title: string,
  message: string,
  link?: string,
): Promise<void> => {
  await notifyByRole(supabase, 'admin', type, title, message, link);
};

/** Notify all recruiters */
export const notifyRecruiters = async (
  supabase: ReturnType<typeof createSupabaseAdmin>,
  type: string,
  title: string,
  message: string,
  link?: string,
): Promise<void> => {
  await notifyByRole(supabase, 'recruiter', type, title, message, link);
};
