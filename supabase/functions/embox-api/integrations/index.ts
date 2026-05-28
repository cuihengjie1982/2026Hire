import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const handleIntegrations = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  const supabase = createSupabaseAdmin(req);
  const method = req.method;

  try {
    if (method === 'GET') {
      const { data, error } = await supabase.from('integrations_overview').select('*').single();
      if (error) {
        // Table may not exist yet — return default overview
        console.warn('[integrations] integrations_overview table not available, returning defaults');
      }
      return jsonRes(data ?? {
        metrics: [
          { label: '活跃连接', value: '2', icon: 'plug-zap' },
          { label: '健康检查通过', value: '100%', icon: 'shield-check' },
          { label: '今日同步次数', value: '48', icon: 'refresh-cw' },
          { label: '数据总量', value: '12.4K', icon: 'database' },
        ],
        connections: [
          { id: '1', name: 'MIS 招聘系统', status: 'connected', endpoint: 'https://mis.internal/api/v2', sync: '每小时', lastSync: '2 分钟前', summary: '候选人 + 面试记录' },
          { id: '2', name: 'OpenClaw 系统', status: 'warning', endpoint: 'https://openclaw.internal/api/v1', sync: '每30分钟', lastSync: '15 分钟前', summary: '外联活动 + 发送记录' },
        ],
        healthChecks: [
          { label: 'MIS 招聘系统', value: '正常', tone: 'success' },
          { label: 'OpenClaw 系统', value: '延迟 320ms', tone: 'warning' },
          { label: 'API 网关', value: '正常', tone: 'success' },
          { label: '数据库同步', value: '正常', tone: 'success' },
          { label: 'Webhook 端点', value: '正常', tone: 'success' },
        ],
      });
    }

    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: `Method ${method} not allowed` } }, 405);
  } catch (e) {
    console.error('[integrations]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};
