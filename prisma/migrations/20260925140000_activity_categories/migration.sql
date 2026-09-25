-- AlterTable
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "subCategoryId" TEXT;
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "thirdCategoryId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Activity_categoryId_idx" ON "Activity"("categoryId");
CREATE INDEX IF NOT EXISTS "Activity_subCategoryId_idx" ON "Activity"("subCategoryId");
CREATE INDEX IF NOT EXISTS "Activity_thirdCategoryId_idx" ON "Activity"("thirdCategoryId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Activity" ADD CONSTRAINT "Activity_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Activity" ADD CONSTRAINT "Activity_subCategoryId_fkey"
    FOREIGN KEY ("subCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Activity" ADD CONSTRAINT "Activity_thirdCategoryId_fkey"
    FOREIGN KEY ("thirdCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
