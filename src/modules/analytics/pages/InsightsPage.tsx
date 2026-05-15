import {motion} from 'motion/react';
import {ArrowUp, BarChart3, Download, Gauge, Loader2, PieChart, TrendingUp} from 'lucide-react';
import {useEffect, useState} from 'react';
import {useInsightsOverview} from '../hooks';
import {useProject} from '../../../app/contexts/ProjectContext';
import {listPositions} from '../../positions/api';
import {type PositionSummary} from '../../positions/types';

const metricIconMap = {
  'pie-chart': PieChart,
  'trending-up': TrendingUp,
  gauge: Gauge,
  'bar-chart': BarChart3,
} as const;

type TimeRange = '7days' | '30days' | '90days' | 'custom';

export const InsightsPage = () => {
  const {selectedProject, projects} = useProject();
  const [timeRange, setTimeRange] = useState<TimeRange>('30days');

  // Map frontend time range to backend timeRange parameter
  const backendTimeRange = timeRange === '7days' ? 'thisWeek'
    : timeRange === '30days' ? 'thisMonth'
    : timeRange === '90days' ? 'thisQuarter'
    : 'all';

  const {data, error, isLoading} = useInsightsOverview(backendTimeRange);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [positions, setPositions] = useState<PositionSummary[]>([]);
  const [selectedPositionId, setSelectedPositionId] = useState<string>('');

  useEffect(() => {
    if (selectedProject) {
      setSelectedProjectId(selectedProject.id);
      loadPositions(selectedProject.id);
    }
  }, [selectedProject]);

  const loadPositions = async (projectId: string) => {
    try {
      const allPositions = await listPositions();
      setPositions(allPositions.filter((p) => p.projectId === projectId));
    } catch (e) {
      console.error('Failed to load positions:', e);
    }
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
          <h1 className="text-[26px] font-bold text-gray-900 mb-1">数据洞察</h1>
          <p className="text-[13px] text-gray-500">聚合候选人漏斗、来源质量和 AI 代理效率，方便快速定位问题。</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-2">
            <select
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                loadPositions(e.target.value);
                setSelectedPositionId('');
              }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-white min-w-[180px]"
            >
              <option value="">全部项目</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <select
              value={selectedPositionId}
              onChange={(e) => setSelectedPositionId(e.target.value)}
              disabled={!selectedProjectId}
              className="px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-white min-w-[160px]"
            >
              <option value="">全部岗位</option>
              {positions.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden text-[13px] font-medium">
              {[
                {label: '近7天', value: '7days' as TimeRange},
                {label: '近30天', value: '30days' as TimeRange},
                {label: '近90天', value: '90days' as TimeRange},
                {label: '自定义', value: 'custom' as TimeRange},
              ].map((item) => (
                <button
                  key={item.value}
                  onClick={() => setTimeRange(item.value)}
                  className={`px-4 py-2 transition-colors ${
                    timeRange === item.value ? 'bg-gray-50 text-gray-900 border-x border-gray-200' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {timeRange === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                />
                <span className="text-gray-500">至</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                />
              </div>
            )}
            <button
              onClick={() => {
                if (!data) return;
                const csvRows: string[] = [];
                // Metrics
                csvRows.push(['--- 指标概览 ---'].join(','));
                csvRows.push(['指标', '值', '趋势'].join(','));
                data.metrics.forEach(m => {
                  csvRows.push([m.label, m.value + (m.suffix || ''), m.trendLabel].join(','));
                });
                csvRows.push('');
                // Funnel
                csvRows.push(['--- 招募漏斗 ---'].join(','));
                csvRows.push(['阶段', '人数'].join(','));
                data.funnel.forEach(f => {
                  csvRows.push([f.label, String(f.value)].join(','));
                });
                csvRows.push('');
                // Channels
                csvRows.push(['--- 来源质量 ---'].join(','));
                csvRows.push(['来源', '候选人数', '平均分'].join(','));
                data.channels.forEach(c => {
                  csvRows.push([c.name, String(c.count), String(c.avgScore)].join(','));
                });
                csvRows.push('');
                // Agents
                csvRows.push(['--- AI代理效率 ---'].join(','));
                csvRows.push(['代理', '采纳率(%)', '已处理', '状态'].join(','));
                data.agents.forEach(a => {
                  csvRows.push([a.name, String(a.adoptionRate), String(a.totalProcessed), a.status].join(','));
                });
                const csvContent = csvRows.join('\n');
                const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `insights_${new Date().toISOString().split('T')[0]}.csv`;
                link.click();
              }}
              className="flex items-center gap-2 bg-[#1a4bc4] hover:bg-[#0c2b7a] text-white px-4 py-2 rounded-lg text-[13px] font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              导出
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {data.metrics.map((item) => {
          const Icon = metricIconMap[item.icon];

          return (
            <div key={item.label} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[12px] text-gray-500">{item.label}</div>
                <Icon className="w-4 h-4 text-[#1a4bc4]" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-[28px] leading-none font-bold text-gray-900">{item.value}</span>
                {item.suffix ? <span className="text-[13px] text-gray-500">{item.suffix}</span> : null}
              </div>
              <div className="mt-3 flex items-center text-[12px] text-emerald-600 font-medium">
                <ArrowUp className="w-3.5 h-3.5 mr-1" />
                {item.trendLabel}
              </div>
            </div>
          );
        })}
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 flex items-center justify-center text-gray-500">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          正在加载洞察数据...
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl p-6">
          洞察数据加载失败：{error}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-5">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-[16px] font-bold text-gray-900 mb-5">招募漏斗</h2>
              {/* True funnel: trapezoid color shape + text overlay */}
              <div className="flex items-start gap-3">
                <div className="flex-1 flex flex-col items-center" style={{minHeight: 300}}>
                  {data.funnel.map((step, index) => {
                    const baseValue = data.funnel[0].value || 1;
                    const topW = Math.max((step.value / baseValue) * 100, 12);
                    const nextVal = index < data.funnel.length - 1
                      ? Math.max((data.funnel[index + 1].value / baseValue) * 100, 12)
                      : topW;
                    const tl = ((100 - topW) / 2).toFixed(1);
                    const tr = ((100 + topW) / 2).toFixed(1);
                    const br = ((100 + nextVal) / 2).toFixed(1);
                    const bl = ((100 - nextVal) / 2).toFixed(1);
                    const bgColors = ['#1a4bc4','#2563eb','#3b82f6','#0891b2','#0d9488','#059669'];
                    return (
                      <div key={step.label} className="w-full relative" style={{height: 48, marginTop: index === 0 ? 0 : -1}}>
                        {/* Colored trapezoid shape (clipped) */}
                        <div
                          className="absolute inset-0"
                          style={{
                            clipPath: `polygon(${tl}% 0, ${tr}% 0, ${br}% 100%, ${bl}% 100%)`,
                            backgroundColor: bgColors[index % bgColors.length],
                          }}
                        />
                        {/* Text overlay (not clipped, centered above shape) */}
                        <div className="absolute inset-0 flex items-center justify-center gap-3 text-white">
                          <span className="text-[12px] font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">{step.label}</span>
                          <span className="text-[15px] font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">{step.value}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Conversion rates beside each layer */}
                <div className="flex flex-col" style={{minHeight: 300}}>
                  {data.funnel.map((step, index) => {
                    const conv = index > 0 && data.funnel[index - 1].value > 0
                      ? Math.round((step.value / data.funnel[index - 1].value) * 100) : null;
                    const isLow = conv !== null && conv < 50;
                    return (
                      <div key={step.label} className="flex items-center" style={{height: 48, marginTop: index === 0 ? 0 : -1}}>
                        {conv !== null ? (
                          <span className={`text-[12px] font-bold whitespace-nowrap ${isLow ? 'text-red-500' : 'text-gray-400'}`}>
                            {isLow ? '⚠ ' : ''}{conv}%
                          </span>
                        ) : (
                          <span className="text-[12px] text-gray-300">—</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              {data.funnel.length > 1 && data.funnel[0].value > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[12px]">
                  <span className="text-gray-500">整体转化率</span>
                  <span className="font-bold text-[#1a4bc4]">
                    {Math.round((data.funnel[data.funnel.length - 1].value / data.funnel[0].value) * 100)}%
                    <span className="font-normal text-gray-400 ml-1">
                      ({data.funnel[data.funnel.length - 1].value}/{data.funnel[0].value})
                    </span>
                  </span>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-[16px] font-bold text-gray-900 mb-5">候选人来源质量对比</h2>
              {data.channels.length === 0 ? (
                <div className="text-[13px] text-gray-400 text-center py-8">暂无来源数据</div>
              ) : (
                <div className="space-y-4">
                  {data.channels.map((channel) => {
                    const maxCount = Math.max(...data.channels.map(c => c.count), 1);
                    return (
                      <div key={channel.name}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[13px] font-medium text-gray-700">{channel.name}</div>
                          <div className="flex items-center gap-3 text-[12px]">
                            <span className="text-gray-500">{channel.count} 人</span>
                            <span className="font-medium text-[#1a4bc4]">均分 {channel.avgScore}</span>
                          </div>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#1a4bc4] to-[#3b82f6] rounded-full transition-all"
                            style={{width: `${(channel.count / maxCount) * 100}%`}}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-[16px] font-bold text-gray-900 mb-5">AI 代理效率对比</h2>
            {data.agents.length === 0 ? (
              <div className="text-[13px] text-gray-400 text-center py-8">暂无代理数据</div>
            ) : (
              <div className="space-y-4">
                {data.agents.map((agent) => (
                  <div key={agent.name} className="bg-gray-50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-gray-900">{agent.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          agent.status === 'running' ? 'bg-emerald-100 text-emerald-700' :
                          agent.status === 'paused' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {agent.status === 'running' ? '运行中' : agent.status === 'paused' ? '已暂停' : '待启动'}
                        </span>
                      </div>
                      <span className="text-[12px] text-gray-500">已处理 {agent.totalProcessed} 项</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${agent.adoptionRate >= 80 ? 'bg-emerald-500' : agent.adoptionRate >= 60 ? 'bg-[#1a4bc4]' : 'bg-amber-500'}`}
                            style={{width: `${Math.min(agent.adoptionRate, 100)}%`}}
                          />
                        </div>
                      </div>
                      <span className="text-[13px] font-bold text-gray-700 w-14 text-right">{agent.adoptionRate}%</span>
                      <span className="text-[11px] text-gray-400">采纳率</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>
      )}
    </motion.div>
  );
};
