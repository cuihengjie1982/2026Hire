import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const handleProjects = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  const supabase = createSupabaseAdmin(req);
  const method = req.method;

  try {
    if (method === 'GET') {
      const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
      return jsonRes(data ?? []);
    }

    if (method === 'POST') {
      const body = await req.json() as Record<string, unknown>;
      const { name, description, city, progress, startDate, endDate, status, manager } = body;
      if (!name) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'name is required' } }, 400);

      const { data, error } = await supabase.from('projects').insert({
        name: String(name),
        description: description ? String(description) : null,
        city: city ? String(city) : null,
        progress: progress ? Number(progress) : 0,
        start_date: startDate ? String(startDate) : null,
        end_date: endDate ? String(endDate) : null,
        status: status ? String(status) : '筹备中',
        manager: manager ? String(manager) : null,
      }).select('*').single();

      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      return jsonRes(data, 201);
    }

    if (method === 'PATCH') {
      const body = await req.json() as Record<string, unknown>;
      const { id, ...updates } = body;
      if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id is required' } }, 400);

      const row: Record<string, unknown> = {};
      if (updates.name !== undefined) row.name = updates.name;
      if (updates.description !== undefined) row.description = updates.description;
      if (updates.city !== undefined) row.city = updates.city;
      if (updates.progress !== undefined) row.progress = updates.progress;
      if (updates.status !== undefined) row.status = updates.status;
      if (updates.manager !== undefined) row.manager = updates.manager;
      if (updates.startDate !== undefined) row.start_date = updates.startDate ? String(updates.startDate) : null;
      if (updates.endDate !== undefined) row.end_date = updates.endDate ? String(updates.endDate) : null;

      if (Object.keys(row).length === 0) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } }, 400);

      const { data, error } = await supabase.from('projects').update(row).eq('id', String(id)).select('*').single();
      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);
      return jsonRes(data);
    }

    if (method === 'DELETE') {
      const body = await req.json() as Record<string, unknown>;
      const { id } = body;
      if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id is required' } }, 400);

      const { data, error } = await supabase.from('projects').delete().eq('id', String(id)).select('id').single();
      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);
      return jsonRes({ deleted: true, id: String(id) });
    }

    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: `Method ${method} not allowed` } }, 405);
  } catch (e) {
    console.error('[projects] CRUD:', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};
