#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const adminRaw = process.env.PG_ADMIN_URL;
if (!adminRaw) {
  console.error('Définissez temporairement PG_ADMIN_URL avec un compte PostgreSQL administrateur. Aucun secret ne sera affiché.');
  process.exit(2);
}
let admin;
try { admin = new URL(adminRaw); } catch { console.error('PG_ADMIN_URL est mal formée.'); process.exit(2); }
if (!['postgres:', 'postgresql:'].includes(admin.protocol)) { console.error('PG_ADMIN_URL doit utiliser PostgreSQL.'); process.exit(2); }
if (process.env.DATABASE_URL && admin.hostname === new URL(process.env.DATABASE_URL).hostname
  && (admin.port || '5432') === (new URL(process.env.DATABASE_URL).port || '5432')
  && admin.pathname === new URL(process.env.DATABASE_URL).pathname) {
  console.error('PG_ADMIN_URL ne doit pas viser la base applicative de développement.'); process.exit(2);
}

const envFile = path.resolve(__dirname, '../.env');
const password = process.env.PAROISSE_TEST_DB_PASSWORD || randomBytes(32).toString('base64url');
const quoteLiteral = (value) => `'${value.replaceAll("'", "''")}'`;
const psqlEnv = { ...process.env, PGPASSWORD: decodeURIComponent(admin.password) };
const common = ['-X', '-q', '-h', admin.hostname, '-p', admin.port || '5432', '-U', decodeURIComponent(admin.username), '-v', 'ON_ERROR_STOP=1'];
function run(args, input) {
  const result = spawnSync('psql', [...common, ...args], { env: psqlEnv, input, encoding: 'utf8', stdio: ['pipe', 'ignore', 'pipe'] });
  if (result.error || result.status !== 0) {
    console.error('Échec de psql ou des droits PostgreSQL requis. Vérifiez que psql est installé et que PG_ADMIN_URL est valide. Le détail contenant des informations sensibles est masqué.');
    process.exit(2);
  }
}
const role = quoteLiteral(password);
const roleExists = spawnSync('psql', [...common, '-d', 'postgres', '-tAc', "SELECT 1 FROM pg_roles WHERE rolname = 'paroisse_test_user'"], { env: psqlEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
if (roleExists.error || roleExists.status !== 0) { console.error('Connexion à PostgreSQL impossible ou psql absent. Les détails sont masqués.'); process.exit(2); }
run(['-d', 'postgres'], roleExists.stdout.trim() === '1'
  ? `ALTER ROLE paroisse_test_user WITH LOGIN PASSWORD ${role};`
  : `CREATE ROLE paroisse_test_user LOGIN PASSWORD ${role};`);
const databaseExists = spawnSync('psql', [...common, '-d', 'postgres', '-tAc', "SELECT 1 FROM pg_database WHERE datname = 'paroisse_test'"], { env: psqlEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
if (databaseExists.error || databaseExists.status !== 0) { console.error('Lecture de la liste des bases impossible. Les détails sont masqués.'); process.exit(2); }
if (databaseExists.stdout.trim() !== '1') run(['-d', 'postgres'], 'CREATE DATABASE paroisse_test OWNER paroisse_test_user;');
run(['-d', 'postgres'], 'ALTER DATABASE paroisse_test OWNER TO paroisse_test_user;');

const url = `postgresql://paroisse_test_user:${encodeURIComponent(password)}@${admin.hostname}:${admin.port || '5432'}/paroisse_test?schema=public`;
let envText = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
const entry = `TEST_DATABASE_URL=${url}`;
if (/^TEST_DATABASE_URL=.*$/m.test(envText)) envText = envText.replace(/^TEST_DATABASE_URL=.*$/m, entry);
else envText = `${envText}${envText.endsWith('\n') || !envText ? '' : '\n'}${entry}\n`;
fs.writeFileSync(envFile, envText, { mode: 0o600 });
console.log('Base paroisse_test et rôle dédiés prêts. TEST_DATABASE_URL a été enregistrée dans .env (ignoré par Git) ; aucun mot de passe affiché.');
