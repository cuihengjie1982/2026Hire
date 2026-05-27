import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const stringifyIfObject = (v: unknown) => typeof v === 'object' && v !== null ? JSON.stringify(v) : v;

export const handleInterviews = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  const supabase = createSupabaseAdmin(req);
  const method = req.method;
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/embox-api\/interviews/, '') || '/';

  try {
    // ── Templates ──────────────────────────────────────────────

    if (path === '/templates' && method === 'GET') {
      const id = url.searchParams.get('id');
      if (id) {
        const { data } = await supabase.from('interview_templates').select('*').eq('id', id).single();
        if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Template not found' } }, 404);
        return jsonRes(data);
      }
      const { data } = await supabase.from('interview_templates').select('*').order('created_at', { ascending: false });
      return jsonRes(data ?? []);
    }

    if (path === '/templates' && method === 'POST') {
      const body = await req.json() as Record<string, unknown>;
      const { name, positionId, durationMinutes, status, scoringConfig, gradeRules } = body;
      if (!name) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'name is required' } }, 400);

      const { data, error } = await supabase.from('interview_templates').insert({
        name: String(name),
        position_id: positionId ? String(positionId) : null,
        duration_minutes: durationMinutes ? Number(durationMinutes) : 0,
        status: status || 'draft',
        scoring_config: scoringConfig ? JSON.stringify(scoringConfig) : undefined,
        grade_rules: gradeRules ? JSON.stringify(gradeRules) : undefined,
      }).select('*').single();

      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      return jsonRes(data, 201);
    }

    if (path === '/templates' && method === 'PATCH') {
      const body = await req.json() as Record<string, unknown>;
      const { id, ...updates } = body;
      if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id is required' } }, 400);

      const row: Record<string, unknown> = {};
      if (updates.name !== undefined) row.name = updates.name;
      if (updates.positionId !== undefined) row.position_id = updates.positionId;
      if (updates.status !== undefined) row.status = updates.status;
      if (updates.durationMinutes !== undefined) row.duration_minutes = updates.durationMinutes;
      if (updates.scoringConfig !== undefined) row.scoring_config = JSON.stringify(updates.scoringConfig);
      if (updates.gradeRules !== undefined) row.grade_rules = JSON.stringify(updates.gradeRules);

      const { data, error } = await supabase.from('interview_templates').update(row).eq('id', String(id)).select('*').single();
      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Template not found' } }, 404);
      return jsonRes(data);
    }

    if (path === '/templates' && method === 'DELETE') {
      const body = await req.json() as Record<string, unknown>;
      const { id } = body;
      if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id is required' } }, 400);

      const { error } = await supabase.from('interview_templates').delete().eq('id', String(id));
      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      return jsonRes({ deleted: true, id: String(id) });
    }

    // ── Questions ──────────────────────────────────────────────

    if (path === '/questions' && method === 'GET') {
      const templateId = url.searchParams.get('template_id');
      if (!templateId) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'template_id query param is required' } }, 400);
      const { data } = await supabase.from('interview_questions').select('*').eq('template_id', templateId).order('sort_order', { ascending: true });
      return jsonRes(data ?? []);
    }

    if (path === '/questions' && method === 'POST') {
      const body = await req.json() as Record<string, unknown>;
      const { templateId, questions } = body;

      // Bulk save: replace all questions for this template
      if (Array.isArray(questions)) {
        if (!templateId) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'templateId is required' } }, 400);
        await supabase.from('interview_questions').delete().eq('template_id', String(templateId));

        if (questions.length > 0) {
          const rows = (questions as Record<string, unknown>[]).map((q, i) => ({
            template_id: String(templateId),
            title: String(q.title ?? ''),
            prompt: String(q.prompt ?? ''),
            sort_order: i + 1,
            time_limit_seconds: Number(q.timeLimitSeconds ?? 120),
            group_name: q.group ? String(q.group) : '',
            follow_ups: q.followUps ? JSON.stringify(q.followUps) : undefined,
            scoring_guide: q.scoringGuide ? JSON.stringify(q.scoringGuide) : undefined,
            linked_dimensions: q.linkedDimensions ? JSON.stringify(q.linkedDimensions) : undefined,
          }));

          const { data, error } = await supabase.from('interview_questions').insert(rows).select('*');
          if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
          return jsonRes(data, 201);
        }
        return jsonRes([]);
      }

      // Single add: individual question fields
      if (!templateId) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'templateId is required' } }, 400);
      const { title, prompt, timeLimitSeconds, group, followUps, scoringGuide, linkedDimensions } = body;

      const { data, error } = await supabase.from('interview_questions').insert({
        template_id: String(templateId),
        title: title ? String(title) : '',
        prompt: prompt ? String(prompt) : '',
        time_limit_seconds: timeLimitSeconds ? Number(timeLimitSeconds) : 120,
        group_name: group ? String(group) : '',
        follow_ups: followUps ? JSON.stringify(followUps) : undefined,
        scoring_guide: scoringGuide ? JSON.stringify(scoringGuide) : undefined,
        linked_dimensions: linkedDimensions ? JSON.stringify(linkedDimensions) : undefined,
      }).select('*').single();

      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      return jsonRes(data, 201);
    }

    if (path === '/questions' && method === 'PATCH') {
      const body = await req.json() as Record<string, unknown>;
      const { id, ...updates } = body;
      if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id is required' } }, 400);

      const row: Record<string, unknown> = {};
      if (updates.title !== undefined) row.title = updates.title;
      if (updates.prompt !== undefined) row.prompt = updates.prompt;
      if (updates.timeLimitSeconds !== undefined) row.time_limit_seconds = updates.timeLimitSeconds;
      if (updates.group !== undefined) row.group_name = updates.group;
      if (updates.followUps !== undefined) row.follow_ups = JSON.stringify(updates.followUps);
      if (updates.scoringGuide !== undefined) row.scoring_guide = JSON.stringify(updates.scoringGuide);
      if (updates.linkedDimensions !== undefined) row.linked_dimensions = JSON.stringify(updates.linkedDimensions);

      const { data, error } = await supabase.from('interview_questions').update(row).eq('id', String(id)).select('*').single();
      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Question not found' } }, 404);
      return jsonRes(data);
    }

    if (path === '/questions' && method === 'DELETE') {
      const body = await req.json() as Record<string, unknown>;
      const { id } = body;
      if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id is required' } }, 400);

      const { error } = await supabase.from('interview_questions').delete().eq('id', String(id));
      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      return jsonRes({ deleted: true, id: String(id) });
    }

    // ── Sessions ───────────────────────────────────────────────

    if (path === '/sessions' && method === 'GET') {
      const id = url.searchParams.get('id');
      if (id) {
        const { data } = await supabase.from('interview_sessions').select('*').eq('id', id).single();
        if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Session not found' } }, 404);
        return jsonRes(data);
      }
      const { data } = await supabase.from('interview_sessions')
        .select('id, candidate_id, candidate_name, candidate_email, position_name, position_id, template_id, template_name, start_time, status, progress_current, progress_total, total_score')
        .order('created_at', { ascending: false });
      return jsonRes(data ?? []);
    }

    if (path === '/sessions' && method === 'POST') {
      const body = await req.json() as Record<string, unknown>;
      const { candidateId, templateId } = body;
      if (!candidateId || !templateId) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'candidateId and templateId are required' } }, 400);

      const { data, error } = await supabase.from('interview_sessions').insert({
        candidate_id: String(candidateId),
        template_id: String(templateId),
        status: 'created',
      }).select('*').single();

      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      return jsonRes(data, 201);
    }

    if (path === '/sessions' && method === 'PATCH') {
      const body = await req.json() as Record<string, unknown>;
      const { id, status } = body;
      if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id is required' } }, 400);

      const { data, error } = await supabase.from('interview_sessions').update({ status: String(status) }).eq('id', String(id)).select('*').single();
      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Session not found' } }, 404);
      return jsonRes(data);
    }

    if (path === '/sessions' && method === 'DELETE') {
      const body = await req.json() as Record<string, unknown>;
      const { id } = body;
      if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id is required' } }, 400);

      const { error } = await supabase.from('interview_sessions').delete().eq('id', String(id));
      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      return jsonRes({ deleted: true, id: String(id) });
    }

    // ── Results ────────────────────────────────────────────────

    if (path === '/results' && method === 'GET') {
      const { data } = await supabase.from('interview_results').select('*').order('interview_date', { ascending: false });
      return jsonRes(data ?? []);
    }

    if (path === '/results' && method === 'POST') {
      const body = await req.json() as Record<string, unknown>;
      const { sessionId, candidateId, candidateName, candidateEmail, position, templateName, totalScore, grade, gradeLabel, dimensions, duration } = body;

      const { data, error } = await supabase.from('interview_results').insert({
        session_id: sessionId ? String(sessionId) : null,
        candidate_id: candidateId ? String(candidateId) : null,
        candidate_name: String(candidateName ?? ''),
        candidate_email: String(candidateEmail ?? ''),
        position: String(position ?? ''),
        template_name: String(templateName ?? ''),
        total_score: Number(totalScore ?? 0),
        grade: String(grade ?? ''),
        grade_label: String(gradeLabel ?? ''),
        dimensions: dimensions ? JSON.stringify(dimensions) : null,
        duration: Number(duration ?? 0),
      }).select('*').single();

      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      return jsonRes(data, 201);
    }

    if (path === '/results' && method === 'PATCH') {
      const body = await req.json() as Record<string, unknown>;
      const { id, status } = body;
      if (!id) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'id is required' } }, 400);

      const { data, error } = await supabase.from('interview_results').update({ status: String(status) }).eq('id', String(id)).select('*').single();
      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Result not found' } }, 404);
      return jsonRes(data);
    }

    // ── Answer Scores ──────────────────────────────────────────

    if (path === '/answer-scores' && method === 'GET') {
      const sessionId = url.searchParams.get('session_id');
      if (!sessionId) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'session_id query param is required' } }, 400);
      const { data } = await supabase.from('interview_answer_scores').select('*').eq('session_id', sessionId).order('created_at', { ascending: true });
      return jsonRes(data ?? []);
    }

    return jsonRes({ error: { code: 'NOT_FOUND', message: `Route ${method} ${path} not found` } }, 404);
  } catch (e) {
    console.error('[interviews] CRUD:', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};
