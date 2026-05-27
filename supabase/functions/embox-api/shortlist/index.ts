import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';

function jsonRes(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function getQuery(req: Request, key: string): string | null {
  return new URL(req.url).searchParams.get(key);
}

// Extract path segments after /api/shortlist
function getSegments(req: Request): string[] {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/embox-api\/api\/shortlist\/?/, '');
  return path.split('/').filter(Boolean);
}

// GET /api/shortlist — list entries with pagination and filters
const listEntries = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const projectId = getQuery(req, 'projectId');
    const positionId = getQuery(req, 'positionId');
    const page = parseInt(getQuery(req, 'page') ?? '1', 10);
    const pageSize = Math.min(parseInt(getQuery(req, 'pageSize') ?? '50', 10), 200);
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('shortlist_entries')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (projectId) query = query.eq('project_id', projectId);
    if (positionId) query = query.eq('position_id', positionId);

    const { data, count, error } = await query;
    if (error) throw error;

    return jsonRes({ items: data ?? [], total: count ?? 0, page, pageSize: pageSize });
  } catch (e) {
    console.error('[shortlist list]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list shortlist entries' } }, 500);
  }
};

// POST /api/shortlist — add single entry
const addEntry = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();
    const { candidateId, candidateName, role, positionId, positionName, projectId, projectName, fitScore, grade, nextStep } = body;

    if (!candidateId || !candidateName) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'candidateId and candidateName are required' } }, 400);
    }

    const statusLog = JSON.stringify([{ status: nextStep ?? '待处理', at: new Date().toISOString() }]);

    const { data, error } = await supabase.from('shortlist_entries').insert({
      candidate_id: candidateId,
      candidate_name: candidateName,
      role: role ?? null,
      position_id: positionId ?? null,
      position_name: positionName ?? null,
      project_id: projectId ?? null,
      project_name: projectName ?? null,
      fit_score: fitScore ?? 0,
      grade: grade ?? null,
      next_step: nextStep ?? '待处理',
      status_log: statusLog,
    }).select().single();

    if (error) throw error;
    return jsonRes(data, 201);
  } catch (e) {
    console.error('[shortlist add]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to add shortlist entry' } }, 500);
  }
};

// POST /api/shortlist/batch — batch add entries
const batchAdd = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();
    const { entries } = body;

    if (!Array.isArray(entries) || entries.length === 0) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'entries must be a non-empty array' } }, 400);
    }

    const rows = entries.map((e: Record<string, unknown>) => {
      if (!e.candidateId || !e.candidateName) {
        throw new Error('Each entry requires candidateId and candidateName');
      }
      return {
        candidate_id: e.candidateId,
        candidate_name: e.candidateName,
        role: e.role ?? null,
        position_id: e.positionId ?? null,
        position_name: e.positionName ?? null,
        project_id: e.projectId ?? null,
        project_name: e.projectName ?? null,
        fit_score: e.fitScore ?? 0,
        grade: e.grade ?? null,
        next_step: e.nextStep ?? '待处理',
        status_log: JSON.stringify([{ status: e.nextStep ?? '待处理', at: new Date().toISOString() }]),
      };
    });

    const { data, error } = await supabase.from('shortlist_entries').insert(rows).select();
    if (error) throw error;

    return jsonRes({ added: (data ?? []).length, entries: data ?? [] }, 201);
  } catch (e) {
    if (e instanceof Error && e.message.includes('requires')) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: e.message } }, 400);
    }
    console.error('[shortlist batch add]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to batch add' } }, 500);
  }
};

// DELETE /api/shortlist/batch — batch remove entries
const batchRemove = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'ids must be a non-empty array' } }, 400);
    }

    const { data, error } = await supabase.from('shortlist_entries').delete().in('id', ids).select('id');
    if (error) throw error;

    return jsonRes({ removed: (data ?? []).length, ids: (data ?? []).map((r: Record<string, unknown>) => r.id) });
  } catch (e) {
    console.error('[shortlist batch remove]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to batch remove' } }, 500);
  }
};

