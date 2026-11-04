-- Keep roadmap history while expiring only advisor conversation messages.
ALTER TABLE learning_advisor_roadmaps
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS learning_advisor_messages_retention_idx
  ON learning_advisor_messages(created_at);
