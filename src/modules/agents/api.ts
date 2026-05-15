import {fetchJson, getItemsFromPayload, mockDelay, invokeEdgeFunction} from '../../shared/lib/apiClient';
import {supabase} from '../../shared/lib/supabase';
import {USE_MOCK_API} from '../../shared/lib/runtime';
import {agentStatsFixture, agentsFixture} from './fixtures';
import {type Agent, type AgentStats, type CreateAgentInput, type AgentRunResult} from './types';

let agentsData = [...agentsFixture];

export const listAgents = async (projectId?: string): Promise<Agent[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    if (projectId) {
      return agentsData.filter((a) => a.projectId === projectId);
    }
    return agentsData;
  }

  let query = supabase.from('agents').select('*');
  if (projectId) {
    query = query.eq('projectId', projectId);
  }
  const {data, error} = await query;
  if (error) throw new Error(error.message);
  return data as Agent[];
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
  };

  allAgents?.forEach((agent) => {
    const status = agent.status as keyof AgentStats;
    if (status in stats) {
      stats[status] = (stats[status] ?? 0) + 1;
    }
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
    return newAgent;
  }

  const {data, error} = await supabase.from('agents').insert(input).select().single();
  if (error) throw new Error(error.message);
  return data as Agent;
};

export const updateAgent = async (agentId: string, input: Partial<CreateAgentInput>): Promise<Agent> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const index = agentsData.findIndex((a) => a.id === agentId);
    if (index === -1) throw new Error('Agent not found');
    agentsData[index] = {...agentsData[index], ...input, updatedAt: new Date().toISOString()};
    return agentsData[index];
  }

  const {data, error} = await supabase.from('agents').update(input).eq('id', agentId).select().single();
  if (error) throw new Error(error.message);
  return data as Agent;
};

export const pauseAgent = async (agentId: string): Promise<Agent> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const index = agentsData.findIndex((a) => a.id === agentId);
    if (index === -1) throw new Error('Agent not found');
    agentsData[index] = {...agentsData[index], status: 'paused'};
    return agentsData[index];
  }

  const {data, error} = await supabase.from('agents').update({status: 'paused'}).eq('id', agentId).select().single();
  if (error) throw new Error(error.message);
  return data as Agent;
};

export const resumeAgent = async (agentId: string): Promise<Agent> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const index = agentsData.findIndex((a) => a.id === agentId);
    if (index === -1) throw new Error('Agent not found');
    agentsData[index] = {...agentsData[index], status: 'running'};
    return agentsData[index];
  }

  const {data, error} = await supabase.from('agents').update({status: 'running'}).eq('id', agentId).select().single();
  if (error) throw new Error(error.message);
  return data as Agent;
};

export const deleteAgent = async (agentId: string): Promise<void> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const index = agentsData.findIndex((a) => a.id === agentId);
    if (index !== -1) {
      agentsData.splice(index, 1);
    }
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

  const {data, error} = await invokeEdgeFunction<Agent & {runResult: AgentRunResult}>('agent-executor', {
    body: {
      agentId,
    },
  });
  if (error) throw new Error(error.message);
  return data;
};