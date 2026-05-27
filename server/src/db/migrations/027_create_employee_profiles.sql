-- Employee recruitment profiles, performance tracking, and competency models
-- Foundation for Training Academy and closed-loop hiring analytics

-- ============================================================================
-- 1. employee_profiles — links a hired candidate to their employment lifecycle
-- ============================================================================
CREATE TABLE employee_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id      UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  name              VARCHAR(200) NOT NULL,
  email             VARCHAR(320),
  phone             VARCHAR(50),

  -- Employment status
  status            VARCHAR(30) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'onboarding', 'probation', 'terminated', 'resigned')),
  hire_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  termination_date  DATE,
  termination_reason TEXT,

  -- Organizational info
  project_id        UUID REFERENCES projects(id) ON DELETE SET NULL,
  position_id       UUID REFERENCES positions(id) ON DELETE SET NULL,
  department        VARCHAR(200),
  manager           VARCHAR(200),

  -- Multi-dimensional attributes (for competency model iteration)
  education         VARCHAR(300),          -- 学历
  major             VARCHAR(200),          -- 专业
  certifications    JSONB DEFAULT '[]',    -- 证书 [{name, date}]
  skills            JSONB DEFAULT '[]',    -- 技能 [{name, level}]
  personality       JSONB DEFAULT '{}',    -- 性格测评结果
  commute_distance  INTEGER,               -- 通勤距离 (km)
  family_status     VARCHAR(100),          -- 家庭情况

  -- Derived analytics (updated periodically)
  interview_score   NUMERIC(5,2),          -- 面试总分
  interview_grade   VARCHAR(10),           -- 面试评级
  interview_weaknesses JSONB DEFAULT '[]', -- 面试薄弱点
  avg_performance   NUMERIC(5,2),          -- 平均绩效
  retention_days    INTEGER,               -- 留任天数 (computed)
  training_score    NUMERIC(5,2),          -- 培训考核分

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_emp_profiles_candidate ON employee_profiles(candidate_id);
CREATE INDEX idx_emp_profiles_status    ON employee_profiles(status);
CREATE INDEX idx_emp_profiles_project   ON employee_profiles(project_id);
CREATE INDEX idx_emp_profiles_position  ON employee_profiles(position_id);

-- ============================================================================
-- 2. employee_performance — periodic performance reviews
-- ============================================================================
CREATE TABLE employee_performance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  period          VARCHAR(20) NOT NULL,        -- e.g. '2026-Q1', '2026-06'
  score           NUMERIC(5,2) NOT NULL,        -- 综合评分
  rating          VARCHAR(20),                  -- S/A/B/C/D
  dimensions      JSONB NOT NULL DEFAULT '[]',  -- [{dimension, score, note}]
  strengths       JSONB DEFAULT '[]',           -- 优势
  weaknesses      JSONB DEFAULT '[]',           -- 待提升
  notes           TEXT,
  reviewer        VARCHAR(200),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(employee_id, period)
);

CREATE INDEX idx_emp_perf_employee ON employee_performance(employee_id);
CREATE INDEX idx_emp_perf_period   ON employee_performance(period);

-- ============================================================================
-- 3. competency_models — position-specific competency derived from top performers
-- ============================================================================
CREATE TABLE competency_models (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id     UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  name            VARCHAR(300) NOT NULL,
  dimensions      JSONB NOT NULL DEFAULT '[]',  -- [{name, weight, description}]
  source_type     VARCHAR(30) NOT NULL DEFAULT 'manual'
                  CHECK (source_type IN ('manual', 'ai_derived', 'statistical')),
  derived_from    JSONB DEFAULT '{}',            -- {employee_ids, avg_score, sample_size}
  version         INTEGER NOT NULL DEFAULT 1,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_competency_position  ON competency_models(position_id);
CREATE INDEX idx_competency_active    ON competency_models(is_active);
