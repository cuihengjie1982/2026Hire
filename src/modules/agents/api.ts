import {fetchJson, getItemsFromPayload, mockDelay, invokeEdgeFunction} from '../../shared/lib/apiClient';
import {supabase} from '../../shared/lib/supabase';
import {USE_MOCK_API} from '../../shared/lib/runtime';
import {agentStatsFixture, agentsFixture} from './fixtures';
import {type Agent, type AgentStats, type CreateAgentInput, type AgentRunResult} from './types';

let agentsData: Agent[] = (() => { try { const r = localStorage.getItem('em-box.mock.agents'); return r ? JSON.parse(r) : [...agentsFixture]; } catch { return [...agentsFixture]; } })();
const saveAgents = () => localStorage.setItem('em-box.mock.agents', JSON.stringify(agentsData));

export const listAgents = async (projectId?: string): Promise<Agent[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const base = projectId ? agentsData.filter((a) => a.projectId === projectId) : agentsData;
    return Array.from(new Map(base.map(a => [a.id, a])).values());
  }

  let query = supabase.from('agents').select('*');
  if (projectId) {
    query = query.eq('projectId', projectId);
  }
  const {data, error} = await query;
  if (error) throw new Error(error.message);
  return Array.from(new Map((data ?? []).map(r => [r.id as string, r])).values()) as Agent[];
};

export const getAgentStats = async (): Promise<AgentStats> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return agentStatsFixture;
  }

  // Compute stats from agents table: count by status
  const {data: allAgents, error} = await supabase.from('agents').select('status');
  if (error) throw new Error(error.message);

  const stats: AgentStats = {
    total: allAgents?.length ?? 0,
    running: 0,
    paused: 0,
    pending: 0,
    completed: 0,
  } as AgentStats;

  allAgents?.forEach((agent) => {
    const status = agent.status as 'running' | 'paused' | 'pending' | 'completed';
    if (status === 'running') stats.running++;
    else if (status === 'paused') stats.paused++;
    else if (status === 'pending') stats.pending++;
    else if (status === 'completed') stats.completed++;
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

  const {data, error} = await (supabase.from('agents' as any).insert(input as any) as any).select().single() as { data: Agent | null; error: Error | null };
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Failed to create agent');
  return data;
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

  const {data, error} = await (supabase.from('agents' as any).update(input as any) as any).eq('id', agentId).select().single() as { data: Agent | null; error: Error | null };
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Agent not found');
  return data;
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

  const {data, error} = await (supabase.from('agents' as any).update({status: 'paused'} as any) as any).eq('id', agentId).select().single() as { data: Agent | null; error: Error | null };
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Agent not found');
  return data;
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

  const {data, error} = await (supabase.from('agents' as any).update({status: 'running'} as any) as any).eq('id', agentId).select().single() as { data: Agent | null; error: Error | null };
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Agent not found');
  return data;
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

  const {error} = await supabase.from('agents').delete().eq('id', agentId);
  if (error) throw new Error(error.message);
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

  const data = await invokeEdgeFunction<Agent & {runResult: AgentRunResult}>(
    'agent-executor',
    { agentId },
  );
  return data;
};