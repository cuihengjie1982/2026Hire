-- 019: Add scoring config to interview templates and extend questions
-- Supports structured interview scoring: dimensions, grade rules, question groups, follow-ups, scoring guides

-- Template-level scoring configuration
ALTER TABLE interview_templates
  ADD COLUMN IF NOT EXISTS scoring_config JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS grade_rules JSONB DEFAULT '[]';

-- Question-level extensions
ALTER TABLE interview_questions
  ADD COLUMN IF NOT EXISTS group_name VARCHAR(200) DEFAULT '',
  ADD COLUMN IF NOT EXISTS follow_ups JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS scoring_guide JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_dimensions JSONB DEFAULT '[]';
