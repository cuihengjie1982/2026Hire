-- Local Express/PostgreSQL equivalent of the Supabase video taxonomy schema (migration 041).
-- Existing training_courses rows are deliberately left untouched.

CREATE TABLE IF NOT EXISTS training_video_taxonomy_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('task', 'quality')),
  polarity VARCHAR(20) CHECK (polarity IN ('positive', 'negative')),
  name VARCHAR(100) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT training_video_taxonomy_option_shape CHECK (
    (kind = 'task' AND polarity IS NULL)
    OR (kind = 'quality' AND polarity IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS training_video_taxonomy_option_name_uidx
  ON training_video_taxonomy_options (kind, COALESCE(polarity, ''), lower(name));
CREATE INDEX IF NOT EXISTS training_video_taxonomy_option_list_idx
  ON training_video_taxonomy_options (kind, polarity, is_active, sort_order, name);

ALTER TABLE training_courses
  ADD COLUMN IF NOT EXISTS video_polarity VARCHAR(20),
  ADD COLUMN IF NOT EXISTS video_task_category_id UUID,
  ADD COLUMN IF NOT EXISTS video_severity VARCHAR(20),
  ADD COLUMN IF NOT EXISTS video_review_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_courses_video_polarity_check') THEN
    ALTER TABLE training_courses ADD CONSTRAINT training_courses_video_polarity_check
      CHECK (video_polarity IS NULL OR video_polarity IN ('positive', 'negative'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_courses_video_severity_check') THEN
    ALTER TABLE training_courses ADD CONSTRAINT training_courses_video_severity_check
      CHECK (video_severity IS NULL OR video_severity IN ('minor', 'moderate', 'severe'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_courses_video_task_category_fkey') THEN
    ALTER TABLE training_courses ADD CONSTRAINT training_courses_video_task_category_fkey
      FOREIGN KEY (video_task_category_id) REFERENCES training_video_taxonomy_options(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS training_courses_video_polarity_idx
  ON training_courses (video_polarity) WHERE video_polarity IS NOT NULL;
CREATE INDEX IF NOT EXISTS training_courses_video_task_category_idx
  ON training_courses (video_task_category_id) WHERE video_task_category_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS training_course_video_quality_tags (
  course_id UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES training_video_taxonomy_options(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, tag_id)
);

CREATE INDEX IF NOT EXISTS training_course_video_quality_tags_tag_idx
  ON training_course_video_quality_tags (tag_id, course_id);

INSERT INTO training_video_taxonomy_options (kind, polarity, name, sort_order)
VALUES
  ('task', NULL, '清洁', 10), ('task', NULL, '收纳', 20), ('task', NULL, '烹饪', 30),
  ('task', NULL, '洗涤', 40), ('task', NULL, '办公操作', 50),
  ('quality', 'positive', '动作自然', 10), ('quality', 'positive', '节奏合理', 20),
  ('quality', 'positive', '流程完整', 30), ('quality', 'positive', '操作规范', 40),
  ('quality', 'positive', '连贯高效', 50), ('quality', 'positive', '目标明确', 60),
  ('quality', 'positive', '视角清晰', 70),
  ('quality', 'negative', '摆拍严重', 10), ('quality', 'negative', '动作太慢', 20),
  ('quality', 'negative', '家务不自然', 30), ('quality', 'negative', '步骤遗漏', 40),
  ('quality', 'negative', '操作顺序错误', 50), ('quality', 'negative', '重复或无效动作', 60),
  ('quality', 'negative', '中断过多', 70), ('quality', 'negative', '视角遮挡', 80),
  ('quality', 'negative', '画面不稳定', 90), ('quality', 'negative', '安全风险', 100)
ON CONFLICT DO NOTHING;
