-- Training Academy: courses, enrollments, and assessments
-- Enables the closed loop: interview → weakness analysis → training → re-interview

-- ============================================================================
-- 1. training_courses — course catalog organized by interview dimension
-- ============================================================================
CREATE TABLE training_courses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 VARCHAR(300) NOT NULL,
  description           TEXT,
  category              VARCHAR(100) NOT NULL DEFAULT '综合',
  difficulty            VARCHAR(20) NOT NULL DEFAULT '初级'
                        CHECK (difficulty IN ('初级', '中级', '高级')),
  duration_minutes      INTEGER NOT NULL DEFAULT 30,
  content               JSONB DEFAULT '[]',
  materials             JSONB DEFAULT '[]',
  assessment_config     JSONB DEFAULT '{}',
  position_id           UUID REFERENCES positions(id) ON DELETE SET NULL,
  competency_dimension  VARCHAR(100),
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_courses_category  ON training_courses(category);
CREATE INDEX idx_training_courses_active    ON training_courses(is_active);
CREATE INDEX idx_training_courses_position  ON training_courses(position_id);

-- ============================================================================
-- 2. training_enrollments — candidate training records
-- ============================================================================
CREATE TABLE training_enrollments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id          UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  candidate_name        VARCHAR(200) NOT NULL,
  course_id             UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  status                VARCHAR(20) NOT NULL DEFAULT 'enrolled'
                        CHECK (status IN ('enrolled', 'in_progress', 'completed', 'failed')),
  enrolled_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ,
  progress_pct          INTEGER NOT NULL DEFAULT 0,
  final_score           NUMERIC(5,2),
  pre_interview_score   NUMERIC(5,2),
  post_interview_score  NUMERIC(5,2),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(candidate_id, course_id)
);

CREATE INDEX idx_training_enrollments_candidate ON training_enrollments(candidate_id);
CREATE INDEX idx_training_enrollments_course    ON training_enrollments(course_id);
CREATE INDEX idx_training_enrollments_status    ON training_enrollments(status);

-- ============================================================================
-- 3. training_assessments — per-enrollment assessment results
-- ============================================================================
CREATE TABLE training_assessments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id   UUID NOT NULL REFERENCES training_enrollments(id) ON DELETE CASCADE,
  score           NUMERIC(5,2) NOT NULL,
  passed          BOOLEAN NOT NULL DEFAULT false,
  answers         JSONB DEFAULT '[]',
  assessor        VARCHAR(200),
  feedback        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_assessments_enrollment ON training_assessments(enrollment_id);
