-- Conversational AI Interview: supports real-time text chat and digital human video interviews
-- Phase 1: text chat conversational MVP
-- Phase 2: digital human video avatar (via Tavus CVI / similar)

-- ============================================================================
-- 1. Extend interview_templates — add interview mode and conversational config
-- ============================================================================
ALTER TABLE interview_templates
  ADD COLUMN interview_mode VARCHAR(20) NOT NULL DEFAULT 'audio_sequential'
    CHECK (interview_mode IN ('audio_sequential', 'text_chat_conversational', 'video_conversational')),
  ADD COLUMN conversational_config JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN interview_templates.interview_mode IS 'Interview execution mode: audio_sequential (legacy), text_chat_conversational, video_conversational';
COMMENT ON COLUMN interview_templates.conversational_config IS 'Conversational settings: maxDurationMinutes, icebreakerMessage, closingMessage, allowCandidateQuestions, candidateQuestionPrompt, maxFollowUpsPerTopic, transcriptLanguage, avatarConfig';

-- ============================================================================
-- 2. Extend interview_questions — question type and adaptive trigger conditions
-- ============================================================================
ALTER TABLE interview_questions
  ADD COLUMN question_type VARCHAR(20) NOT NULL DEFAULT 'core'
    CHECK (question_type IN ('core', 'follow_up_pool', 'icebreaker', 'closing', 'candidate_qa')),
  ADD COLUMN trigger_condition JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN interview_questions.question_type IS 'core = main topic, follow_up_pool = adaptive follow-up bank, icebreaker/closing = conversational bookends, candidate_qa = candidate question handling';
COMMENT ON COLUMN interview_questions.trigger_condition IS 'Adaptive trigger: {keywords: string[], minAnswerLength: number, sentimentCondition: string, priority: number, maxUses: number}';

-- ============================================================================
-- 3. Extend interview_results — conversation-level metadata
-- ============================================================================
ALTER TABLE interview_results
  ADD COLUMN interview_mode VARCHAR(20) NOT NULL DEFAULT 'audio_sequential',
  ADD COLUMN conversation_transcript TEXT,
  ADD COLUMN conversation_message_count INTEGER DEFAULT 0;

COMMENT ON COLUMN interview_results.interview_mode IS 'Which interview mode produced this result';
COMMENT ON COLUMN interview_results.conversation_transcript IS 'Full conversation transcript (for conversational mode)';
COMMENT ON COLUMN interview_results.conversation_message_count IS 'Total message count in conversation';

-- ============================================================================
-- 4. conversational_interview_sessions — live conversation session state
-- ============================================================================
CREATE TABLE conversational_interview_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  status            VARCHAR(30) NOT NULL DEFAULT 'waiting'
                    CHECK (status IN ('waiting', 'active', 'paused', 'completed', 'abandoned')),
  current_topic     VARCHAR(200),
  topics_covered    JSONB DEFAULT '[]'::jsonb,
  transcript_full   TEXT,
  message_count     INTEGER NOT NULL DEFAULT 0,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN conversational_interview_sessions.topics_covered IS 'Array of {questionId, title, startedAt, completedAt, summary}';
COMMENT ON COLUMN conversational_interview_sessions.transcript_full IS 'Full conversation transcript accumulated incrementally';

CREATE INDEX idx_conv_sessions_session ON conversational_interview_sessions(session_id);
CREATE INDEX idx_conv_sessions_status  ON conversational_interview_sessions(status);

-- ============================================================================
-- 5. conversational_interview_messages — individual messages in a conversation
-- ============================================================================
CREATE TABLE conversational_interview_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conv_session_id   UUID NOT NULL REFERENCES conversational_interview_sessions(id) ON DELETE CASCADE,
  role              VARCHAR(20) NOT NULL CHECK (role IN ('interviewer', 'candidate', 'system')),
  content           TEXT NOT NULL,
  message_type      VARCHAR(30) NOT NULL DEFAULT 'text'
                    CHECK (message_type IN ('text', 'question', 'follow_up', 'clarification', 'icebreaker', 'closing', 'candidate_question', 'system_event')),
  question_id       UUID REFERENCES interview_questions(id) ON DELETE SET NULL,
  metadata_json     JSONB DEFAULT '{}'::jsonb,
  audio_file_url    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN conversational_interview_messages.metadata_json IS '{isStreaming, tokensUsed, latencyMs, ...}';
COMMENT ON COLUMN conversational_interview_messages.audio_file_url IS 'Audio recording URL (Phase 2: voice-to-text mode)';

CREATE INDEX idx_conv_messages_session ON conversational_interview_messages(conv_session_id);
CREATE INDEX idx_conv_messages_created ON conversational_interview_messages(conv_session_id, created_at);

-- ============================================================================
-- 6. conversational_interview_scores — per-conversation scoring results
-- ============================================================================
CREATE TABLE conversational_interview_scores (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conv_session_id   UUID NOT NULL REFERENCES conversational_interview_sessions(id) ON DELETE CASCADE,
  dimension_scores  JSONB NOT NULL DEFAULT '[]'::jsonb,
  overall_score     NUMERIC(5,2),
  strengths         JSONB DEFAULT '[]'::jsonb,
  weaknesses        JSONB DEFAULT '[]'::jsonb,
  summary           TEXT,
  scoring_model     VARCHAR(100),
  scoring_provider  VARCHAR(50),
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'scoring', 'completed', 'failed')),
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN conversational_interview_scores.dimension_scores IS 'Array of {dimension, score, maxScore, reasoning, evidence: [message#N references]}';
COMMENT ON COLUMN conversational_interview_scores.strengths IS 'Array of {title, description, evidence}';
COMMENT ON COLUMN conversational_interview_scores.weaknesses IS 'Array of {title, description, evidence}';

CREATE INDEX idx_conv_scores_session ON conversational_interview_scores(conv_session_id);

-- ============================================================================
-- 7. candidate_questions_asked — candidate reverse-questions to the AI interviewer
-- ============================================================================
CREATE TABLE candidate_questions_asked (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conv_session_id   UUID NOT NULL REFERENCES conversational_interview_sessions(id) ON DELETE CASCADE,
  candidate_question TEXT NOT NULL,
  ai_response        TEXT,
  response_timestamp TIMESTAMPTZ,
  is_answered        BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_candidate_q_conv ON candidate_questions_asked(conv_session_id);
