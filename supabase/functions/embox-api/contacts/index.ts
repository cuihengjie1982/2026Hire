import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const handleContacts = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  const supabase = createSupabaseAdmin(req);
  const method = req.method;

  try {
    if (method === 'GET') {
      const url = new URL(req.url);
      const projectId = url.searchParams.get('project_id');
      const candidateId = url.searchParams.get('candidate_id');
      let query = supabase.from('contacts').select('*').order('created_at', { ascending: false });
      if (projectId) query = query.eq('project_id', projectId);
      if (candidateId) query = query.eq('candidate_id', candidateId);
      const { data } = await query;
      return jsonRes(data ?? []);
    }

    if (method === 'POST') {
      const body = await req.json() as Record<string, unknown>;
      const { candidateId, candidateName, positionId, positionName, projectId, projectName, outreachPerson, channel, reason } = body;
      if (!candidateId) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'candidateId is required' } }, 400);

      if (positionId) {
        const { data: existing } = await supabase
          .from('contacts')
          .select('id')
          .eq('candidate_id', String(candidateId))
          .eq('position_id', String(positionId))
          .limit(1)
          .maybeSingle();
        if (existing) {
          return jsonRes({ error: { code: 'DUPLICATE', message: '该候选人已在此岗位的联系人列表中' } }, 409);
        }
      }

      const { data, error } = await supabase.from('contacts').insert({
        candidate_id: String(candidateId),
        candidate_name: candidateName ? String(candidateName) : '',
        position_id: positionId ? String(positionId) : null,
        position_name: positionName ? String(positionName) : null,
        project_id: projectId ? String(projectId) : null,
        project_name: projectName ? String(projectName) : null,
        outreach_person: outreachPerson ? String(outreachPerson) : '',
        channel: channel || 'email',
        reason: reason ? String(reason) : '',
        status: 'pending',
      }).select('*').single();

      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      return jsonRes(data, 201);
    }

    if (method === 'PATCH') {
      const body = await req.json() as Record<string, unknown>;
      const { id, status, outreachPerson, channel, reason } = body;
      if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id is required' } }, 400);

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (status !== undefined) updates.status = String(status);
      if (outreachPerson !== undefined) updates.outreach_person = String(outreachPerson);
      if (channel !== undefined) updates.channel = String(channel);
      if (reason !== undefined) updates.reason = String(reason);

      if (Object.keys(updates).length === 1) {
        return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } }, 400);
      }

      const { data, error } = await supabase.from('contacts').update(updates).eq('id', String(id)).select('*').single();
      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Contact not found' } }, 404);
      return jsonRes(data);
    }

    if (method === 'DELETE') {
      const url = new URL(req.url);
      const pathMatch = url.pathname.match(/\/contacts\/([^/]+)$/);
      const id = pathMatch?.[1] ?? '';
      if (!id) {
        return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id is required' } }, 400);
      }

      const { data, error } = await supabase.from('contacts').delete().eq('id', id).select('id').maybeSingle();
      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Contact not found' } }, 404);
      return jsonRes({ success: true, id: data.id });
    }

    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: `Method ${method} not allowed` } }, 405);
  } catch (e) {
    console.error('[contacts] CRUD:', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};
