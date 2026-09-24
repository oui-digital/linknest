-- Phase 2 — run once, right after `pnpm db:push` adds page_moderation_log.seq
-- (and the new nullable users columns, which need no backfill).
-- Run it before deploying the Phase 2 code: until then holds could fold in the
-- arbitrary order the column was filled in.
--
-- 1. Adding seq filled existing rows from page_moderation_log_seq in physical
--    order, which is arbitrary. Renumber them in event order so holds fold
--    correctly, then move the sequence past the highest value.
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM page_moderation_log
)
UPDATE page_moderation_log AS l
SET seq = o.rn
FROM ordered AS o
WHERE l.id = o.id;

SELECT setval(
  'page_moderation_log_seq',
  COALESCE((SELECT max(seq) FROM page_moderation_log), 0) + 1,
  false
);

-- 2. Reinstatements written by hand before holds existed used whatever
--    reason_code the author typed. They meant "lift the takedown", so make
--    them clear every hold, as they did under the old newest-row rule.
UPDATE page_moderation_log
SET reason_code = 'all'
WHERE action = 'reinstated';
