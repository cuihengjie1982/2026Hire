CREATE TABLE candidates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  VARCHAR(200) NOT NULL,
  email                 VARCHAR(320),
  phone                 VARCHAR(50),
  location              VARCHAR(200),
  source                VARCHAR(100),
  project_id            UUID REFERENCES projects(id) ON DELETE SET NULL,
  position_id           UUID REFERENCES positions(id) ON DELETE SET NULL,
  raw_resume_md         TEXT,
  parsed_info           JSONB,
  original_file_base64  TEXT,
  original_file_name    VARCHAR(500),
  score_total           NUMERIC(5,2),
  grade                 VARCHAR(10),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE candidate_tags (
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  tag          VARCHAR(100) NOT NULL,
  PRIMARY KEY (candidate_id, tag)
);

CREATE INDEX idx_candidates_name      ON candidates(name);
CREATE INDEX idx_candidates_position  ON candidates(position_id);
CREATE INDEX idx_candidates_project   ON candidates(project_id);
CREATE INDEX idx_candidates_grade     ON candidates(grade);
