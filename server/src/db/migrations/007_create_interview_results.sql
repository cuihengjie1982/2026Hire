CREATE TABLE interview_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID REFERENCES interview_sessions(id),
  candidate_id    UUID NOT NULL REFERENCES candidates(id),
  candidate_name  VARCHAR(200) NOT NULL,
  candidate_email VARCHAR(320),
  position        VARCHAR(300),
  template_name   VARCHAR(300),
  interview_date  TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_score     NUMERIC(5,2) NOT NULL,
  grade           VARCHAR(20) NOT NULL,
  grade_label     VARCHAR(300),
  dimensions      JSONB NOT NULL DEFAULT '[]',
  duration        INTEGER NOT NULL DEFAULT 0,
  status          VARCHAR(20) NOT NULL DEFAULT 'completed'
                  CHECK (status IN ('completed', 'reviewed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_results_candidate ON interview_results(candidate_id);
CREATE INDEX idx_results_grade     ON interview_results(grade);
CREATE INDEX idx_results_date      ON interview_results(interview_date);
