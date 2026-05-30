-- Learning Paths: structured multi-course training tracks
-- Supports onboarding, skill development, certification paths, etc.

-- ============================================================================
-- 1. training_paths — learning path definitions
-- ============================================================================
CREATE TABLE training_paths (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           VARCHAR(300) NOT NULL,
  description     TEXT,
  category        VARCHAR(100) NOT NULL DEFAULT '通用',
  level           VARCHAR(20) NOT NULL DEFAULT '初级'
                  CHECK (level IN ('初级', '中级', '高级')),
  is_certified    BOOLEAN NOT NULL DEFAULT false,
  position_id     UUID REFERENCES positions(id) ON DELETE SET NULL,
  cover_image_url VARCHAR(500),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_paths_category ON training_paths(category);
CREATE INDEX idx_training_paths_active   ON training_paths(is_active);
CREATE INDEX idx_training_paths_position ON training_paths(position_id);

-- ============================================================================
-- 2. training_path_courses — courses within a path, with ordering
-- ============================================================================
CREATE TABLE training_path_courses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id         UUID NOT NULL REFERENCES training_paths(id) ON DELETE CASCADE,
  course_id       UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_required     BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(path_id, course_id)
);

CREATE INDEX idx_path_courses_path   ON training_path_courses(path_id);
CREATE INDEX idx_path_courses_course ON training_path_courses(course_id);

-- ============================================================================
-- 3. training_path_enrollments — employee enrollment in a learning path
-- ============================================================================
CREATE TABLE training_path_enrollments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id         UUID NOT NULL REFERENCES training_paths(id) ON DELETE CASCADE,
  candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  status          VARCHAR(20) NOT NULL DEFAULT 'enrolled'
                  CHECK (status IN ('enrolled', 'in_progress', 'completed', 'failed')),
  enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  progress_pct    INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(path_id, candidate_id)
);

CREATE INDEX idx_path_enrollments_candidate ON training_path_enrollments(candidate_id);
CREATE INDEX idx_path_enrollments_path      ON training_path_enrollments(path_id);
CREATE INDEX idx_path_enrollments_status    ON training_path_enrollments(status);
