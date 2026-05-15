CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(300) NOT NULL,
  city        VARCHAR(200),
  manager     VARCHAR(200),
  progress    INTEGER NOT NULL DEFAULT 0,
  start_date  DATE,
  end_date    DATE,
  description TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT '筹备中'
              CHECK (status IN ('进行中', '筹备中', '已关闭')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_status ON projects(status);
