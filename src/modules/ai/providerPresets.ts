import {type AIProvider} from './types';

export interface ProviderPreset {
  id: string;
  name: string;
  provider: AIProvider;
  model_name: string;
  base_url?: string;
  temperature: number;
  max_tokens: number;
  icon: string;
  description?: string;
  category: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  // DeepSeek
  {id: 'deepseek-v3', name: 'DeepSeek V3', provider: 'deepseek', model_name: 'deepseek-chat', temperature: 0.7, max_tokens: 4096, icon: 'deepseek', description: 'DeepSeek 通用模型', category: 'DeepSeek'},
  {id: 'deepseek-r1', name: 'DeepSeek R1', provider: 'deepseek', model_name: 'deepseek-reasoner', temperature: 0.7, max_tokens: 8192, icon: 'deepseek', description: 'DeepSeek 推理模型', category: 'DeepSeek'},

  // 智谱 GLM
  {id: 'glm-4-plus', name: 'GLM-4 Plus', provider: 'zhipu', model_name: 'glm-4-plus', temperature: 0.7, max_tokens: 4096, icon: 'zhipu', description: '智谱旗舰模型，综合能力强', category: '智谱 GLM'},
  {id: 'glm-4-flash', name: 'GLM-4 Flash', provider: 'zhipu', model_name: 'glm-4-flash', temperature: 0.7, max_tokens: 4096, icon: 'zhipu', description: '智谱免费快速模型', category: '智谱 GLM'},
  {id: 'glm-4-air', name: 'GLM-4 Air', provider: 'zhipu', model_name: 'glm-4-air', temperature: 0.7, max_tokens: 4096, icon: 'zhipu', description: '智谱高性价比模型', category: '智谱 GLM'},
  {id: 'glm-4-long', name: 'GLM-4 Long', provider: 'zhipu', model_name: 'glm-4-long', temperature: 0.7, max_tokens: 4096, icon: 'zhipu', description: '智谱长上下文模型（128K）', category: '智谱 GLM'},

  // MiniMax
  {id: 'minimax-m1', name: 'MiniMax M1', provider: 'minimax', model_name: 'MiniMax-M1', temperature: 0.7, max_tokens: 8192, icon: 'minimax', description: 'MiniMax 旗舰推理模型', category: 'MiniMax'},
  {id: 'minimax-text-01', name: 'MiniMax-Text-01', provider: 'minimax', model_name: 'MiniMax-Text-01', temperature: 0.7, max_tokens: 8192, icon: 'minimax', description: 'MiniMax 长上下文模型', category: 'MiniMax'},

  // Kimi / Moonshot
  {id: 'moonshot-v1-128k', name: 'Kimi v1 128k', provider: 'moonshot', model_name: 'moonshot-v1-128k', temperature: 0.7, max_tokens: 4096, icon: 'moonshot', description: '月之暗面 Kimi 长上下文模型', category: 'Kimi'},
  {id: 'moonshot-v1-32k', name: 'Kimi v1 32k', provider: 'moonshot', model_name: 'moonshot-v1-32k', temperature: 0.7, max_tokens: 4096, icon: 'moonshot', description: 'Kimi 标准模型', category: 'Kimi'},

  // Qwen / 通义千问
  {id: 'qwen-max', name: 'Qwen Max', provider: 'qwen', model_name: 'qwen-max', temperature: 0.7, max_tokens: 8192, icon: 'qwen', description: '阿里通义千问旗舰模型', category: '通义千问'},
  {id: 'qwen-plus', name: 'Qwen Plus', provider: 'qwen', model_name: 'qwen-plus', temperature: 0.7, max_tokens: 8192, icon: 'qwen', description: '通义千问增强模型', category: '通义千问'},
  {id: 'qwen-turbo', name: 'Qwen Turbo', provider: 'qwen', model_name: 'qwen-turbo', temperature: 0.7, max_tokens: 4096, icon: 'qwen', description: '通义千问快速模型', category: '通义千问'},

  // OpenAI
  {id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', model_name: 'gpt-4o', temperature: 0.7, max_tokens: 4096, icon: 'openai', description: 'OpenAI 旗舰多模态模型', category: 'OpenAI'},
  {id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', model_name: 'gpt-4o-mini', temperature: 0.7, max_tokens: 4096, icon: 'openai', description: '经济高效的轻量模型', category: 'OpenAI'},
  {id: 'o1', name: 'o1', provider: 'openai', model_name: 'o1', temperature: 1, max_tokens: 32768, icon: 'openai', description: '深度推理模型', category: 'OpenAI'},
  {id: 'o3-mini', name: 'o3-mini', provider: 'openai', model_name: 'o3-mini', temperature: 1, max_tokens: 65536, icon: 'openai', description: '高效推理模型', category: 'OpenAI'},

  // Anthropic
  {id: 'claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'anthropic', model_name: 'claude-sonnet-4-20250514', temperature: 0.7, max_tokens: 8192, icon: 'anthropic', description: 'Anthropic 平衡性能模型', category: 'Anthropic'},
  {id: 'claude-opus-4', name: 'Claude Opus 4', provider: 'anthropic', model_name: 'claude-opus-4-20250514', temperature: 0.7, max_tokens: 8192, icon: 'anthropic', description: 'Anthropic 最强推理模型', category: 'Anthropic'},
  {id: 'claude-haiku-3.5', name: 'Claude 3.5 Haiku', provider: 'anthropic', model_name: 'claude-3-5-haiku-20241022', temperature: 0.7, max_tokens: 8192, icon: 'anthropic', description: '快速轻量模型', category: 'Anthropic'},

  // Gemini
  {id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini', model_name: 'gemini-2.5-flash', temperature: 0.7, max_tokens: 8192, icon: 'gemini', description: 'Google 快速模型', category: 'Google'},
  {id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'gemini', model_name: 'gemini-2.5-pro', temperature: 0.7, max_tokens: 8192, icon: 'gemini', description: 'Google 旗舰模型', category: 'Google'},
];

export const PROVIDER_BRAND: Record<string, {label: string; color: string; bg: string; letter: string}> = {
  deepseek: {label: 'DeepSeek', color: 'text-cyan-700', bg: 'bg-cyan-50 border-cyan-200', letter: 'D'},
  zhipu: {label: '智谱 GLM', color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200', letter: '智'},
  minimax: {label: 'MiniMax', color: 'text-pink-700', bg: 'bg-pink-50 border-pink-200', letter: 'X'},
  moonshot: {label: 'Kimi', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', letter: 'K'},
  qwen: {label: '通义千问', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', letter: 'Q'},
  openai: {label: 'OpenAI', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', letter: 'O'},
  anthropic: {label: 'Anthropic', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', letter: 'A'},
  gemini: {label: 'Gemini', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', letter: 'G'},
};

export function getProviderBrand(provider: string): string {
  if (provider in PROVIDER_BRAND) return provider;
  return 'openai';
}
