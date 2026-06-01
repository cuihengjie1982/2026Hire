-- Training Notes: Persistent note-taking linked to video timestamps
CREATE TABLE training_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id   UUID NOT NULL REFERENCES training_enrollments(id) ON DELETE CASCADE,
  candidate_id    UUID NOT NULL,
  video_timestamp INTEGER NOT NULL DEFAULT 0,
  note_title      VARCHAR(500) NOT NULL,
  note_content    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_notes_enrollment ON training_notes(enrollment_id);
CREATE INDEX idx_training_notes_candidate  ON training_notes(candidate_id);
CREATE INDEX idx_training_notes_created    ON training_notes(created_at);