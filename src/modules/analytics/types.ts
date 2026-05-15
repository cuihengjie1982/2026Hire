export type InsightMetric = {
  label: string;
  value: string;
  suffix?: string;
  trendLabel: string;
  icon: 'pie-chart' | 'trending-up' | 'gauge' | 'bar-chart';
};

export type FunnelStep = {
  label: string;
  value: number;
};

export type ChannelQuality = {
  name: string;
  count: number;
  avgScore: number;
};

export type AgentEfficiency = {
  name: string;
  adoptionRate: number;
  totalProcessed: number;
  status: string;
};

export type InsightsOverview = {
  metrics: InsightMetric[];
  funnel: FunnelStep[];
  channels: ChannelQuality[];
  agents: AgentEfficiency[];
};
