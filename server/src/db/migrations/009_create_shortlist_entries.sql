CREATE TABLE shortlist_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id   UUID NOT NULL REFERENCES candidates(id),
  candidate_name VARCHAR(200) NOT NULL,
  role           VARCHAR(200),
  position_id    UUID REFERENCES positions(id),
  position_name  VARCHAR(300),
  project_id     UUID REFERENCES projects(id),
  project_name   VARCHAR(300),
  fit_score      NUMERIC(5,2) NOT NULL DEFAULT 0,
  grade          VARCHAR(10),
  next_step      VARCHAR(200) NOT NULL DEFAULT '待处理',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shortlist_position ON shortlist_entries(position_id);
CREATE INDEX idx_shortlist_project  ON shortlist_entries(project_id);
