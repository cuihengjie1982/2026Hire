import {Router} from 'express';
import {query, queryOne} from '../../config/database.js';

const router = Router();

// GET /overview — computed insights
// Mounted at /api/insights
router.get('/overview', async (req, res, next) => {
  try {
    const {timeRange = 'all'} = req.query as Record<string, string>;

    let interviewCond = 'TRUE';
    let candidateCond = 'TRUE';
    switch (timeRange) {
      case 'thisWeek':
        interviewCond = `interview_date >= date_trunc('week', now())`;
        candidateCond = `created_at >= date_trunc('week', now())`;
        break;
      case 'thisMonth':
        interviewCond = `interview_date >= date_trunc('month', now())`;
        candidateCond = `created_at >= date_trunc('month', now())`;
        break;
      case 'thisQuarter':
        interviewCond = `interview_date >= date_trunc('quarter', now())`;
        candidateCond = `created_at >= date_trunc('quarter', now())`;
        break;
      case 'thisYear':
        interviewCond = `interview_date >= date_trunc('year', now())`;
        candidateCond = `created_at >= date_trunc('year', now())`;
        break;
    }

    const [candidatesResult, interviewsResult, passResult, avgResult, weeklyInterviewsResult, scoredResult, shortlistResult, sessionsResult, approvedResult, channelRows, agentRows] = await Promise.all([
      queryOne(`SELECT COUNT(*)::int AS "totalCandidates" FROM candidates WHERE ${candidateCond}`),
      queryOne(`SELECT COUNT(*)::int AS "totalInterviews" FROM interview_results WHERE ${interviewCond}`),
      queryOne(
        `SELECT
           CASE WHEN COUNT(*) = 0 THEN 0
                ELSE ROUND((COUNT(*) FILTER (WHERE grade IN ('A', 'B', 'S', 'A+', 'B+'))::numeric / COUNT(*)::numeric) * 100, 2)
           END AS "passRate"
         FROM interview_results WHERE ${interviewCond}`,
      ),
      queryOne(
        `SELECT COALESCE(AVG(total_score), 0)::numeric(5,2) AS "avgScore" FROM interview_results WHERE ${interviewCond}`,
      ),
      queryOne(`
        SELECT COUNT(*)::int AS "weeklyInterviews"
        FROM interview_results
        WHERE created_at >= date_trunc('week', now())
      `),
      // Funnel: candidates with grade (resume scored)
      queryOne(`SELECT COUNT(*)::int AS cnt FROM candidates WHERE grade IS NOT NULL AND ${candidateCond}`),
      // Funnel: shortlist entries
      queryOne(`SELECT COUNT(*)::int AS cnt FROM shortlist_entries WHERE ${candidateCond}`),
      // Funnel: interview sessions scheduled
      queryOne(`SELECT COUNT(*)::int AS cnt FROM interview_sessions WHERE ${candidateCond}`),
      // Funnel: approvals approved
      queryOne(`SELECT COUNT(*)::int AS cnt FROM approval_requests WHERE status = 'approved' AND ${candidateCond.replace('created_at', 'created_at')}`),
      // Source quality: group candidates by source
      query(
        `SELECT COALESCE(NULLIF(source, ''), '未标记') AS name,
                COUNT(*)::int AS count,
                COALESCE(AVG(score_total), 0)::numeric(5,2) AS "avgScore"
         FROM candidates WHERE ${candidateCond}
         GROUP BY source ORDER BY count DESC`,
      ),
      // Agent efficiency: stats per agent
      query(
        `SELECT name,
                adoption_rate AS "adoptionRate",
                approved + rejected + pending_count AS "totalProcessed",
                status
         FROM agents ORDER BY updated_at DESC`,
      ),
    ]);

    const totalCandidates = Number(candidatesResult?.totalCandidates ?? 0);
    const totalInterviews = Number(interviewsResult?.totalInterviews ?? 0);
    const passRate = parseFloat(String(passResult?.passRate ?? 0));
    const avgScore = parseFloat(String(avgResult?.avgScore ?? 0));
    const weeklyInterviews = Number(weeklyInterviewsResult?.weeklyInterviews ?? 0);

    const funnelBase = Math.max(totalCandidates, 1);
    const scoredCount = scoredResult?.cnt ?? 0;
    const shortlistCount = shortlistResult?.cnt ?? 0;
    const sessionCount = sessionsResult?.cnt ?? 0;
    const approvedCount = approvedResult?.cnt ?? 0;

    res.json({
      metrics: [
        {label: '总候选人数', value: totalCandidates.toString(), suffix: '人', trendLabel: '累计至今', icon: 'pie-chart'},
        {label: '面试场次', value: totalInterviews.toString(), suffix: '场', trendLabel: '累计至今', icon: 'bar-chart'},
        {label: '通过率', value: passRate.toFixed(1), suffix: '%', trendLabel: '历史平均', icon: 'trending-up'},
        {label: '平均得分', value: avgScore.toFixed(1), suffix: '分', trendLabel: '历史平均', icon: 'gauge'},
      ],
      funnel: [
        {label: '候选人入库', value: totalCandidates},
        {label: '简历已评分', value: scoredCount},
        {label: '加入短名单', value: shortlistCount},
        {label: '面试安排', value: sessionCount},
        {label: '面试完成', value: totalInterviews},
        {label: '审批通过', value: approvedCount},
      ],
      channels: channelRows.map((r: Record<string, unknown>) => ({
        name: String(r.name ?? ''),
        count: Number(r.count ?? 0),
        avgScore: parseFloat(String(r.avgScore ?? 0)),
      })),
      agents: agentRows.map((r: Record<string, unknown>) => ({
        name: String(r.name ?? ''),
        adoptionRate: parseFloat(String(r.adoptionRate ?? 0)),
        totalProcessed: Number(r.totalProcessed ?? 0),
        status: String(r.status ?? 'pending'),
      })),
    });
  } catch (e) { next(e); }
});

export default router;
