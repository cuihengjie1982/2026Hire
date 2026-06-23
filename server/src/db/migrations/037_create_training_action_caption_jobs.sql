CREATE TABLE IF NOT EXISTS training_action_caption_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  target_url TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  progress INTEGER NOT NULL DEFAULT 0
    CHECK (progress >= 0 AND progress <= 100),
  error TEXT,
  captions JSONB NOT NULL DEFAULT '[]',
  model TEXT,
  input_payload JSONB NOT NULL DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_training_action_caption_jobs_course
  ON training_action_caption_jobs(course_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_training_action_caption_jobs_status
  ON training_action_caption_jobs(status, updated_at DESC);
