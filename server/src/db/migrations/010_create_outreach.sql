CREATE TABLE outreach_campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(300) NOT NULL,
  position_id  UUID REFERENCES positions(id),
  status       VARCHAR(20) NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'running', 'paused', 'completed')),
  target_count INTEGER NOT NULL DEFAULT 0,
  reply_rate   NUMERIC(5,2),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE outreach_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id    UUID REFERENCES candidates(id),
  candidate_name  VARCHAR(200),
  candidate_email VARCHAR(320),
  position_id     UUID REFERENCES positions(id),
  position_name   VARCHAR(300),
  type            VARCHAR(50) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'sent', 'replied', 'failed')),
  subject         VARCHAR(500),
  content         TEXT,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_outreach_records_candidate ON outreach_records(candidate_id);
