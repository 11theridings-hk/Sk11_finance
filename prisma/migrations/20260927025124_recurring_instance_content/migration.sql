-- Align recurring open periods with public ledger content field for lossless convert.
ALTER TABLE "RecurringInstance" ADD COLUMN IF NOT EXISTS "content" TEXT;
