CREATE TABLE ai_model_configs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(200) NOT NULL,
  provider      VARCHAR(50) NOT NULL
                CHECK (provider IN ('openai', 'anthropic', 'gemini')),
  model_name    VARCHAR(100) NOT NULL,
  api_key       TEXT NOT NULL,
  base_url      VARCHAR(500),
  temperature   NUMERIC(3,2) DEFAULT 0.7,
  max_tokens    INTEGER DEFAULT 4096,
  is_default    BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_ai_model_configs_default
  ON ai_model_configs(provider) WHERE is_default = true;
