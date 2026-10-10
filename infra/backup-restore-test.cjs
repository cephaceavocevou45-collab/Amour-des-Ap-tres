const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { URL } = require('node:url');
const { pgEnvironment, makeEncryptedDump } = require('./backup-s3.cjs');

function fail(message) { throw new Error(message); }
function parseUrl(name) {
  try { return new URL(process.env[name] || ''); }
  catch { fail('Les URLs de base de test sont absentes ou invalides.'); }
}
function identity(url) { return `${url.hostname}:${url.port || '5432'}${url.pathname}`; }
function run(command, args, env, label) {
  const result = spawnSync(command, args, { env, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) fail(`${label} a échoué; aucune URL ni donnée n’a été affichée.`);
  return result.stdout.trim();
}
function tableCount(database, name) {
  const safe = name.replaceAll('"', '""');
  const sql = `SELECT count(*) FROM public."${safe}"`;
  return run('psql', ['--no-password', '--tuples-only', '--no-align', '--command', sql], pgEnvironment(database), 'La comparaison des lignes');
}

async function main() {
  const source = parseUrl('TEST_SOURCE_DATABASE_URL');
  const target = parseUrl('TEST_RESTORE_DATABASE_URL');
  let development;
  try { development = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null; } catch { fail('DATABASE_URL est invalide; aucun test n’a été lancé.'); }
  const sourceName = decodeURIComponent(source.pathname.slice(1));
  const targetName = decodeURIComponent(target.pathname.slice(1));
  if (!/test/i.test(sourceName) || !/test/i.test(targetName) || identity(source) === identity(target) || (development && [identity(source), identity(target)].includes(identity(development)))) {
    fail('Refus : source et restauration doivent être deux bases de test isolées, distinctes de DATABASE_URL.');
  }
  if (!/^[a-zA-Z0-9_]+$/.test(targetName)) fail('Le nom de la base de restauration contient des caractères non admis.');

  const targetEnv = pgEnvironment(target);
  const existingTables = run('psql', ['--no-password', '--tuples-only', '--no-align', '--command', "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'"], targetEnv, 'La vérification de la base cible');
  if (existingTables !== '0') fail('Refus : la base de restauration doit être vide; aucune table n’a été supprimée.');

  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'paroisse-restore-test-'));
  try {
    const encrypted = path.join(temporary, 'backup.enc');
    const restoredDump = path.join(temporary, 'restore.dump');
    await makeEncryptedDump(encrypted, source);
    const decrypt = spawnSync(process.execPath, [path.join(__dirname, 'backup-crypto.cjs'), 'decrypt', encrypted, restoredDump], { env: process.env, stdio: 'ignore', windowsHide: true });
    if (decrypt.error || decrypt.status !== 0) fail('La vérification AES-256-GCM a échoué.');

    run('pg_restore', ['--no-owner', '--exit-on-error', `--dbname=${targetName}`, restoredDump], targetEnv, 'La restauration isolée');
    const sourceEnv = pgEnvironment(source);
    const sourceTables = run('psql', ['--no-password', '--tuples-only', '--no-align', '--command', "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"], sourceEnv, 'La lecture du schéma source').split(/\r?\n/).filter(Boolean);
    const targetTables = run('psql', ['--no-password', '--tuples-only', '--no-align', '--command', "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"], targetEnv, 'La lecture du schéma restauré').split(/\r?\n/).filter(Boolean);
    if (JSON.stringify(sourceTables) !== JSON.stringify(targetTables)) fail('Le schéma restauré ne correspond pas à la source.');
    for (const table of sourceTables) {
      if (!/^[a-zA-Z0-9_]+$/.test(table)) fail('Nom de table non pris en charge par le contrôle automatisé.');
      if (tableCount(source, table) !== tableCount(target, table)) fail('Les comptages de lignes restaurés ne correspondent pas à la source.');
    }
    process.stdout.write(`Restauration chiffrée vérifiée sur une base isolée : ${sourceTables.length} tables, schéma et comptages de lignes identiques.\n`);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

main().catch(error => {
  process.stderr.write(`${error.message || 'Échec du test de restauration.'}\n`);
  process.exitCode = 1;
});
