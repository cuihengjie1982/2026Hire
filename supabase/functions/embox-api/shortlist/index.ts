import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';
import {
  appendToLog,
  createInitialLog,
  isOutreachPromote,
} from '../_shared/shortlistStatusLog.ts';

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

async function findDuplicateContact(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  candidateId: string,
  positionId: string | null,
): Promise<boolean> {
  if (!positionId) return false;
  const { data } = await supabase
    .from('contacts')
    .select('id')
    .eq('candidate_id', candidateId)
    .eq('position_id', positionId)
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function updateShortlistStep(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  id: string,
  nextStep: string,
  existingLog: unknown,
): Promise<{ data: Record<string, unknown> | null; error: Error | null }> {
  const statusLog = appendToLog(existingLog, nextStep);
  const { data, error } = await supabase
    .from('shortlist_entries')
    .update({ next_step: nextStep, status_log: statusLog })
    .eq('id', id)
    .select()
    .single();
  return { data: data as Record<string, unknown> | null, error: error as Error | null };
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

    const step = nextStep ?? '待处理';

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
      next_step: step,
      status_log: createInitialLog(step),
    }).select().single();

    if (error) {
      if (error.code === '23505') {
        return jsonRes({ error: { code: 'DUPLICATE', message: '该候选人已在此岗位的入围名单中' } }, 409);
      }
      throw error;
    }
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

    const added: Record<string, unknown>[] = [];
    const skipped: { candidateId: string; reason: string }[] = [];

    for (const e of entries) {
      if (!e.candidateId || !e.candidateName) {
        skipped.push({ candidateId: e.candidateId ?? '', reason: 'candidateId and candidateName are required' });
        continue;
      }
      const step = e.nextStep ?? '待处理';
      const { data, error } = await supabase.from('shortlist_entries').insert({
        candidate_id: e.candidateId,
        candidate_name: e.candidateName,
        role: e.role ?? null,
        position_id: e.positionId ?? null,
        position_name: e.positionName ?? null,
        project_id: e.projectId ?? null,
        project_name: e.projectName ?? null,
        fit_score: e.fitScore ?? 0,
        grade: e.grade ?? null,
        next_step: step,
        status_log: createInitialLog(step),
      }).select().single();

      if (error) {
        if (error.code === '23505') {
          skipped.push({ candidateId: e.candidateId, reason: '已在此岗位的入围名单中' });
        } else {
          skipped.push({ candidateId: e.candidateId, reason: error.message });
        }
      } else if (data) {
        added.push(data);
      }
    }

    return jsonRes({ added: added.length, skipped, entries: added }, 201);
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

    const results: Record<string, unknown>[] = [];
    for (const id of ids) {
      const { data: entry } = await supabase.from('shortlist_entries').select('status_log').eq('id', id).single();
      if (!entry) continue;

      const { data: updated, error } = await supabase.from('shortlist_entries')
        .update({ next_step: nextStep, status_log: appendToLog(entry.status_log, nextStep) })
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

// POST /api/shortlist/:id/promote — update next_step; optional atomic outreach → contact
const promoteEntry = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const segments = getSegments(req);
    const id = segments[0];
    if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id required' } }, 400);

    const body = await req.json() as Record<string, unknown>;
    const { nextStep } = body;
    if (!nextStep) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'nextStep is required' } }, 400);
    }

    const { data: entry, error: entryErr } = await supabase
      .from('shortlist_entries')
      .select('*')
      .eq('id', id)
      .single();

    if (entryErr || !entry) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Shortlist entry (${id}) not found` } }, 404);
    }

    const e = entry as Record<string, unknown>;

    if (isOutreachPromote(body)) {
      const candidateId = String(e.candidate_id ?? '');
      const positionId = e.position_id ? String(e.position_id) : null;

      if (await findDuplicateContact(supabase, candidateId, positionId)) {
        return jsonRes(
          { error: { code: 'DUPLICATE', message: '该候选人已在此岗位的联系人列表中' } },
          409,
        );
      }

      const { data: contact, error: contactErr } = await supabase.from('contacts').insert({
        candidate_id: candidateId,
        candidate_name: String(e.candidate_name ?? ''),
        position_id: positionId,
        position_name: e.position_name ? String(e.position_name) : null,
        project_id: e.project_id ? String(e.project_id) : null,
        project_name: e.project_name ? String(e.project_name) : null,
        outreach_person: String(body.outreachPerson).trim(),
        channel: String(body.channel),
        reason: String(body.reason).trim(),
        status: 'pending',
      }).select('*').single();

      if (contactErr) {
        if (contactErr.code === '23505') {
          return jsonRes(
            { error: { code: 'DUPLICATE', message: '该候选人已在此岗位的联系人列表中' } },
            409,
          );
        }
        return jsonRes({ error: { code: 'DB_ERROR', message: contactErr.message } }, 500);
      }

      const contactId = (contact as Record<string, unknown>).id;
      const { data: updated, error: updateErr } = await updateShortlistStep(
        supabase,
        id,
        String(nextStep),
        e.status_log,
      );

      if (updateErr || !updated) {
        if (contactId) {
          await supabase.from('contacts').delete().eq('id', String(contactId));
        }
        return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to promote entry' } }, 500);
      }

      return jsonRes({ entry: updated, contact });
    }

    const { data, error } = await updateShortlistStep(supabase, id, String(nextStep), e.status_log);

    if (error || !data) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Shortlist entry (${id}) not found` } }, 404);
    }
    return jsonRes({ entry: data });
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

    const { data: entry, error: entryErr } = await supabase.from('shortlist_entries').select('*').eq('id', id).single();
    if (entryErr || !entry) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Shortlist entry (${id}) not found` } }, 404);
    }

    const e = entry as Record<string, unknown>;

    const { error: outreachErr } = await supabase.from('outreach_records').insert({
      candidate_id: e.candidate_id,
      candidate_name: e.candidate_name,
      candidate_email: candidateEmail ?? null,
      position_id: e.position_id,
      position_name: e.position_name,
      type: type ?? 'interview_invite',
      subject: subject ?? null,
      content: content ?? null,
      status: 'sent',
    });
    if (outreachErr) {
      console.error('[shortlist invite outreach]', outreachErr);
    }

    const inviteStep = '已发面试邀请';
    const { data: updated, error } = await supabase.from('shortlist_entries')
      .update({
        next_step: inviteStep,
        status_log: appendToLog(e.status_log, inviteStep),
      })
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

  if (method === 'GET') return listEntries(req);
  if (method === 'POST') return addEntry(req);

  return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
};
