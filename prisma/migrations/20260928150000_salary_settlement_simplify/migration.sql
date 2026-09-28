-- 薪金結算簡化：新狀態、明細欄位、IOU、稽核、PDF 多附件

-- PayrollStatus 新值（保留舊 SUBMITTED / CONFIRMED）
DO $$ BEGIN ALTER TYPE "PayrollStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "PayrollStatus" ADD VALUE IF NOT EXISTS 'PENDING_CONFIRM'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "PayrollStatus" ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Attachment：PDF 頁面可多筆
DROP INDEX IF EXISTS "Attachment_payrollPdfId_key";
CREATE INDEX IF NOT EXISTS "Attachment_payrollPdfId_idx" ON "Attachment"("payrollPdfId");

-- Payroll 新欄位
ALTER TABLE "Payroll" ADD COLUMN IF NOT EXISTS "remark" TEXT;
ALTER TABLE "Payroll" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "Payroll" ADD COLUMN IF NOT EXISTS "approvedByUserId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Payroll"
    ADD CONSTRAINT "Payroll_approvedByUserId_fkey"
    FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PayrollItem 新欄位
ALTER TABLE "PayrollItem" ADD COLUMN IF NOT EXISTS "origin" TEXT NOT NULL DEFAULT 'ADMIN';
ALTER TABLE "PayrollItem" ADD COLUMN IF NOT EXISTS "occurredOn" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "PayrollItem_payrollId_itemCode_idx" ON "PayrollItem"("payrollId", "itemCode");

-- 狀態遷移另見下一則 migration（PG 同交易內不可立即使用新 enum 值）

-- 稽核
CREATE TABLE IF NOT EXISTS "PayrollAuditLog" (
    "id" TEXT NOT NULL,
    "payrollId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detailJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PayrollAuditLog_payrollId_createdAt_idx" ON "PayrollAuditLog"("payrollId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "PayrollAuditLog"
    ADD CONSTRAINT "PayrollAuditLog_payrollId_fkey"
    FOREIGN KEY ("payrollId") REFERENCES "Payroll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PayrollAuditLog"
    ADD CONSTRAINT "PayrollAuditLog_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- IOU enums
DO $$ BEGIN
  CREATE TYPE "SalaryIouStatus" AS ENUM ('ACTIVE', 'SETTLED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "SalaryIouInstallmentStatus" AS ENUM ('PENDING', 'APPLIED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "SalaryIou" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalAmountHkd" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "status" "SalaryIouStatus" NOT NULL DEFAULT 'ACTIVE',
    "splitMode" TEXT NOT NULL DEFAULT 'EVEN',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalaryIou_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SalaryIou_userId_status_idx" ON "SalaryIou"("userId", "status");
DO $$ BEGIN
  ALTER TABLE "SalaryIou"
    ADD CONSTRAINT "SalaryIou_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SalaryIou"
    ADD CONSTRAINT "SalaryIou_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "SalaryIouInstallment" (
    "id" TEXT NOT NULL,
    "iouId" TEXT NOT NULL,
    "periodIndex" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amountHkd" DOUBLE PRECISION NOT NULL,
    "status" "SalaryIouInstallmentStatus" NOT NULL DEFAULT 'PENDING',
    "payrollId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalaryIouInstallment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SalaryIouInstallment_iouId_status_idx" ON "SalaryIouInstallment"("iouId", "status");
CREATE INDEX IF NOT EXISTS "SalaryIouInstallment_dueDate_status_idx" ON "SalaryIouInstallment"("dueDate", "status");
CREATE INDEX IF NOT EXISTS "SalaryIouInstallment_payrollId_idx" ON "SalaryIouInstallment"("payrollId");
DO $$ BEGIN
  ALTER TABLE "SalaryIouInstallment"
    ADD CONSTRAINT "SalaryIouInstallment_iouId_fkey"
    FOREIGN KEY ("iouId") REFERENCES "SalaryIou"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SalaryIouInstallment"
    ADD CONSTRAINT "SalaryIouInstallment_payrollId_fkey"
    FOREIGN KEY ("payrollId") REFERENCES "Payroll"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
