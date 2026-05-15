-- Expand ai_model_configs provider enum to support Chinese mainstream providers
ALTER TABLE ai_model_configs DROP CONSTRAINT ai_model_configs_provider_check;
ALTER TABLE ai_model_configs ADD CONSTRAINT ai_model_configs_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'gemini', 'deepseek', 'zhipu', 'minimax', 'moonshot', 'qwen'));
