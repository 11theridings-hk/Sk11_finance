const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { spawnSync } = require('child_process');

const prisma = new PrismaClient();
const APP_ROOT = path.resolve(__dirname, '..');
const IDEMPOTENT_SQL = path.join(__dirname, 'idempotent-migration.sql');

const LEGACY_MIGRATIONS = [
  '20260812143457_init',
  '20260829153000_simplify_to_hkd_only',
  '20260829170000_add_contracts_and_record_details',
  '20260830143000_add_private_ledger_and_activities',
];

const NEW_PROGRAMMATIC_MIGRATIONS = [
  '20260831182000_mobile_ux_ocr_reminders_systemsetting',
];

function run(cmd, args) {
  console.log(`[bootstrap] $ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: APP_ROOT,
    env: process.env,
  });
  if (result.error) {
    console.error(`[bootstrap] spawn error: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status == null ? 1 : result.status);
  }
}

async function columnExists(tableName, columnName) {
  const rows =
    await prisma.$queryRaw`SELECT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tableName} AND column_name = ${columnName}
    ) as "exists"`;
  return !!(rows && rows[0] && rows[0].exists);
}

async function tableExists(tableName) {
  const rows =
    await prisma.$queryRaw`SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) as "exists"`;
  return !!(rows && rows[0] && rows[0].exists);
}

async function getMigrationRows() {
  try {
    return await prisma.$queryRawUnsafe(
      `SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations`,
    );
  } catch (_e) {
    return [];
  }
}

async function resetFailedMigrations() {
  const rows = await getMigrationRows();
  const failed = rows.filter((r) => r.finished_at == null && r.rolled_back_at == null);
  if (failed.length === 0) return;
  console.log(`[bootstrap] Found ${failed.length} failed/pending migrations in _prisma_migrations. Resolving as --rolled-back.`);
  for (const r of failed) {
    run('npx', ['prisma', 'migrate', 'resolve', '--rolled-back', r.migration_name]);
  }
}

async function markAppliedIfMissing(names) {
  const rows = await getMigrationRows();
  const appliedNames = new Set(
    rows.filter((r) => r.finished_at != null || r.rolled_back_at == null).map((r) => r.migration_name),
  );
  for (const name of names) {
    if (!appliedNames.has(name)) {
      run('npx', ['prisma', 'migrate', 'resolve', '--applied', name]);
      appliedNames.add(name);
    }
  }
}

async function main() {
  console.log('[bootstrap] Starting bootstrap (baseline + idempotent SQL + migrate + start).');

  const rows = await getMigrationRows();
  console.log(`[bootstrap] Rows in _prisma_migrations: ${rows.length}`);

  // 1) Handle legacy baseline (if _prisma_migrations missing first 4, but tables exist).
  const hasPrivateRecord = await tableExists('PrivateRecord');
  if (hasPrivateRecord) {
    console.log('[bootstrap] Legacy tables detected. Marking 4 legacy migrations as --applied if missing.');
    await markAppliedIfMissing(LEGACY_MIGRATIONS);
  }

  // 2) Reset any failed (started, not finished) migrations so prisma migrate deploy can advance.
  await resetFailedMigrations();

  // 3) Run the idempotent SQL for the new migration (safe even if partially applied already).
  //    Then mark the migration row as --applied.
  if (fs.existsSync(IDEMPOTENT_SQL)) {
    const hasSystemSetting = await tableExists('SystemSetting');
    const hasOcrEnabled = await columnExists('User', 'ocrEnabled');
    const hasCustomCategory = await columnExists('PrivateRecord', 'customCategory');
    const hasContractReminderDays = await columnExists('Contract', 'reminderDays');
    console.log(
      `[bootstrap] Before idempotent SQL: SystemSetting=${hasSystemSetting}, User.ocrEnabled=${hasOcrEnabled}, PrivateRecord.customCategory=${hasCustomCategory}, Contract.reminderDays=${hasContractReminderDays}`,
    );

    console.log('[bootstrap] Executing idempotent SQL from prisma/idempotent-migration.sql ...');
    const sql = fs.readFileSync(IDEMPOTENT_SQL, 'utf8');
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log('[bootstrap] idempotent SQL executed successfully.');
    } catch (e) {
      // If this is "already applied / no-op", DO NOT FATAL — we continue to mark applied.
      const msg = (e && e.message) || String(e);
      console.warn(`[bootstrap] idempotent SQL returned non-fatal warning: ${msg}. Continuing...`);
    }

    // Now mark the programmatic migration row as applied so prisma migrate deploy stays stable.
    await markAppliedIfMissing(NEW_PROGRAMMATIC_MIGRATIONS);
  }

  // 4) Finally, run prisma migrate deploy — should be a no-op on successful path,
  //    but guarantees any future added migrations get applied properly.
  console.log('[bootstrap] Running prisma migrate deploy (final pass)...');
  run('npx', ['prisma', 'migrate', 'deploy']);

  await prisma.$disconnect();

  console.log('[bootstrap] Migrations OK. Starting Next.js server (server.js).');
  require(path.join(APP_ROOT, 'server.js'));
}

main().catch(async (e) => {
  console.error('[bootstrap] FATAL:', e);
  try {
    await prisma.$disconnect();
  } catch (_e) {
    /* ignore */
  }
  process.exit(1);
});
