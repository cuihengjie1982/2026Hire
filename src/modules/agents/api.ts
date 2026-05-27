import {cached, invalidateCache} from '../../shared/lib/apiClient';
import {USE_MOCK_API, API_BASE_URL, getAuthToken} from '../../shared/lib/runtime';

const efetch = async <T>(path: string, method = 'GET', body?: Record<string, unknown>): Promise<T> => {
  const base = USE_MOCK_API ? '' : API_BASE_URL;
  const res = await fetch(`${base}/functions/v1/embox-api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken() ?? ''}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `API error ${res.status}`);
  return data as T;
};
import {agentStatsFixture, agentsFixture} from './fixtures';
import {type Agent, type AgentStats, type CreateAgentInput, type AgentRunResult} from './types';

let agentsData: Agent[] = (() => { try { const r = localStorage.getItem('em-box.mock.agents'); return r ? JSON.parse(r) : [...agentsFixture]; } catch { return [...agentsFixture]; } })();
const saveAgents = () => localStorage.setItem('em-box.mock.agents', JSON.stringify(agentsData));

const mapAgent = (raw: Record<string, unknown>): Agent => ({
  id: String(raw.id ?? ''),
  name: String(raw.name ?? ''),
  description: raw.description ? String(raw.description) : undefined,
  status: String(raw.status ?? 'pending') as Agent['status'],
  type: raw.type ? String(raw.type) as Agent['type'] : undefined,
  projectId: String(raw.project_id ?? raw.projectId ?? ''),
  projectName: String(raw.project_name ?? raw.projectName ?? ''),
  roleType: String(raw.role_type ?? raw.roleType ?? ''),
  config: raw.config as Agent['config'],
  pushedToday: Number(raw.pushed_today ?? raw.pushedToday ?? 0),
  approved: Number(raw.approved ?? 0),
  rejected: Number(raw.rejected ?? 0),
  pending: Number(raw.pending_count ?? raw.pending ?? 0),
  adoptionRate: Number(raw.adoption_rate ?? raw.adoptionRate ?? 0),
  updatedAt: String(raw.updated_at ?? raw.updatedAt ?? ''),
});

export const listAgents = async (projectId?: string): Promise<Agent[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const base = projectId ? agentsData.filter((a) => a.projectId === projectId) : agentsData;
    return Array.from(new Map(base.map(a => [a.id, a])).values());
  }

  const cacheKey = `listAgents${projectId ? `:${projectId}` : ''}`;
  return cached(cacheKey, async () => {
    const data = await efetch<Record<string, unknown>[]>('/agents', 'GET');
    return (data ?? []).map(mapAgent);
  });
};

export const getAgentStats = async (): Promise<AgentStats> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return agentStatsFixture;
  }

  const agents = await listAgents();
  const stats: AgentStats = {
    total: agents.length,
    running: 0,
    paused: 0,
    pending: 0,
    completed: 0,
    runningAgents: 0,
    pushedToday: 0,
    weeklyAdoptionRate: 0,
    monthlyOutreach: 0,
  };

  agents.forEach((agent) => {
    if (agent.status === 'running') stats.running++;
    else if (agent.status === 'paused') stats.paused++;
    else if (agent.status === 'pending') stats.pending++;
    else if (agent.status === 'completed') stats.completed++;
  });

  return stats;
};

export const createAgent = async (input: CreateAgentInput): Promise<Agent> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const newAgent: Agent = {
      id: Date.now().toString(),
      projectId: input.projectId ?? '',
      projectName: input.projectName ?? '',
      roleType: input.roleType ?? '',
      name: input.name,
      description: input.description,
      type: input.type,
      config: input.config,
      status: 'pending',
      pushedToday: 0,
      approved: 0,
      rejected: 0,
      pending: 0,
      adoptionRate: 0,
      updatedAt: new Date().toISOString(),
    };
    agentsData.push(newAgent);
    saveAgents();
    return newAgent;
  }

  const data = await efetch<Record<string, unknown>>('/agents', 'POST', {
    name: input.name,
    description: input.description,
    type: input.type,
    roleType: input.roleType,
    config: input.config,
    projectId: input.projectId,
    projectName: input.projectName,
  });
  invalidateCache();
  return mapAgent(data);
};

export const updateAgent = async (agentId: string, input: Partial<CreateAgentInput>): Promise<Agent> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const index = agentsData.findIndex((a) => a.id === agentId);
    if (index === -1) throw new Error('Agent not found');
    agentsData[index] = {...agentsData[index], ...input, updatedAt: new Date().toISOString()};
    saveAgents();
    return agentsData[index];
  }

  const data = await efetch<Record<string, unknown>>('/agents', 'PATCH', {
    id: agentId,
    name: input.name,
    description: input.description,
    type: input.type,
    roleType: input.roleType,
    config: input.config,
    projectId: input.projectId,
    projectName: input.projectName,
  });
  invalidateCache();
  return mapAgent(data);
};

export const pauseAgent = async (agentId: string): Promise<Agent> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const index = agentsData.findIndex((a) => a.id === agentId);
    if (index === -1) throw new Error('Agent not found');
    agentsData[index] = {...agentsData[index], status: 'paused'};
    saveAgents();
    return agentsData[index];
  }

  const data = await efetch<Record<string, unknown>>('/agents', 'PATCH', { id: agentId, status: 'paused' });
  invalidateCache();
  return mapAgent(data);
};

export const resumeAgent = async (agentId: string): Promise<Agent> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const index = agentsData.findIndex((a) => a.id === agentId);
    if (index === -1) throw new Error('Agent not found');
    agentsData[index] = {...agentsData[index], status: 'running'};
    saveAgents();
    return agentsData[index];
  }

  const data = await efetch<Record<string, unknown>>('/agents', 'PATCH', { id: agentId, status: 'running' });
  invalidateCache();
  return mapAgent(data);
};

export const deleteAgent = async (agentId: string): Promise<void> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const index = agentsData.findIndex((a) => a.id === agentId);
    if (index !== -1) {
      agentsData.splice(index, 1);
    }
    saveAgents();
    return;
  }

  await efetch('/agents', 'DELETE', { id: agentId });
  invalidateCache();
};

export const runAgent = async (agentId: string): Promise<Agent & {runResult: AgentRunResult}> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 1500));
    const index = agentsData.findIndex((a) => a.id === agentId);
    if (index === -1) throw new Error('Agent not found');
    const agent = agentsData[index];
    return {
      ...agent,
      runResult: {
        processed: 5,
        approved: 3,
        rejected: 1,
        pending: 1,
        summary: '模拟运行：处理 5 人，推荐 3 人',
        duration: 2500,
      },
    };
  }

  const data = await efetch<Agent & {runResult: AgentRunResult}>('/agent-executor/run', 'POST', { agentId });
  return data;
};