-- P4-2: Idempotency for resumable platform email sends.
-- UNIQUE (send_id, email) so re-processing the same recipient is a no-op upsert.

-- De-dupe existing rows first (keep the row with a non-null provider_message_id;
-- otherwise keep the highest id).
DELETE r
FROM email_send_recipients r
INNER JOIN (
  SELECT
    send_id,
    email,
    MAX(
      CASE
        WHEN provider_message_id IS NOT NULL AND TRIM(provider_message_id) <> ''
          THEN id
        ELSE NULL
      END
    ) AS prefer_id,
    MAX(id) AS fallback_id
  FROM email_send_recipients
  GROUP BY send_id, email
  HAVING COUNT(*) > 1
) d
  ON r.send_id = d.send_id
 AND r.email = d.email
WHERE r.id <> COALESCE(d.prefer_id, d.fallback_id);

-- Add unique key if missing (idempotent re-run)
SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'email_send_recipients'
    AND INDEX_NAME = 'uq_email_rcpt_send_email'
);

SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE email_send_recipients ADD UNIQUE KEY uq_email_rcpt_send_email (send_id, email)',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
