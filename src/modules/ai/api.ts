import {fetchJson} from '../../shared/lib/apiClient';
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
import {aiModelConfigsFixture} from './fixtures';
import {type AIModelConfig, type CreateAIModelConfigInput, type AIResumeScoreResult, type AIRankingResult, type ActiveConfigResponse} from './types';

// localStorage-backed mock store
const STORAGE_KEY = 'em-box.mock.ai-configs';

const loadFromStorage = (): AIModelConfig[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : aiModelConfigsFixture.map(c => ({...c}));
  } catch {
    return aiModelConfigsFixture.map(c => ({...c}));
  }
};

const saveToStorage = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configsData));
};

let configsData = loadFromStorage();

export const listAIModelConfigs = async (): Promise<AIModelConfig[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return [...configsData];
  }
  const payload = await efetch<AIModelConfig[] | {items: AIModelConfig[]}>('/ai-config', 'GET');
  if (Array.isArray(payload)) return payload;
  return (payload as {items: AIModelConfig[]}).items ?? [];
};

export const createAIModelConfig = async (input: CreateAIModelConfigInput): Promise<AIModelConfig> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const config: AIModelConfig = {
      id: Date.now().toString(),
      name: input.name,
      provider: input.provider,
      model_name: input.model_name,
      api_key_display: `${input.api_key.slice(0, 4)}...${input.api_key.slice(-4)}`,
      base_url: input.base_url ?? null,
      temperature: input.temperature ?? 0.7,
      max_tokens: input.max_tokens ?? 4096,
      is_default: input.is_default ?? false,
      is_active: true,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    configsData.push(config);
    saveToStorage();
    return config;
  }
  return efetch<AIModelConfig>('/ai-config', 'POST', {
    name: input.name,
    provider: input.provider,
    model_name: input.model_name,
    api_key: input.api_key,
    base_url: input.base_url,
    temperature: input.temperature,
    max_tokens: input.max_tokens,
    is_default: input.is_default,
  });
};

export const updateAIModelConfig = async (id: string, input: Partial<CreateAIModelConfigInput> & {is_active?: boolean}): Promise<AIModelConfig> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const index = configsData.findIndex(c => c.id === id);
    if (index === -1) throw new Error('AI model config not found');
    const existing = configsData[index];
    configsData[index] = {
      ...existing,
      ...input,
      api_key_display: input.api_key
        ? `${input.api_key.slice(0, 4)}...${input.api_key.slice(-4)}`
        : existing.api_key_display,
      updated_at: new Date().toISOString(),
    };
    saveToStorage();
    return configsData[index];
  }
  return efetch<AIModelConfig>(`/ai-config/${id}`, 'PATCH', input as Record<string, unknown>);
};

export const deleteAIModelConfig = async (id: string): Promise<void> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const index = configsData.findIndex(c => c.id === id);
    if (index !== -1) configsData.splice(index, 1);
    saveToStorage();
    return;
  }
  await efetch<{deleted: boolean}>(`/ai-config/${id}`, 'DELETE');
};

export const screenResumeWithAI = async (input: {
  candidateId?: string;
  positionId?: string;
  positionName?: string;
  aiPrompt?: string;
  scoringRules?: Array<{dimension: string; weight: number; keywords: string[]; matchMode?: string}>;
  aiModelConfigId?: string;
  resumeText: string;
}): Promise<AIResumeScoreResult> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 600));
    return {
      candidateId: input.candidateId ?? null,
      modelUsed: 'mock-gpt-4o',
      provider: 'openai',
      totalScore: 75,
      dimensionScores: (input.scoringRules || []).map(r => ({
        dimension: r.dimension,
        score: Math.round(r.weight * 0.7),
        maxScore: r.weight,
        reasoning: '基于简历内容匹配评估',
      })),
      strengths: ['相关经验丰富'],
      weaknesses: ['部分技能需提升'],
      matchedQualifications: ['满足基本要求'],
      missingQualifications: [],
      overallAssessment: '候选人整体符合岗位要求，可以考虑进入下一轮。',
      recommendation: '推荐',
    };
  }
  return efetch<AIResumeScoreResult>('/ai-proxy', 'POST', {
    action: 'screen-resume',
    ...input,
  });
};

export const rankCandidatesWithAI = async (input: {
  candidates: Array<{id?: string; resumeText: string}>;
  positionName?: string;
  aiPrompt?: string;
  scoringRules?: Array<{dimension: string; weight: number; keywords: string[]; matchMode?: string}>;
  aiModelConfigId?: string;
}): Promise<AIRankingResult> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 800));
    return {
      modelUsed: 'mock-gpt-4o',
      provider: 'openai',
      ranking: input.candidates.map((c, i) => ({
        rank: i + 1,
        candidateIndex: i,
        totalScore: 90 - i * 5,
        reasoning: '基于简历综合评估排名',
      })),
      analysisSummary: '候选人整体质量较高，排名靠前的候选人经验更为匹配。',
    };
  }
  return efetch<AIRankingResult>('/ai-proxy', 'POST', {
    action: 'rank-candidates',
    ...input,
  });
};

export const switchActiveModel = async (configId: string): Promise<AIModelConfig & {envWarning?: string}> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const idx = configsData.findIndex(c => c.id === configId);
    if (idx === -1) throw new Error('Config not found');
    configsData.forEach(c => { c.is_default = false; });
    configsData[idx].is_default = true;
    saveToStorage();
    return configsData[idx];
  }
  return efetch<AIModelConfig & {envWarning?: string}>('/ai-config/switch', 'POST', { configId });
};

export const getActiveModelConfig = async (): Promise<ActiveConfigResponse> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const active = configsData.find(c => c.is_default && c.is_active) ?? null;
    return {active};
  }
  return efetch<ActiveConfigResponse>('/ai-config/active', 'GET');
};

export const healthCheckConfig = async (configId: string): Promise<{healthy: boolean; latencyMs: number; error?: string}> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 500));
    return {healthy: true, latencyMs: 150};
  }
  return efetch<{healthy: boolean; latencyMs: number; error?: string}>('/ai-config/health-check', 'POST', { configId });
};