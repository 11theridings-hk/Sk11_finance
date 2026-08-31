const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { spawnSync } = require('child_process');

const prisma = new PrismaClient();
const APP_ROOT = path.resolve(__dirname, '..');

const LEGACY_MIGRATIONS = [
  '20260812143457_init',
  '20260829153000_simplify_to_hkd_only',
  '20260829170000_add_contracts_and_record_details',
  '20260830143000_add_private_ledger_and_activities',
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

async function tableExists(tableName) {
  try {
    const rows =
      await prisma.$queryRaw`SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${tableName}
      ) as "exists"`;
    return !!(rows && rows[0] && rows[0].exists);
  } catch (_e) {
    return false;
  }
}

async function getAppliedMigrationNames() {
  try {
    const rows =
      await prisma.$queryRawUnsafe(`SELECT migration_name FROM _prisma_migrations WHERE rolled_back_at IS NULL`);
    return rows.map((r) => r.migration_name);
  } catch (_e) {
    return [];
  }
}

async function main() {
  console.log('[bootstrap] Starting bootstrap (baseline + migrate + start).');

  const applied = await getAppliedMigrationNames();
  console.log(`[bootstrap] Applied migrations (from _prisma_migrations): ${applied.length}`);

  if (applied.length < LEGACY_MIGRATIONS.length) {
    const hasPrivateRecord = await tableExists('PrivateRecord');
    console.log(`[bootstrap] Table "PrivateRecord" exists: ${hasPrivateRecord}`);
    if (hasPrivateRecord) {
      console.log(
        '[bootstrap] Legacy tables exist without _prisma_migrations records. ' +
          'Marking the first 4 migrations as --applied (baseline).',
      );
      for (const name of LEGACY_MIGRATIONS) {
        if (!applied.includes(name)) {
          run('npx', ['prisma', 'migrate', 'resolve', '--applied', name]);
        }
      }
    }
  }

  console.log('[bootstrap] Running prisma migrate deploy...');
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
