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

// GET /stats/dashboard — all dashboard stats in one call
export const dashboardStats = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);

    const [
      { count: runningAgents },
      { count: shortlistCount },
      { count: pendingApprovals },
      { count: totalCandidates },
      { count: monthlyNew },
      { data: gradeData },
      { count: weeklyInterviews },
      { count: pendingOutreachCount },
    ] = await Promise.all([
      // Sidebar: running agents
      supabase.from('agents').select('*', { count: 'exact', head: true }).eq('status', 'running'),
      // Sidebar: shortlist count
      supabase.from('shortlist_entries').select('*', { count: 'exact', head: true }),
      // Sidebar: pending approvals
      supabase.from('approval_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      // Sidebar: total candidates
      supabase.from('candidates').select('*', { count: 'exact', head: true }).not('original_file_name', 'is', null),
      // Talent: monthly new candidates
      supabase.from('candidates').select('*', { count: 'exact', head: true })
        .not('original_file_name', 'is', null)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      // Talent: grade distribution
      supabase.from('candidates').select('grade')
        .not('original_file_name', 'is', null)
        .not('grade', 'is', null),
      // Weekly interviews
      supabase.from('interview_results').select('*', { count: 'exact', head: true })
        .gte('interview_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      // Pending outreach
      supabase.from('outreach_records').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

    // Build grade distribution
    const gradeDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const row of (gradeData ?? [])) {
      const g = (row as Record<string, unknown>).grade as string;
      if (g && g in gradeDistribution) gradeDistribution[g] = (gradeDistribution[g] ?? 0) + 1;
    }

    return jsonRes({
      sidebar: {
        runningAgents: runningAgents ?? 0,
        shortlistCount: shortlistCount ?? 0,
        pendingApprovals: pendingApprovals ?? 0,
        totalCandidates: totalCandidates ?? 0,
      },
      talentStats: {
        totalCount: totalCandidates ?? 0,
        monthlyNew: monthlyNew ?? 0,
        pendingReview: 0,
        gradeDistribution,
      },
      weeklyInterviews: weeklyInterviews ?? 0,
      pendingOutreach: pendingOutreachCount ?? 0,
    });
  } catch (e) {
    console.error('[stats dashboard]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch dashboard stats' } }, 500);
  }
};

// GET /stats/sidebar — sidebar badge counts (single round-trip)
export const sidebarStats = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);

    const [
      { count: runningAgents },
      { count: shortlistCount },
      { count: pendingApprovals },
      { count: totalCandidates },
    ] = await Promise.all([
      supabase.from('agents').select('*', { count: 'exact', head: true }).eq('status', 'running'),
      supabase.from('shortlist_entries').select('*', { count: 'exact', head: true }),
      supabase.from('approval_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('candidates').select('*', { count: 'exact', head: true }).not('original_file_name', 'is', null),
    ]);

    return jsonRes({
      runningAgents: runningAgents ?? 0,
      shortlistCount: shortlistCount ?? 0,
      pendingApprovals: pendingApprovals ?? 0,
      totalCandidates: totalCandidates ?? 0,
    });
  } catch (e) {
    console.error('[stats sidebar]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch sidebar stats' } }, 500);
  }
};

// GET /stats/search — unified search across candidates/positions/projects/agents
export const searchStats = async (req: Request): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const q = getQuery(req, 'q');
    if (!q || q.trim().length < 1) {
      return jsonRes({ candidates: [], positions: [], projects: [], agents: [] });
    }
    const term = `%${q.trim()}%`;
    const limit = 5;

    const [
      { data: candidates },
      { data: positions },
      { data: projects },
      { data: agents },
    ] = await Promise.all([
      supabase.from('candidates').select('id, name').not('original_file_name', 'is', null).ilike('name', term).limit(limit),
      supabase.from('positions').select('id, name').ilike('name', term).limit(limit),
      supabase.from('projects').select('id, name').ilike('name', term).limit(limit),
      supabase.from('agents').select('id, name').ilike('name', term).limit(limit),
    ]);

    return jsonRes({
      candidates: (candidates ?? []).map((r: Record<string, unknown>) => ({ id: r.id, title: r.name, path: '/candidates' })),
      positions: (positions ?? []).map((r: Record<string, unknown>) => ({ id: r.id, title: r.name, path: '/projects' })),
      projects: (projects ?? []).map((r: Record<string, unknown>) => ({ id: r.id, title: r.name, path: '/projects' })),
      agents: (agents ?? []).map((r: Record<string, unknown>) => ({ id: r.id, title: r.name, path: '/admin' })),
    });
  } catch (e) {
    console.error('[stats search]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'Search failed' } }, 500);
  }
};
