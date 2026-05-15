CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(200) NOT NULL,
  email         VARCHAR(320) UNIQUE NOT NULL,
  password_hash VARCHAR(200) NOT NULL,
  role          VARCHAR(50) NOT NULL DEFAULT 'viewer',
  avatar        TEXT,
  phone         VARCHAR(50),
  department    VARCHAR(200),
  status        VARCHAR(20) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'inactive')),
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role  ON users(role);