// PATCH /api/shortlist/batch/status — batch update next_step
const batchUpdateStatus = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();
    const { ids, nextStep } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'ids must be a non-empty array' } }, 400);
    }
    if (!nextStep) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'nextStep is required' } }, 400);
    }

    // For each ID, fetch current status_log, append, and update
    const results: Record<string, unknown>[] = [];
    for (const id of ids) {
      const { data: entry } = await supabase.from('shortlist_entries').select('status_log').eq('id', id).single();
      const currentLog = (entry?.status_log ?? []) as unknown[];
      currentLog.push({ status: nextStep, at: new Date().toISOString() });

      const { data: updated, error } = await supabase.from('shortlist_entries')
        .update({ next_step: nextStep, status_log: currentLog })
        .eq('id', id).select().single();
      if (error) throw error;
      if (updated) results.push(updated);
    }

    return jsonRes({ updated: results.length, entries: results });
  } catch (e) {
    console.error('[shortlist batch status]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update status' } }, 500);
  }
};

// GET /api/shortlist/:id/history — get status change history
const getHistory = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getSegments(req);
    const id = segments[0];
    if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id required' } }, 400);

    const { data, error } = await supabase.from('shortlist_entries')
      .select('id, candidate_name, next_step, status_log').eq('id', id).single();

    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Shortlist entry (${id}) not found` } }, 404);
    }
    return jsonRes(data);
  } catch (e) {
    console.error('[shortlist history]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get history' } }, 500);
  }
};

// POST /api/shortlist/:id/promote — update next_step
const promoteEntry = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getSegments(req);
    const id = segments[0];
    if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id required' } }, 400);

    const body = await req.json();
    const { nextStep } = body;
    if (!nextStep) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'nextStep is required' } }, 400);
    }

    const { data: entry } = await supabase.from('shortlist_entries').select('status_log').eq('id', id).single();
    if (!entry) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Shortlist entry (${id}) not found` } }, 404);
    }

    const currentLog = (entry.status_log ?? []) as unknown[];
    currentLog.push({ status: nextStep, at: new Date().toISOString() });

    const { data, error } = await supabase.from('shortlist_entries')
      .update({ next_step: nextStep, status_log: currentLog })
      .eq('id', id).select().single();

    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Shortlist entry (${id}) not found` } }, 404);
    }
    return jsonRes(data);
  } catch (e) {
    console.error('[shortlist promote]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to promote entry' } }, 500);
  }
};

// POST /api/shortlist/:id/interview-invite — create outreach + update status
const interviewInvite = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getSegments(req);
    const id = segments[0];
    if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id required' } }, 400);

    const body = await req.json();
    const { type, subject, content, candidateEmail } = body;

    // Get the entry
    const { data: entry, error: entryErr } = await supabase.from('shortlist_entries').select('*').eq('id', id).single();
    if (entryErr || !entry) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Shortlist entry (${id}) not found` } }, 404);
    }

    // Create outreach record
    const { error: outreachErr } = await supabase.from('outreach_records').insert({
      candidate_id: entry.candidate_id,
      candidate_name: entry.candidate_name,
      candidate_email: candidateEmail ?? null,
      position_id: entry.position_id,
      position_name: entry.position_name,
      type: type ?? 'interview_invite',
      subject: subject ?? null,
      content: content ?? null,
      status: 'sent',
    });
    if (outreachErr) {
      console.error('[shortlist invite outreach]', outreachErr);
    }

    // Update shortlist status
    const currentLog = (entry.status_log ?? []) as unknown[];
    currentLog.push({ status: '已发面试邀请', at: new Date().toISOString() });

    const { data: updated, error } = await supabase.from('shortlist_entries')
      .update({ next_step: '已发面试邀请', status_log: currentLog })
      .eq('id', id).select().single();

    if (error || !updated) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Shortlist entry (${id}) not found` } }, 404);
    }
    return jsonRes(updated);
  } catch (e) {
    console.error('[shortlist interview-invite]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to send interview invite' } }, 500);
  }
};

// Main handler — routes all /api/shortlist* requests
export const handleShortlist = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/embox-api/, '') || '/';
  const method = req.method;

  if (path.includes('/batch/status')) {
    if (method === 'PATCH') return batchUpdateStatus(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  }
  if (path.includes('/batch')) {
    if (method === 'POST') return batchAdd(req);
    if (method === 'DELETE') return batchRemove(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  }
  if (path.includes('/interview-invite')) {
    if (method === 'POST') return interviewInvite(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  }
  if (path.includes('/promote')) {
    if (method === 'POST') return promoteEntry(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  }
  if (path.includes('/history')) {
    if (method === 'GET') return getHistory(req);
    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  }

  // /api/shortlist (no sub-path or just /api/shortlist/)
  if (method === 'GET') return listEntries(req);
  if (method === 'POST') return addEntry(req);

  return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
};
