-- Token blacklist for revoking JWTs (logout, password change, account disable)
CREATE TABLE IF NOT EXISTS token_blacklist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jti        VARCHAR(64) NOT NULL UNIQUE,  -- JWT ID claim
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,         -- when the token naturally expires (for cleanup)
  reason     VARCHAR(50) DEFAULT 'logout', -- logout | password_change | admin_revoke
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_token_blacklist_jti ON token_blacklist(jti);
CREATE INDEX idx_token_blacklist_user ON token_blacklist(user_id);
CREATE INDEX idx_token_blacklist_expires ON token_blacklist(expires_at);
