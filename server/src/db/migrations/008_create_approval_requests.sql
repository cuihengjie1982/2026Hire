CREATE TABLE approval_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                  VARCHAR(50) NOT NULL DEFAULT 'interview_result',
  candidate_id          UUID REFERENCES candidates(id),
  candidate_name        VARCHAR(200),
  candidate_email       VARCHAR(320),
  position_id           UUID REFERENCES positions(id),
  position_name         VARCHAR(300),
  interview_score       NUMERIC(5,2),
  interview_grade       VARCHAR(20),
  interview_grade_label VARCHAR(300),
  interview_date        TIMESTAMPTZ,
  interview_duration    INTEGER,
  dimension_scores      JSONB DEFAULT '[]',
  status                VARCHAR(20) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requester_name        VARCHAR(200),
  approver_name         VARCHAR(200),
  decided_at            TIMESTAMPTZ,
  decided_comment       TEXT,
  reason                TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_approvals_status ON approval_requests(status);
CREATE INDEX idx_approvals_type   ON approval_requests(type);
