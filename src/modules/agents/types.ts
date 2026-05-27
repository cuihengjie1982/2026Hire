export type AgentStatus = 'running' | 'pending' | 'paused';
export type AgentType = 'parser' | 'screener' | 'matcher';

export interface AgentConfig {
  positionId?: string;
  positionName?: string;
  aiModelConfigId?: string;
  autoApproveGrades?: string[];
  autoRun?: boolean;
  processedCount?: number;
  lastRunAt?: string;
  lastRunSummary?: string;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  status: AgentStatus;
  type?: AgentType;
  projectId: string;
  projectName: string;
  roleType: string;
  config?: AgentConfig | Record<string, unknown>;
  pushedToday: number;
  approved: number;
  rejected: number;
  pending: number;
  adoptionRate: number;
  updatedAt: string;
}

export interface AgentStats {
  runningAgents: number;
  pushedToday: number;
  weeklyAdoptionRate: number;
  monthlyOutreach: number;
  total: number;
  running: number;
  paused: number;
  pending: number;
  completed: number;
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  projectId?: string;
  projectName?: string;
  roleType?: string;
  type?: AgentType;
  config?: AgentConfig;
}

export interface AgentRunResult {
  processed: number;
  approved: number;
  rejected: number;
  pending: number;
  summary: string;
  duration: number;
}
