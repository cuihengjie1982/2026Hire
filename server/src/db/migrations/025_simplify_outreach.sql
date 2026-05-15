-- Simplify outreach module: remove campaigns, simplify records

-- Simplify outreach_records: rename type → channel, drop unused columns
ALTER TABLE outreach_records RENAME COLUMN type TO channel;

ALTER TABLE outreach_records DROP COLUMN IF EXISTS candidate_email;
ALTER TABLE outreach_records DROP COLUMN IF EXISTS subject;
ALTER TABLE outreach_records DROP COLUMN IF EXISTS sent_at;

-- Update channel constraint
ALTER TABLE outreach_records DROP CONSTRAINT IF EXISTS outreach_records_type_check;
ALTER TABLE outreach_records ADD CONSTRAINT outreach_records_channel_check
  CHECK (channel IN ('wechat', 'email', 'phone', 'interview', 'other'));

-- Update status constraint
ALTER TABLE outreach_records DROP CONSTRAINT IF EXISTS outreach_records_status_check;
ALTER TABLE outreach_records ADD CONSTRAINT outreach_records_status_check
  CHECK (status IN ('pending', 'contacted', 'responded', 'failed'));

-- Drop campaigns table
DROP TABLE IF EXISTS outreach_campaigns;
