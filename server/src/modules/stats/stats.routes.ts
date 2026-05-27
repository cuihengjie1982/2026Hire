import {Router} from 'express';
import {query, queryOne} from '../../config/database.js';

const router = Router();

// GET /sidebar — aggregated sidebar counts (single DB round-trip)
router.get('/sidebar', async (_req, res, next) => {
  try {
    const [agents, shortlist, approvals, candidates] = await Promise.all([
      queryOne(`SELECT COUNT(*)::int AS running FROM agents WHERE status = 'running'`),
      queryOne(`SELECT COUNT(*)::int AS total FROM shortlist_entries`),
      queryOne(`SELECT COUNT(*)::int AS pending FROM approval_requests WHERE status = 'pending'`),
      queryOne(`SELECT COUNT(*)::int AS total FROM candidates WHERE original_file_name IS NOT NULL`),
    ]);

    res.json({
      runningAgents: agents?.running ?? 0,
      shortlistCount: shortlist?.total ?? 0,
      pendingApprovals: approvals?.pending ?? 0,
      totalCandidates: candidates?.total ?? 0,
    });
  } catch (e) { next(e); }
});

// GET /dashboard — all dashboard stats in one call
router.get('/dashboard', async (_req, res, next) => {
  try {
    const [
      sidebar,
      talentStats,
      interviewStats,
      outreachStats,
    ] = await Promise.all([
      // Sidebar counts
      Promise.all([
        queryOne(`SELECT COUNT(*)::int AS running FROM agents WHERE status = 'running'`),
        queryOne(`SELECT COUNT(*)::int AS total FROM shortlist_entries`),
        queryOne(`SELECT COUNT(*)::int AS pending FROM approval_requests WHERE status = 'pending'`),
        queryOne(`SELECT COUNT(*)::int AS total FROM candidates WHERE original_file_name IS NOT NULL`),
      ]),
      // Talent stats
      Promise.all([
        queryOne(`SELECT COUNT(*)::int AS total FROM candidates WHERE original_file_name IS NOT NULL`),
        queryOne(`SELECT COUNT(*)::int AS monthly FROM candidates WHERE original_file_name IS NOT NULL AND created_at >= NOW() - INTERVAL '30 days'`),
        queryOne(`SELECT grade, COUNT(*)::int AS count FROM candidates WHERE original_file_name IS NOT NULL AND grade IS NOT NULL GROUP BY grade`),
      ]),
      // Interview stats (recent 30 days)
      queryOne(`SELECT COUNT(*)::int AS total FROM interview_results WHERE interview_date >= NOW() - INTERVAL '30 days'`),
      // Outreach pending
      queryOne(`SELECT COUNT(*)::int AS pending FROM outreach_records WHERE status = 'pending'`),
    ]);

    // Build grade distribution
    const gradeDistribution: Record<string, number> = {A: 0, B: 0, C: 0, D: 0, F: 0};
    for (const row of (Array.isArray(talentStats[2]) ? talentStats[2] : [])) {
      const g = (row as Record<string, unknown>).grade as string;
      const c = (row as Record<string, unknown>).count as number;
      if (g && g in gradeDistribution) gradeDistribution[g] = c;
    }

    res.json({
      sidebar: {
        runningAgents: sidebar[0]?.running ?? 0,
        shortlistCount: sidebar[1]?.total ?? 0,
        pendingApprovals: sidebar[2]?.pending ?? 0,
        totalCandidates: sidebar[3]?.total ?? 0,
      },
      talentStats: {
        totalCount: talentStats[0]?.total ?? 0,
        monthlyNew: talentStats[1]?.monthly ?? 0,
        pendingReview: 0,
        gradeDistribution,
      },
      weeklyInterviews: interviewStats?.total ?? 0,
      pendingOutreach: outreachStats?.pending ?? 0,
    });
  } catch (e) { next(e); }
});

// GET /search — unified search across candidates/positions/projects/agents
router.get('/search', async (req, res, next) => {
  try {
    const {q} = req.query as Record<string, string>;
    if (!q || q.trim().length < 1) {
      res.json({candidates: [], positions: [], projects: [], agents: []});
      return;
    }
    const term = `%${q.trim()}%`;
    const limit = 5;

    const [candidates, positions, projects, agents] = await Promise.all([
      query(
        `SELECT id, name FROM candidates WHERE original_file_name IS NOT NULL AND name ILIKE $1 LIMIT $2`,
        [term, limit],
      ),
      query(
        `SELECT id, name FROM positions WHERE name ILIKE $1 LIMIT $2`,
        [term, limit],
      ),
      query(
        `SELECT id, name FROM projects WHERE name ILIKE $1 LIMIT $2`,
        [term, limit],
      ),
      query(
        `SELECT id, name FROM agents WHERE name ILIKE $1 LIMIT $2`,
        [term, limit],
      ),
    ]);

    res.json({
      candidates: candidates.map((r: Record<string, unknown>) => ({id: r.id, title: r.name, path: '/talent'})),
      positions: positions.map((r: Record<string, unknown>) => ({id: r.id, title: r.name, path: '/positions/config'})),
      projects: projects.map((r: Record<string, unknown>) => ({id: r.id, title: r.name, path: '/projects'})),
      agents: agents.map((r: Record<string, unknown>) => ({id: r.id, title: r.name, path: '/agents'})),
    });
  } catch (e) { next(e); }
});

export default router;
