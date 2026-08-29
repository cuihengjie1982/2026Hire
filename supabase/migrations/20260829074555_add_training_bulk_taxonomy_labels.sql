-- Additional labels used by the positive/negative sample library.
-- This migration only adds taxonomy options; existing course rows are unchanged.

INSERT INTO public.training_video_taxonomy_options (kind, polarity, name, sort_order)
VALUES
  ('task', NULL, '把玩与娱乐', 110),
  ('quality', 'negative', '时长不足', 110),
  ('quality', 'negative', '第三人称视角', 120),
  ('quality', 'negative', '手部过曝', 130)
ON CONFLICT DO NOTHING;
