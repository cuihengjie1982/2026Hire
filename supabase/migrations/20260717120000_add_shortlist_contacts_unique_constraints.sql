-- Add UNIQUE constraints for shortlist and contacts dedup (production)
-- Strategy: keep the most recent row per (candidate_id, position_id) pair

DELETE FROM shortlist_entries
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY candidate_id, position_id ORDER BY created_at DESC
    ) AS rn
    FROM shortlist_entries
  ) t WHERE t.rn > 1
);

ALTER TABLE shortlist_entries ADD CONSTRAINT shortlist_entries_unique_candidate_position
  UNIQUE (candidate_id, position_id);

COMMENT ON CONSTRAINT shortlist_entries_unique_candidate_position ON shortlist_entries
  IS '确保同一候选人在同一岗位的入围名单中不重复';

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
