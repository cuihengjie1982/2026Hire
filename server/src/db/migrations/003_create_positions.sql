CREATE TABLE positions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(50) UNIQUE NOT NULL,
  name        VARCHAR(300) NOT NULL,
  category    VARCHAR(50) NOT NULL,
  project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'inactive', 'draft', 'archived')),
  description TEXT,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE position_details (
  position_id   UUID PRIMARY KEY REFERENCES positions(id) ON DELETE CASCADE,
  profile       JSONB NOT NULL DEFAULT '{"mustHave":[],"niceToHave":[],"bonus":[]}',
  scoring_rules JSONB NOT NULL DEFAULT '[]',
  grade_rules   JSONB NOT NULL DEFAULT '[]',
  keyword_rules TEXT NOT NULL DEFAULT '',
  ai_prompt     TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_positions_category ON positions(category);
CREATE INDEX idx_positions_project  ON positions(project_id);
CREATE INDEX idx_positions_status   ON positions(status);
