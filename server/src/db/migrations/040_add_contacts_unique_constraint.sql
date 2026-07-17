-- Add UNIQUE constraint for contacts dedup
DELETE FROM contacts
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY candidate_id, position_id ORDER BY created_at DESC
    ) AS rn
    FROM contacts
  ) t WHERE t.rn > 1
);

ALTER TABLE contacts ADD CONSTRAINT contacts_unique_candidate_position
  UNIQUE (candidate_id, position_id);

COMMENT ON CONSTRAINT contacts_unique_candidate_position ON contacts
  IS '确保同一候选人在同一岗位的联系人中不重复';
