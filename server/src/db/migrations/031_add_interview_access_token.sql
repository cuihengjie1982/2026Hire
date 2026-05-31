-- Add access_token to interview_sessions for public candidate interview entry.
-- Token is generated when the recruiter sends the interview invitation.
-- Candidates access the interview via: /interview/{accessToken} (no login required)

ALTER TABLE interview_sessions
  ADD COLUMN access_token VARCHAR(64) UNIQUE;

CREATE INDEX idx_sessions_access_token ON interview_sessions(access_token);
