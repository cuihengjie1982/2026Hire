-- Add profile_rules column to position_details
ALTER TABLE position_details ADD COLUMN IF NOT EXISTS profile_rules JSONB DEFAULT '[]';
