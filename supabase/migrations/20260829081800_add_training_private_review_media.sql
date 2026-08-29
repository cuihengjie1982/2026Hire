-- Keep unapproved negative samples private while allowing authenticated reviewers
-- to preview them through short-lived signed URLs.

ALTER TABLE public.training_courses
  ADD COLUMN IF NOT EXISTS video_storage_bucket varchar(100),
  ADD COLUMN IF NOT EXISTS video_storage_path text;

CREATE INDEX IF NOT EXISTS training_courses_video_storage_idx
  ON public.training_courses (video_storage_bucket, video_storage_path)
  WHERE video_storage_bucket IS NOT NULL AND video_storage_path IS NOT NULL;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'training-review-materials',
  'training-review-materials',
  false,
  1073741824,
  ARRAY['video/*']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
