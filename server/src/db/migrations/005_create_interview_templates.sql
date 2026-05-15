CREATE TABLE interview_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id      UUID REFERENCES positions(id) ON DELETE CASCADE,
  name             VARCHAR(300) NOT NULL,
  version          INTEGER NOT NULL DEFAULT 1,
  status           VARCHAR(20) NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'active', 'inactive')),
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  question_count   INTEGER NOT NULL DEFAULT 0,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE interview_questions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id         UUID NOT NULL REFERENCES interview_templates(id) ON DELETE CASCADE,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  title               VARCHAR(500) NOT NULL,
  prompt              TEXT NOT NULL,
  time_limit_seconds  INTEGER NOT NULL DEFAULT 120
);

CREATE INDEX idx_templates_position ON interview_templates(position_id);
CREATE INDEX idx_templates_status   ON interview_templates(status);
CREATE INDEX idx_questions_template ON interview_questions(template_id);
