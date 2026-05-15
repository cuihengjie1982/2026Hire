CREATE TABLE notification_settings (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type     VARCHAR(20) NOT NULL CHECK (type IN ('email', 'in_app', 'sms')),
  category VARCHAR(100) NOT NULL,
  enabled  BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE team_invites (
  email      VARCHAR(320) NOT NULL,
  role       VARCHAR(50) NOT NULL,
  status     VARCHAR(20) NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'accepted', 'expired')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invited_by VARCHAR(200),
  PRIMARY KEY (email, role)
);

CREATE INDEX idx_notification_settings_user ON notification_settings(user_id);
