DO $$
BEGIN
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
