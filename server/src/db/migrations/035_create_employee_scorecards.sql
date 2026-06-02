-- Unified employee scorecard aggregating interview, training, performance scores
CREATE TABLE employee_scorecards (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id            UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE UNIQUE,

  -- Interview scores (latest, from interview_results via candidate_id)
  interview_score_latest NUMERIC(5,2),
  interview_grade_latest VARCHAR(20),
  interview_date_latest  TIMESTAMPTZ,
  interview_count        INTEGER NOT NULL DEFAULT 0,

  -- Training scores (avg of final_score from training_enrollments)
  training_score_avg     NUMERIC(5,2),
  training_courses_total INTEGER NOT NULL DEFAULT 0,
  training_courses_passed INTEGER NOT NULL DEFAULT 0,
  training_completion_rate NUMERIC(5,2),

  -- Performance scores (avg from employee_performance)
  performance_score_avg  NUMERIC(5,2),
  performance_review_count INTEGER NOT NULL DEFAULT 0,
  performance_latest_rating VARCHAR(5),

  -- Composite score (weighted: 30% interview + 30% training + 40% performance)
  composite_score        NUMERIC(5,2),
  composite_grade        VARCHAR(10),

  -- Competency gap score
  competency_gap_score   NUMERIC(5,2),

  last_recomputed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scorecards_employee ON employee_scorecards(employee_id);
CREATE INDEX idx_scorecards_composite ON employee_scorecards(composite_score DESC);
