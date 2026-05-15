-- Add uniqueness to prevent duplicate candidates
-- UNIQUE on email: NULLs are treated as distinct by PostgreSQL, so candidates without emails are unaffected
ALTER TABLE candidates ADD CONSTRAINT uq_candidates_email UNIQUE (email);

-- Partial unique index: same name + phone is a duplicate (only when phone is not null)
CREATE UNIQUE INDEX uq_candidates_name_phone ON candidates (name, phone) WHERE phone IS NOT NULL;

-- Updated_at trigger to track latest version
CREATE OR REPLACE FUNCTION update_candidate_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_candidates_updated_at ON candidates;
CREATE TRIGGER trg_candidates_updated_at
  BEFORE UPDATE ON candidates
  FOR EACH ROW EXECUTE FUNCTION update_candidate_timestamp();
