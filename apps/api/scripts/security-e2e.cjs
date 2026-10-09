const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.error('Définissez TEST_DATABASE_URL vers une base PostgreSQL dédiée dont le nom contient test.');
  process.exit(2);
}

function parseSafe(value, label) {
  try { return new URL(value); }
  catch {
    console.error(`${label} est mal formée. Vérifiez-la localement sans partager sa valeur.`);
    process.exit(2);
  }
}

function target(value) {
  const url = parseSafe(value, 'URL PostgreSQL');
  const host = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname.toLowerCase())
    ? 'loopback'
    : url.hostname.toLowerCase();
  return `${host}:${url.port || '5432'}${url.pathname}`.toLowerCase();
}

if (!parseSafe(testUrl, 'TEST_DATABASE_URL').pathname.toLowerCase().includes('test')) {
  console.error('Refus de lancer les tests : le nom de TEST_DATABASE_URL doit contenir test.');
  process.exit(2);
}
if (process.env.DATABASE_URL && target(testUrl) === target(process.env.DATABASE_URL)) {
  console.error('Refus de lancer les tests sur la même base que DATABASE_URL.');
  process.exit(2);
}

process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ??= 'security-e2e-only-jwt-secret-not-for-deployment';
process.env.TOTP_ENCRYPTION_KEY ??= 'security-e2e-only-totp-key-not-for-deployment';
process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=4096`.trim();

const root = path.resolve(__dirname, '../../../');
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, env: process.env, stdio: 'inherit' });
  return result.status ?? 1;
}

const generateStatus = run([
  path.join(root, 'apps/api/scripts/prisma-cli.cjs'),
  'generate', '--schema', 'apps/api/prisma/schema.prisma',
]);
if (generateStatus !== 0) process.exit(generateStatus);

const migrationStatus = run([
  path.join(root, 'apps/api/scripts/prisma-cli.cjs'),
  'migrate', 'deploy', '--schema', 'apps/api/prisma/schema.prisma',
]);
if (migrationStatus !== 0) process.exit(migrationStatus);

function findE2eFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findE2eFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.e2e-spec.ts') ? [fullPath] : [];
  });
}

const jest = path.join(root, 'node_modules/jest/bin/jest.js');
const config = path.join(root, 'apps/api/test/jest-e2e.json');
const onlyFile = process.argv.find((argument) => argument.startsWith('--only='))?.slice('--only='.length);
const files = findE2eFiles(path.join(root, 'apps/api/test')).filter((file) => !onlyFile || path.basename(file) === onlyFile).sort();
if (files.length === 0) {
  console.error('Aucun fichier e2e trouvé.');
  process.exit(2);
}

for (const file of files) {
  console.log(`\nExécution isolée du fichier e2e : ${path.relative(root, file)}`);
  const status = run([jest, '--config', config, '--runInBand', '--runTestsByPath', file]);
  if (status !== 0) process.exit(status);
}
