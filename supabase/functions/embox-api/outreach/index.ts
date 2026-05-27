import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const handleOutreach = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  const supabase = createSupabaseAdmin(req);
  const method = req.method;

  try {
    if (method === 'GET') {
      const url = new URL(req.url);
      const candidateId = url.searchParams.get('candidate_id');
      let query = supabase.from('outreach_records').select('*').order('created_at', { ascending: false });
      if (candidateId) query = query.eq('candidate_id', candidateId);
      const { data } = await query;
      return jsonRes(data ?? []);
    }

    if (method === 'POST') {
      const body = await req.json() as Record<string, unknown>;
      const { candidateId, candidateName, positionId, positionName, channel, content } = body;
      if (!candidateId) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'candidateId is required' } }, 400);

      const { data, error } = await supabase.from('outreach_records').insert({
        candidate_id: String(candidateId),
        candidate_name: candidateName ? String(candidateName) : '',
        position_id: positionId ? String(positionId) : null,
        position_name: positionName ? String(positionName) : null,
        channel: channel || 'other',
        status: 'pending',
        content: content ? String(content) : null,
      }).select('*').single();

      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      return jsonRes(data, 201);
    }

    if (method === 'PATCH') {
      const body = await req.json() as Record<string, unknown>;
      const { id, status } = body;
      if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id is required' } }, 400);

      const { data, error } = await supabase.from('outreach_records').update({ status: String(status) }).eq('id', String(id)).select('*').single();
      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Outreach record not found' } }, 404);
      return jsonRes(data);
    }

    if (method === 'DELETE') {
      const body = await req.json() as Record<string, unknown>;
      const { id } = body;
      if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id is required' } }, 400);

      const { error } = await supabase.from('outreach_records').delete().eq('id', String(id));
      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      return jsonRes({ deleted: true, id: String(id) });
    }

    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: `Method ${method} not allowed` } }, 405);
  } catch (e) {
    console.error('[outreach] CRUD:', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};
