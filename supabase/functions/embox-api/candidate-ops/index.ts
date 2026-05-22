import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { notifyAdmins } from '../notifications/index.ts';

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// POST /candidate-ops/import — batch import with deduplication
export const importCandidates = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json();
    const candidates = Array.isArray(body) ? body : [body];
    const results: Record<string, unknown>[] = [];

    for (const c of candidates) {
      const name = String(c.name ?? '');
      const email = c.email ? String(c.email) : null;
      const phone = c.phone ? String(c.phone) : null;

      if (!name) {
        results.push({ error: 'Name is required', candidate: c });
        continue;
      }

      let existing: Record<string, unknown> | null = null;
      if (email) {
        const { data } = await supabase.from('candidates').select('*').eq('email', email).limit(1).single();
        existing = data as Record<string, unknown> | null;
      }
      if (!existing && phone) {
        const { data } = await supabase.from('candidates').select('*').eq('name', name).eq('phone', phone).limit(1).single();
        existing = data as Record<string, unknown> | null;
      }

      const row: Record<string, unknown> = {
        name,
        email,
        phone,
        location: c.location ?? null,
        source: c.source ?? null,
        project_id: c.projectId ?? c.project_id ?? null,
        position_id: c.positionId ?? c.position_id ?? null,
        parsed_info: c.parsed_info ? JSON.stringify(c.parsed_info) : null,
        grade: c.grade ?? null,
        score_total: c.score_total ?? c.scoreTotal ?? null,
        original_file_base64: c.original_file_base64 ?? null,
        original_file_name: c.original_file_name ?? null,
      };

      if (existing) {
        const { data: updated } = await supabase.from('candidates').update(row).eq('id', String(existing.id)).select('*').single();
        results.push({ ...updated, duplicate: true, replaced: true });
      } else {
        const { data: inserted } = await supabase.from('candidates').insert(row).select('*').single();
        results.push({ ...inserted, duplicate: false });
      }
    }

    // Notify admins about new candidates
    const newCount = results.filter(r => !r.duplicate).length;
    if (newCount > 0) {
      await notifyAdmins(supabase, 'candidate',
        '新候选人导入', `成功导入了 ${newCount} 位新候选人`, '/candidates',
      ).catch(() => {});
    }

    return jsonRes({ imported: results.length, results });
  } catch {
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// DELETE /candidate-ops/:id — cascade delete
export const deleteCandidate = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const url = new URL(req.url);
    const match = url.pathname.match(/\/candidate-ops\/([^/]+)/);
    if (!match) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Candidate ID required' } }, 400);

    const id = match[1];
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Invalid candidate ID format' } }, 400);
    }

    const sessions = await supabase.from('interview_sessions').select('id').eq('candidate_id', id);
    const sessionIds = (sessions.data ?? []).map((s: Record<string, unknown>) => String(s.id));

    if (sessionIds.length > 0) {
      await supabase.from('interview_answer_scores').delete().in('session_id', sessionIds);
    }
    await supabase.from('interview_results').delete().eq('candidate_id', id);
    await supabase.from('interview_sessions').delete().eq('candidate_id', id);
    await supabase.from('approval_requests').delete().eq('candidate_id', id);
    await supabase.from('shortlist_entries').delete().eq('candidate_id', id);
    await supabase.from('outreach_records').delete().eq('candidate_id', id);
    await supabase.from('contacts').delete().eq('candidate_id', id);
    await supabase.from('candidate_tags').delete().eq('candidate_id', id);

    const { data } = await supabase.from('candidates').delete().eq('id', id).select('id').single();
    if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: `Candidate (${id}) not found` } }, 404);

    return jsonRes({ success: true, deleted: id });
  } catch {
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// GET /candidate-ops/export/csv — CSV export
export const exportCsv = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const { data } = await supabase
      .from('candidates')
      .select('name, email, phone, resume_score, grade, source, position_id, project_id, created_at')
      .not('original_file_name', 'is', null)
      .order('created_at', { ascending: false });

    const candidates = (data ?? []) as Record<string, unknown>[];

    const { data: allTags } = await supabase.from('candidate_tags').select('candidate_id, tag');

    const tagMap = new Map<string, string[]>();
    for (const t of (allTags ?? []) as Record<string, unknown>[]) {
      const cid = String(t.candidate_id);
      if (!tagMap.has(cid)) tagMap.set(cid, []);
      tagMap.get(cid)!.push(String(t.tag));
    }

    const escCsv = (v: unknown): string => {
      const s = v == null ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const header = ['姓名', '邮箱', '电话', '简历评分', '等级', '来源', '标签', '创建时间'];
    const lines = candidates.map(r =>
      [r.name, r.email, r.phone, r.resume_score, r.grade, r.source,
       tagMap.get(String(r.id))?.join('; ') ?? '',
       r.created_at ? new Date(String(r.created_at)).toLocaleDateString('zh-CN') : ''
      ].map(escCsv).join(','),
    );

    const csv = '﻿' + [header.map(escCsv).join(','), ...lines].join('\n');
    const corsH = getCorsHeaders(req);
    return new Response(csv, {
      headers: { ...corsH, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename=candidates.csv' },
    });
  } catch {
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// GET /candidate-ops/stats — talent statistics
export const getStats = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);

    const [totalRes, monthlyRes, gradeRes] = await Promise.all([
      supabase.from('candidates').select('id', { count: 'exact', head: true }).not('original_file_name', 'is', null),
      supabase.from('candidates').select('id', { count: 'exact', head: true })
        .not('original_file_name', 'is', null)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      supabase.from('candidates').select('grade').not('original_file_name', 'is', null).not('grade', 'is', null),
    ]);

    const gradeDistribution: Record<string, number> = {};
    for (const r of (gradeRes.data ?? []) as Record<string, unknown>[]) {
      const g = String(r.grade);
      gradeDistribution[g] = (gradeDistribution[g] || 0) + 1;
    }

    return jsonRes({
      totalCount: totalRes.count ?? 0,
      monthlyNew: monthlyRes.count ?? 0,
      gradeDistribution,
    });
  } catch {
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// POST /candidate-ops/:id/tags — replace candidate tags
export const updateTags = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const url = new URL(req.url);
    const match = url.pathname.match(/\/candidate-ops\/([^/]+)\/tags/);
    if (!match) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Candidate ID required' } }, 400);

    const id = match[1];
    const { tags } = await req.json();
    if (!Array.isArray(tags)) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'tags must be an array' } }, 400);

    await supabase.from('candidate_tags').delete().eq('candidate_id', id);
    if (tags.length > 0) {
      const rows = tags.map((tag: string) => ({ candidate_id: id, tag }));
      await supabase.from('candidate_tags').insert(rows);
    }

    const { data } = await supabase.from('candidate_tags').select('tag').eq('candidate_id', id).order('tag');
    return jsonRes((data ?? []).map((r: Record<string, unknown>) => r.tag));
  } catch {
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};
