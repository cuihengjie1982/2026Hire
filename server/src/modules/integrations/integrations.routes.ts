import {Router} from 'express';
import {query, queryOne} from '../../config/database.js';
import {env} from '../../config/env.js';

const router = Router();

// GET /overview — real system integration status
router.get('/overview', async (_req, res, next) => {
  try {
    const [aiConfigResult, agentStats, agentLastActive, totalProcessed] = await Promise.all([
      queryOne(`SELECT COUNT(*)::int AS cnt FROM ai_model_configs WHERE is_active = true`),
      queryOne(
        `SELECT
           COUNT(*)::int AS "totalAgents",
           COUNT(*) FILTER (WHERE status = 'running')::int AS "runningAgents",
           SUM(approved + rejected + pending_count)::int AS "totalProcessed"
         FROM agents`,
      ),
      queryOne(`SELECT MAX(updated_at) AS "lastActive" FROM agents`),
      queryOne(
        `SELECT
           SUM(approved)::int AS "totalApproved",
           SUM(rejected)::int AS "totalRejected"
         FROM agents`,
      ),
    ]);

    const aiConfigCount = Number(aiConfigResult?.cnt ?? 0);
    const runningAgents = Number(agentStats?.runningAgents ?? 0);
    const totalAgents = Number(agentStats?.totalAgents ?? 0);
    const processed = Number(totalProcessed?.totalApproved ?? 0) + Number(totalProcessed?.totalRejected ?? 0);
    const lastActive = agentLastActive?.lastActive ? new Date(String(agentLastActive.lastActive)).toLocaleString('zh-CN') : '从未';
    const mineruConfigured = !!(env.MINERU_API_URL && env.MINERU_API_TOKEN);

    res.json({
      metrics: [
        {label: 'AI 模型配置', value: aiConfigCount.toString(), icon: 'plug-zap'},
        {label: '运行中代理', value: runningAgents.toString(), icon: 'shield-check'},
        {label: '上次活动', value: lastActive, icon: 'refresh-cw'},
        {label: '已处理任务', value: processed.toString(), icon: 'database'},
      ],
      connections: [
        {
          id: 'ai-models',
          name: 'AI 模型服务',
          status: aiConfigCount > 0 ? 'connected' : 'warning',
          endpoint: `已配置 ${aiConfigCount} 个活跃模型`,
          sync: '按需调用',
          lastSync: lastActive,
          summary: `已配置 ${aiConfigCount} 个 AI 模型，支持简历评分、面试分析`,
        },
        {
          id: 'mineru',
          name: '简历解析服务 (MinerU)',
          status: mineruConfigured ? 'connected' : 'warning',
          endpoint: env.MINERU_API_URL || '未配置',
          sync: '按需调用',
          lastSync: mineruConfigured ? '服务就绪' : '未连接',
          summary: mineruConfigured ? 'MinerU API 已连接，可解析 PDF/Word 简历' : '未配置 MINERU_API_URL 或 MINERU_API_TOKEN',
        },
        {
          id: 'agents',
          name: 'AI 代理引擎',
          status: totalAgents > 0 ? 'connected' : 'warning',
          endpoint: `${totalAgents} 个代理已注册`,
          sync: `${runningAgents} 个运行中`,
          lastSync: lastActive,
          summary: `共 ${totalAgents} 个代理，已处理 ${processed} 项任务`,
        },
      ],
      healthChecks: [
        {label: 'AI 模型配置', value: aiConfigCount > 0 ? `${aiConfigCount} 个已配置` : '未配置', tone: aiConfigCount > 0 ? 'success' : 'warning'},
        {label: '简历解析服务', value: mineruConfigured ? '已连接' : '未配置', tone: mineruConfigured ? 'success' : 'warning'},
        {label: 'AI 代理引擎', value: runningAgents > 0 ? `${runningAgents} 个运行中` : (totalAgents > 0 ? '已暂停' : '无代理'), tone: runningAgents > 0 ? 'success' : 'warning'},
        {label: '数据库连接', value: '正常', tone: 'success'},
      ],
    });
  } catch (e) { next(e); }
});

// GET /sync — return last activity time
router.get('/sync', async (_req, res, next) => {
  try {
    const result = await queryOne(`SELECT MAX(updated_at) AS "lastSync" FROM agents`);
    res.json({
      lastSync: result?.lastSync ?? new Date().toISOString(),
      status: 'synced',
    });
  } catch (e) { next(e); }
});

export default router;
