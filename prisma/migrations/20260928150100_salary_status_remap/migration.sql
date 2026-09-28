-- 狀態資料遷移（須在 enum 新值已 commit 之後）
UPDATE "Payroll" SET "status" = 'PENDING_CONFIRM' WHERE "status" = 'SUBMITTED';
UPDATE "Payroll" SET "status" = 'PENDING_PAYMENT' WHERE "status" = 'CONFIRMED';
