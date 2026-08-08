-- Existing databases that adopt the baseline may predate invitation locale.
-- Fresh databases receive the column from 0000; IF NOT EXISTS keeps this
-- follow-up migration safe for both paths.
ALTER TABLE "invitations"
  ADD COLUMN IF NOT EXISTS "locale" "user_locale" NOT NULL DEFAULT 'uk';
