-- Per-question AI scoring results for interview sessions
CREATE TABLE IF NOT EXISTS interview_answer_scores (
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

CREATE INDEX IF NOT EXISTS idx_answer_scores_session ON interview_answer_scores(session_id);

-- Denormalized summary of per-question answers on the result row
ALTER TABLE interview_results
  ADD COLUMN IF NOT EXISTS question_answers JSONB DEFAULT '[]';
