CREATE TABLE interview_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  UUID NOT NULL REFERENCES candidates(id),
  template_id   UUID NOT NULL REFERENCES interview_templates(id),
  status        VARCHAR(20) NOT NULL DEFAULT 'created'
                CHECK (status IN ('created', 'in_progress', 'submitted', 'scored', 'closed')),
  started_at    TIMESTAMPTZ,
  submitted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_candidate ON interview_sessions(candidate_id);
CREATE INDEX idx_sessions_status    ON interview_sessions(status);
