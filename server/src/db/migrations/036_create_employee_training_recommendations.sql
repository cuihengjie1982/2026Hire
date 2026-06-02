-- Training recommendations linked to employee profiles
CREATE TABLE employee_training_recommendations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  course_id       UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  reason          VARCHAR(50) NOT NULL
                  CHECK (reason IN ('weakness', 'competency_gap', 'performance', 'manual')),
  reason_detail   TEXT,
  priority        INTEGER NOT NULL DEFAULT 5,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'enrolled', 'completed', 'dismissed')),
  enrolled_at     TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(employee_id, course_id, reason)
);

CREATE INDEX idx_training_recs_employee ON employee_training_recommendations(employee_id);
CREATE INDEX idx_training_recs_status   ON employee_training_recommendations(status);
