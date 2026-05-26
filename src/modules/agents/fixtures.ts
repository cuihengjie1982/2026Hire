import {type AgentStats, type Agent} from './types';

export const agentStatsFixture: AgentStats = {
  total: 0, running: 0, paused: 0, pending: 0, completed: 0,
  runningAgents: 0, pushedToday: 0, weeklyAdoptionRate: 0, monthlyOutreach: 0,
};
export const agentsFixture: Agent[] = [];