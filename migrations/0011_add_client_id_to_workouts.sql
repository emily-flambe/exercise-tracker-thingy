-- No-op migration: client-side ID idempotency uses the existing `id` column.
-- Clients generate UUIDs locally and pass them as `id` on create; the backend
-- treats a POST whose id already belongs to the user as a no-op that returns
-- the existing row. No schema change is required.
SELECT 1;
