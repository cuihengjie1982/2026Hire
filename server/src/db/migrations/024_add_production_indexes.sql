-- Interview results: frequently filtered by position (stored as VARCHAR)
CREATE INDEX IF NOT EXISTS idx_interview_results_position ON interview_results(position);
-- Sessions: filtered by candidate and status
CREATE INDEX IF NOT EXISTS idx_interview_sessions_candidate_status ON interview_sessions(candidate_id, status);
-- Approval requests: filtered by candidate
CREATE INDEX IF NOT EXISTS idx_approval_requests_candidate_id ON approval_requests(candidate_id);
-- Approval requests: filtered by status
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
-- Candidates: search by name/email
CREATE INDEX IF NOT EXISTS idx_candidates_name_lower ON candidates(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_candidates_email_lower ON candidates(LOWER(email));
-- Interview answer scores: by session
CREATE INDEX IF NOT EXISTS idx_answer_scores_session ON interview_answer_scores(session_id);
