-- 年假額度（每年日數）於個人受僱資料
ALTER TABLE "UserProfile" ADD COLUMN IF NOT EXISTS "annualLeaveDaysPerYear" DOUBLE PRECISION DEFAULT 0;
