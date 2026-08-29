-- Add independent scene classification and publication review workflow.
-- This migration does not update any training_courses row or stored media URL.

DO $$
DECLARE
  check_constraint RECORD;
BEGIN
  -- The first taxonomy migration created two checks that only allowed task/quality.
  -- Replace those checks so scene options can be stored without changing existing IDs.
  FOR check_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.training_video_taxonomy_options'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%kind%'
  LOOP
    EXECUTE format('ALTER TABLE public.training_video_taxonomy_options DROP CONSTRAINT %I', check_constraint.conname);
  END LOOP;
END $$;

ALTER TABLE public.training_video_taxonomy_options
  ADD CONSTRAINT training_video_taxonomy_options_kind_check
  CHECK (kind IN ('task', 'scene', 'quality'));

ALTER TABLE public.training_video_taxonomy_options
  ADD CONSTRAINT training_video_taxonomy_option_shape
  CHECK (
    (kind IN ('task', 'scene') AND polarity IS NULL)
    OR (kind = 'quality' AND polarity IS NOT NULL)
  );

ALTER TABLE public.training_courses
  ADD COLUMN IF NOT EXISTS video_scene_id uuid,
  ADD COLUMN IF NOT EXISTS video_review_status varchar(20);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'training_courses_video_scene_fkey'
  ) THEN
    ALTER TABLE public.training_courses
      ADD CONSTRAINT training_courses_video_scene_fkey
      FOREIGN KEY (video_scene_id)
      REFERENCES public.training_video_taxonomy_options(id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'training_courses_video_review_status_check'
  ) THEN
    ALTER TABLE public.training_courses
      ADD CONSTRAINT training_courses_video_review_status_check
      CHECK (video_review_status IS NULL OR video_review_status IN ('pending_review', 'approved', 'internal', 'published'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS training_courses_video_scene_idx
  ON public.training_courses (video_scene_id) WHERE video_scene_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS training_courses_video_review_status_idx
  ON public.training_courses (video_review_status) WHERE video_review_status IS NOT NULL;

-- Keep legacy options available for existing records, but make the new task taxonomy
-- the default choice for newly created videos. Existing course rows are not changed.
UPDATE public.training_video_taxonomy_options
SET is_active = false, updated_at = now()
WHERE kind = 'task' AND name IN ('清洁', '收纳', '烹饪', '洗涤', '办公操作');

INSERT INTO public.training_video_taxonomy_options (kind, polarity, name, sort_order)
VALUES
  ('task', NULL, '厨房与食材处理', 10),
  ('task', NULL, '清洁与擦拭', 20),
  ('task', NULL, '整理与收纳', 30),
  ('task', NULL, '衣物与织物处理', 40),
  ('task', NULL, '工具使用', 50),
  ('task', NULL, '手工装配', 60),
  ('task', NULL, '美容美发', 70),
  ('task', NULL, '取物与移动', 80),
  ('task', NULL, '办公与设备操作', 90),
  ('task', NULL, '其他/待归类', 100),
  ('scene', NULL, '厨房', 10),
  ('scene', NULL, '客厅', 20),
  ('scene', NULL, '卧室', 30),
  ('scene', NULL, '卫生间', 40),
  ('scene', NULL, '阳台', 50),
  ('scene', NULL, '餐厅', 60),
  ('scene', NULL, '书桌/书房', 70),
  ('scene', NULL, '梳妆区', 80),
  ('scene', NULL, '楼梯/玄关', 90),
  ('scene', NULL, '其他室内', 100),
  ('scene', NULL, '户外', 110),
  ('scene', NULL, '待确认', 120),
  ('quality', 'positive', '动作自然流畅', 15),
  ('quality', 'positive', '场景正确', 75),
  ('quality', 'positive', '视角稳定', 80),
  ('quality', 'positive', '手部清晰可见', 85),
  ('quality', 'negative', '任务无生产意义', 10),
  ('quality', 'negative', '任务跑题或不合逻辑', 20),
  ('quality', 'negative', '手部出画', 30),
  ('quality', 'negative', '手部静止过久', 40),
  ('quality', 'negative', '手部动作不自然', 50),
  ('quality', 'negative', '动作过慢或时长过长', 60),
  ('quality', 'negative', '画面模糊或失焦', 70),
  ('quality', 'negative', '第三人肢体或隐私信息', 80),
  ('quality', 'negative', '摆拍痕迹严重', 90),
  ('quality', 'negative', '场景错误', 100)
ON CONFLICT DO NOTHING;
