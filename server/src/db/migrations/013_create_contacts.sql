CREATE TABLE contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id    UUID REFERENCES candidates(id),
  candidate_name  VARCHAR(200) NOT NULL,
  position_id     UUID REFERENCES positions(id),
  position_name   VARCHAR(300),
  project_id      UUID REFERENCES projects(id),
  project_name    VARCHAR(300),
  outreach_person VARCHAR(200),
  channel         VARCHAR(20) CHECK (channel IN ('wechat', 'email', 'phone')),
  reason          TEXT,
  status          VARCHAR(30) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'contacted', 'responded', 'interview_scheduled', 'hired', 'rejected')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contacts_candidate ON contacts(candidate_id);
CREATE INDEX idx_contacts_status    ON contacts(status);
