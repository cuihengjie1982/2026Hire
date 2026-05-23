import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// GET /analytics/overview — computed insights
export const overview = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const url = new URL(req.url);
    const timeRange = url.searchParams.get('timeRange') || 'all';

    let candidateSince = '';
    let interviewSince = '';
    const now = new Date();
    switch (timeRange) {
      case 'thisWeek': {
        const d = new Date(now); d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0);
        candidateSince = d.toISOString(); interviewSince = d.toISOString(); break;
      }
      case 'thisMonth': {
        const d = new Date(now.getFullYear(), now.getMonth(), 1);
        candidateSince = d.toISOString(); interviewSince = d.toISOString(); break;
      }
      case 'thisQuarter': {
        const qMonth = Math.floor(now.getMonth() / 3) * 3;
        const d = new Date(now.getFullYear(), qMonth, 1);
        candidateSince = d.toISOString(); interviewSince = d.toISOString(); break;
      }
      case 'thisYear': {
        const d = new Date(now.getFullYear(), 0, 1);
        candidateSince = d.toISOString(); interviewSince = d.toISOString(); break;
      }
    }

    const candidateQ = candidateSince
      ? supabase.from('candidates').select('id', { count: 'exact', head: true }).gte('created_at', candidateSince)
      : supabase.from('candidates').select('id', { count: 'exact', head: true });

    const interviewQ = interviewSince
      ? supabase.from('interview_results').select('total_score, grade', { count: 'exact' }).gte('interview_date', interviewSince)
      : supabase.from('interview_results').select('total_score, grade', { count: 'exact' });

    const [candidateRes, interviewRes, scoredRes, shortlistRes, sessionRes, approvedRes, channelRes, agentRes, weeklyRes] = await Promise.all([
      candidateQ,
      interviewQ,
      candidateSince
        ? supabase.from('candidates').select('id', { count: 'exact', head: true }).not('grade', 'is', null).gte('created_at', candidateSince)
        : supabase.from('candidates').select('id', { count: 'exact', head: true }).not('grade', 'is', null),
      candidateSince
        ? supabase.from('shortlist_entries').select('id', { count: 'exact', head: true }).gte('created_at', candidateSince)
        : supabase.from('shortlist_entries').select('id', { count: 'exact', head: true }),
      candidateSince
        ? supabase.from('interview_sessions').select('id', { count: 'exact', head: true }).gte('created_at', candidateSince)
        : supabase.from('interview_sessions').select('id', { count: 'exact', head: true }),
      candidateSince
        ? supabase.from('approval_requests').select('id', { count: 'exact', head: true }).eq('status', 'approved').gte('created_at', candidateSince)
        : supabase.from('approval_requests').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      candidateSince
        ? supabase.from('candidates').select('source, score_total').gte('created_at', candidateSince)
        : supabase.from('candidates').select('source, score_total'),
      supabase.from('agents').select('name, adoption_rate, approved, rejected, pending_count, status').order('updated_at', { ascending: false }),
      supabase.from('interview_results').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    const totalCandidates = candidateRes.count ?? 0;
    const interviewData = (interviewRes.data ?? []) as Record<string, unknown>[];
    const totalInterviews = interviewRes.count ?? 0;

    const passGrades = ['A', 'B', 'S', 'A+', 'B+'];
    const passCount = interviewData.filter(r => passGrades.includes(String(r.grade ?? ''))).length;
    const passRate = totalInterviews > 0 ? Math.round((passCount / totalInterviews) * 10000) / 100 : 0;
    const avgScore = totalInterviews > 0
      ? Math.round(interviewData.reduce((sum, r) => sum + (Number(r.total_score) || 0), 0) / totalInterviews * 100) / 100
      : 0;

    const channelMap = new Map<string, { count: number; totalScore: number }>();
    for (const c of (channelRes.data ?? []) as Record<string, unknown>[]) {
      const src = String(c.source || '未标记');
      const existing = channelMap.get(src);
      if (existing) { existing.count++; existing.totalScore += Number(c.score_total) || 0; }
      else channelMap.set(src, { count: 1, totalScore: Number(c.score_total) || 0 });
    }
    const channels = Array.from(channelMap.entries()).map(([name, data]) => ({
      name, count: data.count, avgScore: Math.round(data.totalScore / data.count * 100) / 100,
    })).sort((a, b) => b.count - a.count);

    const agents = ((agentRes.data ?? []) as Record<string, unknown>[]).map(r => ({
      name: String(r.name ?? ''),
      adoptionRate: Number(r.adoption_rate ?? 0),
      totalProcessed: (Number(r.approved) || 0) + (Number(r.rejected) || 0) + (Number(r.pending_count) || 0),
      status: String(r.status ?? 'pending'),
    }));

    return jsonRes({
      metrics: [
        { label: '总候选人数', value: totalCandidates.toString(), suffix: '人', trendLabel: '累计至今', icon: 'pie-chart' },
        { label: '面试场次', value: totalInterviews.toString(), suffix: '场', trendLabel: '累计至今', icon: 'bar-chart' },
        { label: '通过率', value: passRate.toFixed(1), suffix: '%', trendLabel: '历史平均', icon: 'trending-up' },
        { label: '平均得分', value: avgScore.toFixed(1), suffix: '分', trendLabel: '历史平均', icon: 'gauge' },
      ],
      funnel: [
        { label: '候选人入库', value: totalCandidates },
        { label: '简历已评分', value: scoredRes.count ?? 0 },
        { label: '加入短名单', value: shortlistRes.count ?? 0 },
        { label: '面试安排', value: sessionRes.count ?? 0 },
        { label: '面试完成', value: totalInterviews },
        { label: '审批通过', value: approvedRes.count ?? 0 },
      ],
      channels,
      agents,
      weeklyInterviews: weeklyRes.count ?? 0,
    });
  } catch {
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// GET /analytics/project-stats — project dashboard stats (active projects, candidates, weekly interviews)
export const projectStats = async (_req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin();

    const [activeRes, candidateRes, weeklyRes] = await Promise.all([
      supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', '进行中'),
      supabase.from('candidates').select('id', { count: 'exact', head: true }),
      supabase.from('interview_results').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    return jsonRes({
      activeProjects: activeRes.count ?? 0,
      candidateReserve: candidateRes.count ?? 0,
      weeklyInterviews: weeklyRes.count ?? 0,
    });
  } catch {
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};
