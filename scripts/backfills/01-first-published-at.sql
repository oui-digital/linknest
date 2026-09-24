-- Phase 1 — run once, right after `pnpm db:push` adds pages.first_published_at.
--
-- Pages that are already live get their original publish time (or creation
-- time as a fallback), so established pages keep being indexed. Pages that
-- were never published stay NULL: they enter search probation on first
-- publish, which is the point.
UPDATE pages
SET first_published_at = COALESCE(published_at, created_at)
WHERE first_published_at IS NULL
  AND published_at IS NOT NULL;
