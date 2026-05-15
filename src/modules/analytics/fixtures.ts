import {type InsightsOverview} from './types';

export const insightsOverviewFixture: InsightsOverview = {
  metrics: [
    {label: '总候选人数', value: '156', suffix: '人', trendLabel: '累计至今', icon: 'pie-chart'},
    {label: '面试场次', value: '42', suffix: '场', trendLabel: '累计至今', icon: 'bar-chart'},
    {label: '通过率', value: '64.3', suffix: '%', trendLabel: '历史平均', icon: 'trending-up'},
    {label: '平均得分', value: '76.5', suffix: '分', trendLabel: '历史平均', icon: 'gauge'},
  ],
  funnel: [
    {label: '候选人入库', value: 156},
    {label: '简历已评分', value: 120},
    {label: '加入短名单', value: 68},
    {label: '面试安排', value: 48},
    {label: '面试完成', value: 42},
    {label: '审批通过', value: 27},
  ],
  channels: [
    {name: 'MWV', count: 45, avgScore: 78.5},
    {name: 'ITF', count: 32, avgScore: 72.3},
    {name: 'ITW', count: 28, avgScore: 68.8},
    {name: '未标记', count: 51, avgScore: 65.2},
  ],
  agents: [
    {name: '简历解析代理', adoptionRate: 92.5, totalProcessed: 120, status: 'running'},
    {name: '简历筛选代理', adoptionRate: 85.2, totalProcessed: 95, status: 'running'},
    {name: '岗位匹配代理', adoptionRate: 78.0, totalProcessed: 45, status: 'pending'},
  ],
};
