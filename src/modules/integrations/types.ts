export type IntegrationStatus = 'connected' | 'warning';

export type IntegrationSummaryMetric = {
  label: string;
  value: string;
  icon: 'plug-zap' | 'shield-check' | 'refresh-cw' | 'database';
};

export type IntegrationConnection = {
  id: string;
  name: string;
  status: IntegrationStatus;
  endpoint: string;
  sync: string;
  lastSync: string;
  summary: string;
};

export type IntegrationHealthCheck = {
  label: string;
  value: string;
  tone: 'default' | 'success' | 'warning';
};

export type IntegrationOverview = {
  metrics: IntegrationSummaryMetric[];
  connections: IntegrationConnection[];
  healthChecks: IntegrationHealthCheck[];
};
