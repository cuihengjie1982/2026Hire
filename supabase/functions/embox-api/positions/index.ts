import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const handlePositions = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  const supabase = createSupabaseAdmin(req);
  const method = req.method;
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/embox-api\/positions/, '') || '/';

  try {
    // GET /positions — list all, optionally filtered by project_id
    if (method === 'GET' && path === '/') {
      const projectId = url.searchParams.get('project_id');
      let query = supabase.from('positions').select('*').order('created_at', { ascending: false });
      if (projectId) query = query.eq('project_id', projectId);
      const { data } = await query;
      return jsonRes(data ?? []);
    }

    // GET /positions/:id/detail
    if (method === 'GET' && path.startsWith('/') && path.endsWith('/detail')) {
      const positionId = path.replace(/^\//, '').replace(/\/detail$/, '');
      const { data: pos } = await supabase.from('positions').select('*').eq('id', positionId).single();
      if (!pos) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Position not found' } }, 404);

      const { data: detail } = await supabase.from('position_details').select('*').eq('position_id', positionId).maybeSingle();
      return jsonRes({ position: pos, detail: detail ?? {} });
    }

    // POST /positions
    if (method === 'POST' && path === '/') {
      const body = await req.json() as Record<string, unknown>;
      const { name, category, status, projectId, description, requiredCount, deliveryDays } = body;
      if (!name) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'name is required' } }, 400);

      const code = `POS-${Date.now()}`;
      const { data, error } = await supabase.from('positions').insert({
        code,
        name: String(name),
        category: category ? String(category) : '',
        status: status || 'active',
        project_id: projectId ? String(projectId) : null,
        description: description ? String(description) : null,
        required_count: requiredCount ? Number(requiredCount) : 0,
        delivery_days: deliveryDays ? Number(deliveryDays) : 0,
      }).select('*').single();

      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      if (!data) return jsonRes({ error: { code: 'DB_ERROR', message: 'Failed to create position' } }, 500);

      // Create empty position_details row
      await supabase.from('position_details').insert({ position_id: (data as Record<string, unknown>).id });

      return jsonRes(data, 201);
    }

    // PATCH /positions
    if (method === 'PATCH' && path === '/') {
      const body = await req.json() as Record<string, unknown>;
      const { id, ...updates } = body;
      if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id is required' } }, 400);

      const row: Record<string, unknown> = {};
      if (updates.name !== undefined) row.name = updates.name;
      if (updates.category !== undefined) row.category = updates.category;
      if (updates.status !== undefined) row.status = updates.status;
      if (updates.description !== undefined) row.description = updates.description;
      if (updates.requiredCount !== undefined) row.required_count = updates.requiredCount;
      if (updates.deliveryDays !== undefined) row.delivery_days = updates.deliveryDays;

      const { data, error } = await supabase.from('positions').update(row).eq('id', String(id)).select('*').single();
      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Position not found' } }, 404);
      return jsonRes(data);
    }

    // DELETE /positions
    if (method === 'DELETE' && path === '/') {
      const body = await req.json() as Record<string, unknown>;
      const { id } = body;
      if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id is required' } }, 400);

      // Delete position_details first (FK), then positions
      await supabase.from('position_details').delete().eq('position_id', String(id));
      const { data, error } = await supabase.from('positions').delete().eq('id', String(id)).select('id').single();
      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Position not found' } }, 404);
      return jsonRes({ deleted: true, id: String(id) });
    }

    // POST /positions/detail — save position_detail
    if (method === 'POST' && path === '/detail') {
      const body = await req.json() as Record<string, unknown>;
      const { positionId, profileRules, scoringRules, gradeRules, baseScoreConfig, aiPrompt } = body;
      if (!positionId) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'positionId is required' } }, 400);

      const { data, error } = await supabase.from('position_details').upsert({
        position_id: String(positionId),
        profile_rules: profileRules || [],
        scoring_rules: scoringRules || [],
        grade_rules: gradeRules || [],
        base_score_config: baseScoreConfig || null,
        ai_prompt: aiPrompt || '',
      }, { onConflict: 'position_id' }).select('*').single();

      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      return jsonRes(data);
    }

    return jsonRes({ error: { code: 'NOT_FOUND', message: `Route ${method} ${path} not found` } }, 404);
  } catch (e) {
    console.error('[positions] CRUD:', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};
