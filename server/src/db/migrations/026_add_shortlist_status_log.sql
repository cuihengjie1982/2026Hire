ALTER TABLE shortlist_entries ADD COLUMN status_log JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN shortlist_entries.status_log IS '状态变更历史，每项包含 {status, at} 记录';
