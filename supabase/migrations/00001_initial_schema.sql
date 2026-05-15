-- ============================================================
-- EM-BOX Recruitment Management System — Consolidated Schema
-- Merged from 25 migration files, adapted for Supabase Auth
--
-- Key changes from original:
--   - users table → profiles (extends auth.users, no password_hash)
--   - token_blacklist dropped (Supabase Auth handles revocation)
--   - All user FK references → profiles(id) = auth.users(id)
--   - outreach_campaigns dropped (migration 025 simplification)
--   - All ALTER TABLE additions from migrations 014-021 inlined
-- ============================================================

-- ── Profiles (replaces users table) ──────────────────────────
CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name          VARCHAR(200) NOT NULL,
  email         VARCHAR(320) UNIQUE NOT NULL,
  role          VARCHAR(50) NOT NULL DEFAULT 'viewer'
                CHECK (role IN ('admin', 'recruiter', 'hiring_manager', 'viewer')),
  avatar        TEXT,
  phone         VARCHAR(50),
  department    VARCHAR(200),
  status        VARCHAR(20) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'inactive')),
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_role  ON profiles(role);

-- ── Projects ─────────────────────────────────────────────────
CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(300) NOT NULL,
  city        VARCHAR(200),
  manager     VARCHAR(200),
  progress    INTEGER NOT NULL DEFAULT 0,
  start_date  DATE,
  end_date    DATE,
  description TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT '筹备中'
              CHECK (status IN ('进行中', '筹备中', '已关闭')),
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_status ON projects(status);

-- ── Positions + Position Details ─────────────────────────────
CREATE TABLE positions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(50) UNIQUE NOT NULL,
  name            VARCHAR(300) NOT NULL,
  category        VARCHAR(50) NOT NULL,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'inactive', 'draft', 'archived')),
  description     TEXT,
  required_count  INTEGER NOT NULL DEFAULT 0,
  delivery_days   INTEGER NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE position_details (
  position_id   UUID PRIMARY KEY REFERENCES positions(id) ON DELETE CASCADE,
  profile       JSONB NOT NULL DEFAULT '{"mustHave":[],"niceToHave":[],"bonus":[]}',
  profile_rules JSONB NOT NULL DEFAULT '[]',
  scoring_rules JSONB NOT NULL DEFAULT '[]',
  grade_rules   JSONB NOT NULL DEFAULT '[]',
  keyword_rules TEXT NOT NULL DEFAULT '',
  ai_prompt     TEXT NOT NULL DEFAULT '',
  base_score_config JSONB DEFAULT '{}'
);

CREATE INDEX idx_positions_category ON positions(category);
CREATE INDEX idx_positions_project  ON positions(project_id);
CREATE INDEX idx_positions_status   ON positions(status);

-- ── Candidates + Tags ────────────────────────────────────────
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

-- Unique constraints (from migration 017)
ALTER TABLE candidates ADD CONSTRAINT uq_candidates_email UNIQUE (email);
CREATE UNIQUE INDEX uq_candidates_name_phone ON candidates (name, phone) WHERE phone IS NOT NULL;

CREATE INDEX idx_candidates_name       ON candidates(name);
CREATE INDEX idx_candidates_position   ON candidates(position_id);
CREATE INDEX idx_candidates_project    ON candidates(project_id);
CREATE INDEX idx_candidates_grade      ON candidates(grade);
CREATE INDEX idx_candidates_name_lower ON candidates(LOWER(name));
CREATE INDEX idx_candidates_email_lower ON candidates(LOWER(email));

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_candidate_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_candidates_updated_at
  BEFORE UPDATE ON candidates
  FOR EACH ROW EXECUTE FUNCTION update_candidate_timestamp();

-- ── Interview Templates + Questions ──────────────────────────
CREATE TABLE interview_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id      UUID REFERENCES positions(id) ON DELETE CASCADE,
  name             VARCHAR(300) NOT NULL,
  version          INTEGER NOT NULL DEFAULT 1,
  status           VARCHAR(20) NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'active', 'inactive')),
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  question_count   INTEGER NOT NULL DEFAULT 0,
  scoring_config   JSONB DEFAULT '{}',
  grade_rules      JSONB DEFAULT '[]',
  created_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE interview_questions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id         UUID NOT NULL REFERENCES interview_templates(id) ON DELETE CASCADE,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  title               VARCHAR(500) NOT NULL,
  prompt              TEXT NOT NULL,
  time_limit_seconds  INTEGER NOT NULL DEFAULT 120,
  group_name          VARCHAR(200) DEFAULT '',
  follow_ups          JSONB DEFAULT '[]',
  scoring_guide       JSONB DEFAULT '{}',
  linked_dimensions   JSONB DEFAULT '[]'
);

CREATE INDEX idx_templates_position ON interview_templates(position_id);
CREATE INDEX idx_templates_status   ON interview_templates(status);
CREATE INDEX idx_questions_template ON interview_questions(template_id);

