-- Make username lookups case-insensitive
-- Drop the old index and recreate with COLLATE NOCASE for better performance with case-insensitive queries

DROP INDEX IF EXISTS idx_users_username;
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE);
