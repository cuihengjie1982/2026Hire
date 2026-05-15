CREATE TABLE agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(300) NOT NULL,
  description   TEXT,
  project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,
  project_name  VARCHAR(300),
  role_type     VARCHAR(100),
  type          VARCHAR(50),
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('running', 'pending', 'paused')),
  config        JSONB DEFAULT '{}',
  pushed_today  INTEGER NOT NULL DEFAULT 0,
  approved      INTEGER NOT NULL DEFAULT 0,
  rejected      INTEGER NOT NULL DEFAULT 0,
  pending_count INTEGER NOT NULL DEFAULT 0,
  adoption_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agents_project ON agents(project_id);
