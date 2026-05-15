export type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'zhipu' | 'minimax' | 'moonshot' | 'qwen';

export interface AIModelConfig {
  id: string;
  name: string;
  provider: AIProvider;
  model_name: string;
  api_key_display: string;
  base_url?: string | null;
  temperature: number;
  max_tokens: number;
  is_default: boolean;
  is_active: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAIModelConfigInput {
  name: string;
  provider: AIProvider;
  model_name: string;
  api_key: string;
  base_url?: string;
  temperature?: number;
  max_tokens?: number;
  is_default?: boolean;
}

export interface AIResumeScoreResult {
  candidateId?: string | null;
  modelUsed: string;
  provider: string;
  totalScore: number;
  dimensionScores: Array<{
    dimension: string;
    score: number;
    maxScore: number;
    reasoning?: string;
  }>;
  strengths: string[];
  weaknesses: string[];
  matchedQualifications: string[];
  missingQualifications: string[];
  overallAssessment: string;
  recommendation: string;
  error?: string;
  rawResponse?: string;
}

export interface AIRankingResult {
  modelUsed: string;
  provider: string;
  ranking: Array<{
    rank: number;
    candidateIndex: number;
    totalScore: number;
    reasoning: string;
  }>;
  analysisSummary: string;
}

export interface ConfigHealthStatus {
  configId: string;
  healthy: boolean;
  latencyMs: number;
  error?: string;
  checkedAt: string;
}

export interface ActiveConfigResponse {
  active: AIModelConfig | null;
}
