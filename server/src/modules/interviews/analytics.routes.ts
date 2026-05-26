import {Router} from 'express';
import {query, queryOne} from '../../config/database.js';

const router = Router();

// ---------------------------------------------------------------------------
// Analytics helpers
// ---------------------------------------------------------------------------

const PASS_GRADES = `'A','B','S','A+','B+','a','b','s','excellent','good','qualified'`;

function getTimeRangeCondition(timeRange: string): string {
  switch (timeRange) {
    case 'thisWeek': return `interview_date >= date_trunc('week', now())`;
    case 'thisMonth': return `interview_date >= date_trunc('month', now())`;
    case 'thisQuarter': return `interview_date >= date_trunc('quarter', now())`;
    case 'thisYear': return `interview_date >= date_trunc('year', now())`;
    default: return 'TRUE';
  }
}

function getPrevPeriodCondition(timeRange: string): string {
  switch (timeRange) {
    case 'thisWeek': return `interview_date >= date_trunc('week', now()) - INTERVAL '1 week' AND interview_date < date_trunc('week', now())`;
    case 'thisMonth': return `interview_date >= date_trunc('month', now()) - INTERVAL '1 month' AND interview_date < date_trunc('month', now())`;
    case 'thisQuarter': return `interview_date >= date_trunc('quarter', now()) - INTERVAL '3 months' AND interview_date < date_trunc('quarter', now())`;
    case 'thisYear': return `interview_date >= date_trunc('year', now()) - INTERVAL '1 year' AND interview_date < date_trunc('year', now())`;
    default: return `interview_date >= date_trunc('month', now()) - INTERVAL '1 month' AND interview_date < date_trunc('month', now())`;
  }
}

// ---------------------------------------------------------------------------
// Analytics endpoints
// ---------------------------------------------------------------------------

// GET /summary
router.get('/summary', async (req, res, next) => {
  try {
    const {timeRange = 'all'} = req.query as Record<string, string>;
    const trCond = getTimeRangeCondition(timeRange);
    const prevCond = getPrevPeriodCondition(timeRange);

    const [totalResult, completedResult, passResult, avgResult, weekResult, monthResult, prevTotal, prevCompleted, prevAvg] = await Promise.all([
      queryOne(`SELECT COUNT(*)::int AS "totalInterviews" FROM interview_results WHERE ${trCond}`),
      queryOne(`SELECT COUNT(*)::int AS "completedInterviews" FROM interview_results WHERE status = 'completed' AND ${trCond}`),
      queryOne(
        `SELECT
           CASE WHEN COUNT(*) = 0 THEN 0
                ELSE ROUND((COUNT(*) FILTER (WHERE grade IN (${PASS_GRADES}))::numeric / COUNT(*)::numeric) * 100, 2)
           END AS "passRate"
         FROM interview_results WHERE ${trCond}`,
      ),
      queryOne(`SELECT COALESCE(AVG(total_score), 0)::numeric(5,2) AS "averageScore" FROM interview_results WHERE ${trCond}`),
      queryOne(
        `SELECT COUNT(*)::int AS "thisWeekCount"
         FROM interview_results
         WHERE interview_date >= date_trunc('week', now())`,
      ),
      queryOne(
        `SELECT COUNT(*)::int AS "thisMonthCount"
         FROM interview_results
         WHERE interview_date >= date_trunc('month', now())`,
      ),
      queryOne(
        `SELECT COUNT(*)::int AS "prevTotal"
         FROM interview_results
         WHERE ${prevCond}`,
      ),
      queryOne(
        `SELECT COUNT(*)::int AS "prevCompleted"
         FROM interview_results
         WHERE status = 'completed' AND ${prevCond}`,
      ),
      queryOne(
        `SELECT COALESCE(AVG(total_score), 0)::numeric(5,2) AS "prevAvg"
         FROM interview_results
         WHERE ${prevCond}`,
      ),
    ]);

    const pTotal = prevTotal?.prevTotal ?? 0;
    const pCompleted = prevCompleted?.prevCompleted ?? 0;
    const pAvgScore = parseFloat(String(prevAvg?.prevAvg ?? 0));

    const computePctChange = (curr: number, prev: number): number => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100);
    };

    res.json({
      totalInterviews: totalResult?.totalInterviews ?? 0,
      completedInterviews: completedResult?.completedInterviews ?? 0,
      passRate: passResult?.passRate ?? 0,
      averageScore: parseFloat(String(avgResult?.averageScore ?? 0)),
      thisWeekCount: weekResult?.thisWeekCount ?? 0,
      thisMonthCount: monthResult?.thisMonthCount ?? 0,
      momTrend: {
        totalChange: computePctChange(Number(totalResult?.totalInterviews ?? 0), Number(pTotal)),
        completedChange: computePctChange(Number(completedResult?.completedInterviews ?? 0), Number(pCompleted)),
        avgScoreChange: computePctChange(parseFloat(String(avgResult?.averageScore ?? 0)), pAvgScore),
      },
    });
  } catch (e) { next(e); }
});

