DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('training-materials', 'training-materials', true, 524288000, NULL)
  ON CONFLICT (id) DO UPDATE
  SET
    public = true,
    file_size_limit = 524288000,
    allowed_mime_types = NULL;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'training_materials_authenticated_insert'
  ) THEN
    CREATE POLICY training_materials_authenticated_insert
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'training-materials'
        AND (storage.foldername(name))[1] = 'materials'
      );
  END IF;
END $$;