-- ── Interview Sessions ───────────────────────────────────────
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

CREATE INDEX idx_sessions_candidate        ON interview_sessions(candidate_id);
CREATE INDEX idx_sessions_status           ON interview_sessions(status);
CREATE INDEX idx_sessions_candidate_status ON interview_sessions(candidate_id, status);

-- ── Interview Results ────────────────────────────────────────
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
  question_answers JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_results_candidate ON interview_results(candidate_id);
CREATE INDEX idx_results_grade     ON interview_results(grade);
CREATE INDEX idx_results_date      ON interview_results(interview_date);
CREATE INDEX idx_results_position  ON interview_results(position);

-- ── Interview Answer Scores (per-question AI scoring) ─────────
CREATE TABLE interview_answer_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  question_id     UUID REFERENCES interview_questions(id) ON DELETE SET NULL,
  question_title  VARCHAR(500),
  question_prompt TEXT,
  audio_duration  INTEGER NOT NULL DEFAULT 0,
  transcript      TEXT,
  score           NUMERIC(5,2),
  max_score       NUMERIC(5,2),
  score_reasoning TEXT,
  dimension_scores JSONB DEFAULT '[]',
  scoring_guide_used JSONB DEFAULT '{}',
  llm_model       VARCHAR(100),
  llm_provider    VARCHAR(50),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'transcribing', 'scoring', 'completed', 'failed')),
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_answer_scores_session ON interview_answer_scores(session_id);

-- ── Approval Requests ────────────────────────────────────────
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

CREATE INDEX idx_approvals_status       ON approval_requests(status);
CREATE INDEX idx_approvals_type         ON approval_requests(type);
CREATE INDEX idx_approvals_candidate_id ON approval_requests(candidate_id);

-- ── Shortlist Entries ────────────────────────────────────────
CREATE TABLE shortlist_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id   UUID NOT NULL REFERENCES candidates(id),
  candidate_name VARCHAR(200) NOT NULL,
  role           VARCHAR(200),
  position_id    UUID REFERENCES positions(id),
  position_name  VARCHAR(300),
  project_id     UUID REFERENCES projects(id),
  project_name   VARCHAR(300),
  fit_score      NUMERIC(5,2) NOT NULL DEFAULT 0,
  grade          VARCHAR(10),
  next_step      VARCHAR(200) NOT NULL DEFAULT '待处理',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shortlist_position ON shortlist_entries(position_id);
CREATE INDEX idx_shortlist_project  ON shortlist_entries(project_id);

-- ── Outreach Records (simplified, no campaigns) ──────────────
CREATE TABLE outreach_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id    UUID REFERENCES candidates(id),
  candidate_name  VARCHAR(200),
  position_id     UUID REFERENCES positions(id),
  position_name   VARCHAR(300),
  channel         VARCHAR(50) NOT NULL
                  CHECK (channel IN ('wechat', 'email', 'phone', 'interview', 'other')),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'contacted', 'responded', 'failed')),
  content         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_outreach_records_candidate ON outreach_records(candidate_id);

-- ── Agents ───────────────────────────────────────────────────
CREATE TABLE agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(300) NOT NULL,
  description   TEXT,
  project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,
  project_name  VARCHAR(300),
  role_type     VARCHAR(100),
  type          VARCHAR(50),
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('running', 'pending', 'paused')),
  config        JSONB DEFAULT '{}',
  pushed_today  INTEGER NOT NULL DEFAULT 0,
  approved      INTEGER NOT NULL DEFAULT 0,
  rejected      INTEGER NOT NULL DEFAULT 0,
  pending_count INTEGER NOT NULL DEFAULT 0,
  adoption_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agents_project ON agents(project_id);

-- ── Settings: Notification Settings + Team Invites ───────────
CREATE TABLE notification_settings (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
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

-- ── Contacts ─────────────────────────────────────────────────
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

-- ── AI Model Configs ─────────────────────────────────────────
CREATE TABLE ai_model_configs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(200) NOT NULL,
  provider      VARCHAR(50) NOT NULL
                CHECK (provider IN ('openai', 'anthropic', 'gemini', 'deepseek', 'zhipu', 'minimax', 'moonshot', 'qwen')),
  model_name    VARCHAR(100) NOT NULL,
  api_key       TEXT NOT NULL,
  base_url      VARCHAR(500),
  temperature   NUMERIC(3,2) DEFAULT 0.7,
  max_tokens    INTEGER DEFAULT 4096,
  is_default    BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_ai_model_configs_default
  ON ai_model_configs(provider) WHERE is_default = true;

-- ── Audit Logs ───────────────────────────────────────────────
CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_email    VARCHAR(255),
  action        VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id   VARCHAR(255),
  details       JSONB DEFAULT '{}',
  ip_address    VARCHAR(45),
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_user    ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action  ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
