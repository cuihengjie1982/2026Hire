CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_email VARCHAR(255),
  action VARCHAR(100) NOT NULL,  -- e.g., 'login', 'approval.decide', 'candidate.create'
  resource_type VARCHAR(50),      -- e.g., 'candidate', 'approval', 'interview'
  resource_id VARCHAR(255),
  details JSONB DEFAULT '{}',     -- arbitrary key-value details
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
