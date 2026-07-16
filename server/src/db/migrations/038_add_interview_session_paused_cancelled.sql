-- Add paused/cancelled statuses for interview session lifecycle
ALTER TABLE interview_sessions DROP CONSTRAINT IF EXISTS interview_sessions_status_check;
ALTER TABLE interview_sessions ADD CONSTRAINT interview_sessions_status_check
  CHECK (status IN ('created', 'in_progress', 'paused', 'submitted', 'scored', 'closed', 'cancelled'));
