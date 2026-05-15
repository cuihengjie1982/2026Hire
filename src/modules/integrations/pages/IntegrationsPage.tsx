import {motion} from 'motion/react';
import {CheckCircle2, Database, Link2, Loader2, PlugZap, RefreshCw, ShieldCheck, X, ArrowRight} from 'lucide-react';
import {useState} from 'react';
import {useIntegrationsOverview} from '../hooks';
import {type IntegrationConnection} from '../types';

const metricIconMap = {
  'plug-zap': PlugZap,
  'shield-check': ShieldCheck,
  'refresh-cw': RefreshCw,
  database: Database,
} as const;

export const IntegrationsPage = () => {
  const {data, error, isLoading} = useIntegrationsOverview();
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [mappingConnection, setMappingConnection] = useState<IntegrationConnection | null>(null);

  const fieldMappings: Record<string, { source: string; target: string }[]> = {
    'MIS 招聘系统': [
      { source: '候选人姓名', target: 'candidate_name' },
      { source: '候选人邮箱', target: 'candidate_email' },
      { source: '应聘岗位', target: 'position_name' },
      { source: '面试状态', target: 'interview_status' },
      { source: '面试得分', target: 'interview_score' },
      { source: '简历附件', target: 'resume_url' },
    ],
    'OpenClaw 系统': [
      { source: '活动名称', target: 'campaign_name' },
      { source: '发送渠道', target: 'channel_type' },
      { source: '回复状态', target: 'reply_status' },
      { source: '候选人ID', target: 'candidate_id' },
      { source: '发送时间', target: 'sent_at' },
    ],
  };

  return (
    <motion.div
      initial={{opacity: 0, y: 10}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, y: -10}}
      className="max-w-[1500px] mx-auto w-full p-6 space-y-5"
    >
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-gray-900 dark:text-white mb-1">集成管理</h1>
          <p className="text-[13px] text-gray-500 dark:text-gray-400">统一管理内部系统与外部服务的连接状态。</p>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {data.metrics.map((item) => {
          const Icon = metricIconMap[item.icon];

          return (
            <div key={item.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] text-gray-500 dark:text-gray-400">{item.label}</span>
                <Icon className="w-4 h-4 text-[#1a4bc4]" />
              </div>
              <div className="text-[28px] leading-none font-bold text-gray-900 dark:text-white">{item.value}</div>
            </div>
          );
        })}
      </div>

      {isLoading ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-10 flex items-center justify-center text-gray-500 dark:text-gray-400">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          正在加载集成配置...
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl p-6">
          集成配置加载失败：{error}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-5">
          <div className="space-y-4">
            {data.connections.map((item) => (
              <div key={item.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Link2 className="w-4 h-4 text-[#1a4bc4]" />
                      <h2 className="text-[16px] font-bold text-gray-900 dark:text-white">{item.name}</h2>
                    </div>
                    <div className="text-[12px] text-gray-500 dark:text-gray-400">{item.endpoint}</div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[11px] font-medium ${item.status === 'connected' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {item.status === 'connected' ? '已连接' : '待检查'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[13px]">
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                    <div className="text-[12px] text-gray-500 dark:text-gray-400 mb-1">同步频率</div>
                    <div className="font-medium text-gray-900 dark:text-white">{item.sync}</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                    <div className="text-[12px] text-gray-500 dark:text-gray-400 mb-1">上次同步</div>
                    <div className="font-medium text-gray-900 dark:text-white">{item.lastSync}</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                    <div className="text-[12px] text-gray-500 dark:text-gray-400 mb-1">同步摘要</div>
                    <div className="font-medium text-gray-900 dark:text-white">{item.summary}</div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <button onClick={() => setMappingConnection(item)} className="px-4 py-2 bg-[#1a4bc4] hover:bg-[#0c2b7a] text-white rounded-lg text-[13px] font-medium transition-colors">
                    查看映射
                  </button>
                  <button
                    onClick={() => {
                      if (syncingId === item.id) return;
                      setSyncingId(item.id);
                      setTimeout(() => {
                        setSyncingId(null);
                      }, 1500);
                    }}
                    disabled={syncingId === item.id}
                    className="px-4 py-2 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded-lg text-[13px] font-medium text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50"
                  >
                    {syncingId === item.id ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        同步中...
                      </span>
                    ) : (
                      '立即同步'
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
            <h2 className="text-[16px] font-bold text-gray-900 dark:text-white mb-4">连接健康概览</h2>
            <div className="space-y-4">
              {data.healthChecks.map((item) => (
                <div key={item.label} className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                  <div className="text-[13px] text-gray-600 dark:text-gray-300">{item.label}</div>
                  <div
                    className={`text-[13px] font-medium ${
                      item.tone === 'success'
                        ? 'text-emerald-600'
                        : item.tone === 'warning'
                          ? 'text-amber-600'
                          : 'text-gray-900'
                    }`}
                  >
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 bg-[#0c2b7a] rounded-2xl p-5 text-white">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-[#22d3ee]" />
                <div className="text-[15px] font-bold">连接说明</div>
              </div>
              <div className="space-y-2 text-[13px] text-white/80">
                <p><strong>MIS 招聘系统</strong>：同步候选人数据、人才库信息和面试记录。</p>
                <p><strong>OpenClaw 系统</strong>：同步外联活动、模板和发送记录。</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {mappingConnection && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[18px] font-bold text-gray-900 dark:text-white">字段映射 - {mappingConnection.name}</h3>
              <button onClick={() => setMappingConnection(null)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 text-[12px] font-medium text-gray-500 dark:text-gray-400 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <span>源字段</span>
                <span></span>
                <span>目标字段</span>
              </div>
              {(fieldMappings[mappingConnection.name] || [
                { source: '候选人姓名', target: 'candidate_name' },
                { source: '候选人邮箱', target: 'candidate_email' },
                { source: '岗位', target: 'position' },
              ]).map((mapping, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-[13px]">
                  <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-300">{mapping.source}</div>
                  <ArrowRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-mono text-[12px]">{mapping.target}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-5">
              <button onClick={() => setMappingConnection(null)} className="px-4 py-2 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded-lg text-[13px] font-medium text-gray-700 dark:text-gray-300 transition-colors">
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