// GET /score-distribution
router.get('/score-distribution', async (req, res, next) => {
  try {
    const {timeRange = 'all'} = req.query as Record<string, string>;
    const trCond = getTimeRangeCondition(timeRange);
    const rows = await query(
      `SELECT
         CASE
           WHEN total_score >= 90 THEN '90-100'
           WHEN total_score >= 80 THEN '80-89'
           WHEN total_score >= 70 THEN '70-79'
           WHEN total_score >= 60 THEN '60-69'
           ELSE '0-59'
         END AS range,
         COUNT(*)::int AS count
       FROM interview_results
       WHERE ${trCond}
       GROUP BY range
       ORDER BY range DESC`,
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /pass-rate-trend — monthly pass rates
router.get('/pass-rate-trend', async (req, res, next) => {
  try {
    const {timeRange = 'all'} = req.query as Record<string, string>;
    const trCond = getTimeRangeCondition(timeRange);
    const rows = await query(
      `SELECT
         to_char(interview_date, 'YYYY-MM') AS month,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE grade IN (${PASS_GRADES}))::int AS passed,
         CASE WHEN COUNT(*) = 0 THEN 0
              ELSE ROUND((COUNT(*) FILTER (WHERE grade IN (${PASS_GRADES}))::numeric / COUNT(*)::numeric) * 100, 2)
         END AS "passRate"
       FROM interview_results
       WHERE ${trCond}
       GROUP BY month
       ORDER BY month`,
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /position-analytics — per-position stats
router.get('/position-analytics', async (req, res, next) => {
  try {
    const {timeRange = 'all'} = req.query as Record<string, string>;
    const trCond = getTimeRangeCondition(timeRange);
    const rows = await query(
      `SELECT
         position,
         COUNT(*)::int AS "totalInterviews",
         COUNT(*) FILTER (WHERE grade IN (${PASS_GRADES}))::int AS passed,
         CASE WHEN COUNT(*) = 0 THEN 0
              ELSE ROUND((COUNT(*) FILTER (WHERE grade IN (${PASS_GRADES}))::numeric / COUNT(*)::numeric) * 100, 2)
         END AS "passRate",
         COALESCE(AVG(total_score), 0)::numeric(5,2) AS "avgScore"
       FROM interview_results
       WHERE position IS NOT NULL AND ${trCond}
       GROUP BY position
       ORDER BY "totalInterviews" DESC`,
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /dimension-analysis — dimension & question difficulty analysis
router.get('/dimension-analysis', async (req, res, next) => {
  try {
    const {timeRange = 'all'} = req.query as Record<string, string>;
    const trCond = getTimeRangeCondition(timeRange);

    const dimensionRows = await query(
      `SELECT
         d->>'name' AS name,
         COUNT(*)::int AS count,
         ROUND(AVG((d->>'score')::numeric), 2) AS "avgScore",
         COALESCE(MAX((d->>'weight')::numeric), 100) AS "maxScore"
       FROM interview_results, jsonb_array_elements(dimensions) AS d
       WHERE ${trCond} AND jsonb_array_length(dimensions) > 0
       GROUP BY d->>'name'
       ORDER BY "avgScore" ASC`,
    );

    const dimensions = dimensionRows.map((r: Record<string, unknown>) => {
      const avg = parseFloat(String(r.avgScore ?? 0));
      const max = parseFloat(String(r.maxScore ?? 100));
      return {
        name: String(r.name ?? ''),
        avgScore: avg,
        maxScore: max,
        avgPercent: max > 0 ? Math.round((avg / max) * 1000) / 10 : 0,
        count: r.count as number,
      };
    });

    const weakestDimension = dimensions.length > 0 ? dimensions[0].name : '';

    const questionRows = await query(
      `SELECT
         question_title,
         COUNT(*)::int AS "totalCount",
         ROUND(AVG(score), 2) AS "avgScore",
         MAX(max_score) AS "maxScore",
         COUNT(*) FILTER (WHERE score < max_score * 0.6)::int AS "belowThresholdCount"
       FROM interview_answer_scores
       WHERE status = 'completed' AND question_title IS NOT NULL
         AND session_id IN (SELECT session_id FROM interview_results WHERE ${trCond})
       GROUP BY question_title
       ORDER BY "belowThresholdCount" DESC NULLS LAST, "avgScore" ASC
       LIMIT 20`,
    );

    const questions = questionRows.map((r: Record<string, unknown>) => {
      const avg = parseFloat(String(r.avgScore ?? 0));
      const max = parseFloat(String(r.maxScore ?? 100));
      return {
        questionTitle: String(r.question_title ?? ''),
        avgScore: avg,
        maxScore: max,
        belowThresholdCount: r.belowThresholdCount as number,
        totalCount: r.totalCount as number,
      };
    });

    const hardestQuestion = questions.length > 0 ? questions[0].questionTitle : '';

    res.json({dimensions, questions, weakestDimension, hardestQuestion});
  } catch (e) { next(e); }
});

export default router;
