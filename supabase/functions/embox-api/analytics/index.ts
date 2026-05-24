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
  } catch (e) {
    console.error('[analytics]', e);
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
  } catch (e) {
    console.error('[analytics]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

function getTimeFilter(timeRange: string) {
  const now = new Date();
  switch (timeRange) {
    case 'thisWeek': {
      const d = new Date(now); d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case 'thisMonth': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return d.toISOString();
    }
    case 'thisQuarter': {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      const d = new Date(now.getFullYear(), qMonth, 1);
      return d.toISOString();
    }
    case 'thisYear': {
      const d = new Date(now.getFullYear(), 0, 1);
      return d.toISOString();
    }
    default: return null;
  }
}

// GET /analytics/interview/summary — interview analytics summary
export const interviewSummary = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const url = new URL(req.url);
    const timeRange = url.searchParams.get('timeRange') || 'all';
    const since = getTimeFilter(timeRange);

    let query = supabase.from('interview_results').select('total_score, grade, status, duration');
    if (since) query = query.gte('interview_date', since);
    const { data: results, error } = await query;

    if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);

    const rows = (results ?? []) as Record<string, unknown>[];
    const total = rows.length;
    const passGrades = ['A', 'B', 'S', 'A+', 'B+'];
    const passed = rows.filter(r => passGrades.includes(String(r.grade ?? ''))).length;
    const passRate = total > 0 ? Math.round((passed / total) * 10000) / 100 : 0;
    const avgScore = total > 0
      ? Math.round(rows.reduce((sum, r) => sum + (Number(r.total_score) || 0), 0) / total * 100) / 100
      : 0;
    const avgDuration = total > 0
      ? Math.round(rows.reduce((sum, r) => sum + (Number(r.duration) || 0), 0) / total)
      : 0;
    const completed = rows.filter(r => r.status === 'completed').length;
    const reviewed = rows.filter(r => r.status === 'reviewed').length;

    // Grade distribution
    const gradeCounts: Record<string, number> = {};
    for (const r of rows) {
      const g = String(r.grade ?? '未评级');
      gradeCounts[g] = (gradeCounts[g] || 0) + 1;
    }
    const gradeDistribution = Object.entries(gradeCounts).map(([grade, count]) => ({
      grade,
      count,
      percentage: total > 0 ? Math.round((count / total) * 10000) / 100 : 0,
    }));

    // Trend data (last 12 months)
    const trendSince = new Date();
    trendSince.setMonth(trendSince.getMonth() - 12);
    const { data: trendData } = await supabase
      .from('interview_results')
      .select('interview_date, total_score, grade')
      .gte('interview_date', trendSince.toISOString())
      .order('interview_date', { ascending: true });

    const monthlyMap = new Map<string, { total: number; passed: number; scores: number[] }>();
    for (const t of (trendData ?? [])) {
      const month = String(t.interview_date ?? '').substring(0, 7);
      if (!month) continue;
      const entry = monthlyMap.get(month) || { total: 0, passed: 0, scores: [] };
      entry.total++;
      entry.scores.push(Number(t.total_score ?? 0));
      if (passGrades.includes(String(t.grade ?? ''))) entry.passed++;
      monthlyMap.set(month, entry);
    }
    const trends = Array.from(monthlyMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, d]) => ({
      month,
      total: d.total,
      passed: d.passed,
      passRate: d.total > 0 ? Math.round((d.passed / d.total) * 10000) / 100 : 0,
      avgScore: d.scores.length > 0 ? Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length * 100) / 100 : 0,
    }));

    return jsonRes({
      totalInterviews: total,
      completed,
      reviewed,
      passRate,
      avgScore,
      avgDuration,
      gradeDistribution,
      trends,
    });
  } catch (e) {
    console.error('[analytics]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// GET /analytics/interview/score-distribution
export const interviewScoreDistribution = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const url = new URL(req.url);
    const timeRange = url.searchParams.get('timeRange') || 'all';
    const since = getTimeFilter(timeRange);

    let query = supabase.from('interview_results').select('total_score');
    if (since) query = query.gte('interview_date', since);
    const { data: results, error } = await query;

    if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);

    const rows = (results ?? []) as Record<string, unknown>[];
    const total = rows.length;
    if (total === 0) return jsonRes([]);

    const buckets = [
      { range: '0-49', min: 0, max: 49 },
      { range: '50-59', min: 50, max: 59 },
      { range: '60-69', min: 60, max: 69 },
      { range: '70-79', min: 70, max: 79 },
      { range: '80-89', min: 80, max: 89 },
      { range: '90-100', min: 90, max: 100 },
    ];

    const distribution = buckets.map(b => {
      const count = rows.filter(r => {
        const s = Number(r.total_score ?? 0);
        return s >= b.min && s <= b.max;
      }).length;
      return { range: b.range, count, percentage: Math.round((count / total) * 10000) / 100 };
    });

    return jsonRes(distribution);
  } catch (e) {
    console.error('[analytics]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// GET /analytics/interview/dimension-analysis
export const interviewDimensionAnalysis = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);

    const { data: results, error } = await supabase
      .from('interview_results')
      .select('dimensions, question_answers')
      .not('dimensions', 'is', null);

    if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);

    const rows = (results ?? []) as Record<string, unknown>[];
    const dimMap = new Map<string, { scores: number[]; maxScore: number; count: number }>();
    const qMap = new Map<string, { scores: number[]; maxScore: number; belowThreshold: number; total: number }>();

    for (const row of rows) {
      const dims = Array.isArray(row.dimensions) ? row.dimensions : [];
      for (const d of dims) {
        const name = String((d as any).name ?? (d as any).dimension ?? '');
        if (!name) continue;
        const score = Number((d as any).score ?? 0);
        const max = Number((d as any).maxScore ?? (d as any).max_score ?? 100);
        const entry = dimMap.get(name) || { scores: [], maxScore: max, count: 0 };
        entry.scores.push(score);
        entry.count++;
        dimMap.set(name, entry);
      }

      const answers = Array.isArray(row.question_answers) ? row.question_answers : [];
      for (const a of answers) {
        const title = String((a as any).questionTitle ?? (a as any).question_title ?? '');
        if (!title) continue;
        const score = Number((a as any).score ?? 0);
        const max = Number((a as any).maxScore ?? (a as any).max_score ?? 100);
        const entry = qMap.get(title) || { scores: [], maxScore: max, belowThreshold: 0, total: 0 };
        entry.scores.push(score);
        entry.total++;
        if (max > 0 && (score / max) < 0.6) entry.belowThreshold++;
        qMap.set(title, entry);
      }
    }

    const dimensions = Array.from(dimMap.entries()).map(([name, d]) => ({
      name,
      avgScore: d.scores.length > 0 ? Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length * 100) / 100 : 0,
      maxScore: d.maxScore,
      avgPercent: d.maxScore > 0 && d.scores.length > 0
        ? Math.round((d.scores.reduce((a, b) => a + b, 0) / d.scores.length) / d.maxScore * 10000) / 100 : 0,
      count: d.count,
    }));

    const questions = Array.from(qMap.entries()).map(([title, q]) => ({
      questionTitle: title,
      avgScore: q.scores.length > 0 ? Math.round(q.scores.reduce((a, b) => a + b, 0) / q.scores.length * 100) / 100 : 0,
      maxScore: q.maxScore,
      belowThresholdCount: q.belowThreshold,
      totalCount: q.total,
    }));

    // Find weakest and hardest
    const weakestDim = dimensions.sort((a, b) => a.avgPercent - b.avgPercent)[0];
    const hardestQ = questions.sort((a, b) => {
      const aRate = a.totalCount > 0 ? a.belowThresholdCount / a.totalCount : 0;
      const bRate = b.totalCount > 0 ? b.belowThresholdCount / b.totalCount : 0;
      return bRate - aRate;
    })[0];

    return jsonRes({
      dimensions,
      questions,
      weakestDimension: weakestDim?.name ?? null,
      hardestQuestion: hardestQ?.questionTitle ?? null,
    });
  } catch (e) {
    console.error('[analytics]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// GET /analytics/interview/export-csv
export const interviewExportCsv = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);

    const { data: results, error } = await supabase
      .from('interview_results')
      .select('*')
      .order('interview_date', { ascending: false });

    if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);

    const rows = (results ?? []) as Record<string, unknown>[];
    const headers = ['候选人', '邮箱', '岗位', '面试模板', '面试日期', '总分', '评级', '状态'];
    const csvRows = [headers.join(',')];

    for (const r of rows) {
      csvRows.push([
        `"${String(r.candidate_name ?? '')}"`,
        `"${String(r.candidate_email ?? '')}"`,
        `"${String(r.position ?? '')}"`,
        `"${String(r.template_name ?? '')}"`,
        `"${String(r.interview_date ?? '')}"`,
        String(r.total_score ?? ''),
        `"${String(r.grade_label ?? '')}"`,
        `"${String(r.status ?? '')}"`,
      ].join(','));
    }

    return jsonRes({ csvContent: csvRows.join('\n') });
  } catch (e) {
    console.error('[analytics]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};
