import {type InsightsOverview} from './types';

export const insightsOverviewFixture: InsightsOverview = {
  metrics: [
    {label: '总候选人数', value: '19', suffix: '人', trendLabel: '累计至今', icon: 'pie-chart'},
    {label: '面试场次', value: '6', suffix: '场', trendLabel: '累计至今', icon: 'bar-chart'},
    {label: '通过率', value: '66.7', suffix: '%', trendLabel: '历史平均', icon: 'trending-up'},
    {label: '平均得分', value: '78.5', suffix: '分', trendLabel: '历史平均', icon: 'gauge'},
  ],
  funnel: [
    {label: '候选人入库', value: 19},
    {label: '简历已评分', value: 15},
    {label: '加入短名单', value: 8},
    {label: '面试安排', value: 6},
    {label: '面试完成', value: 4},
    {label: '审批通过', value: 2},
  ],
  channels: [
    {name: '51job', count: 8, avgScore: 82.3},
    {name: 'BOSS直聘', count: 6, avgScore: 75.1},
    {name: '猎聘', count: 3, avgScore: 79.8},
    {name: '未标记', count: 2, avgScore: 0},
  ],
  agents: [
    {name: '简历解析器', adoptionRate: 0.92, totalProcessed: 150, status: 'active'},
    {name: '智能筛选器', adoptionRate: 0.87, totalProcessed: 120, status: 'active'},
    {name: '候选人匹配', adoptionRate: 0.78, totalProcessed: 95, status: 'active'},
  ],
};
