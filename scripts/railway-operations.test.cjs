const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('initial administrator job is idempotent, prompts without echo, and requires first password change', () => {
  const script = read('apps/api/scripts/admin-bootstrap.cjs');
  assert.match(script, /input\.setRawMode\(true\)/);
  assert.match(script, /mustChangePassword: true/);
  assert.match(script, /pg_advisory_xact_lock/);
  assert.match(script, /findFirst\(\{ where: \{ role: UserRole\.SUPER_ADMIN \}/);
  assert.match(script, /Un SUPER_ADMIN existe déjà ; aucune modification effectuée/);
  assert.doesNotMatch(script, /console\.(?:log|error)\([^)]*(?:password|secret)/i);
});

test('database role provisioning never puts existing role passwords into ALTER ROLE or promotes roles', () => {
  const script = read('scripts/db-least-privilege.cjs');
  assert.match(script, /CREATE ROLE %I WITH LOGIN NOINHERIT PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/);
  assert.match(script, /ALTER ROLE %I WITH LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/);
  assert.doesNotMatch(script, /ALTER ROLE %I WITH LOGIN PASSWORD/);
  assert.doesNotMatch(script, /ALTER DATABASE .* OWNER TO/);
});

test('Railway migration and backup jobs stay private and contain only the tools they need', () => {
  const migration = read('infra/Dockerfile.migrate.railway');
  const backup = read('infra/Dockerfile.backup.railway');
  assert.match(migration, /postgresql-client/);
  assert.match(migration, /USER node/);
  assert.match(backup, /npm ci --omit=dev --omit=optional/);
  assert.match(backup, /postgresql-client/);
  assert.match(backup, /USER node/);
  assert.match(backup, /backup-s3\.cjs/);
  assert.doesNotMatch(backup, /EXPOSE\s+\d/);
});

test('staging is visibly marked, noindex, fake-data gated, and proxy diagnostics are token gated and off by default', () => {
  const stagingDocker = read('infra/Dockerfile.web.railway.staging');
  const web = read('infra/railway-web.conf.template');
  const nginxMain = read('infra/nginx-main.railway.conf');
  const component = read('apps/web/src/app/app.component.ts');
  const fakeSeed = read('scripts/seed-staging-fake.cjs');
  assert.match(stagingDocker, /STAGING_NOINDEX="noindex, nofollow, noarchive"/);
  assert.match(stagingDocker, /PROXY_DIAGNOSTICS_ENABLED=0/);
  assert.match(web, /location = \/__ops\/proxy-check/);
  assert.match(web, /\$http_x_proxy_diagnostic_token/);
  assert.match(web, /access_log off/);
  assert.match(nginxMain, /map \$http_x_forwarded_for \$proxy_chain_depth/);
  assert.match(component, /ENVIRONNEMENT DE TEST — DONNÉES FICTIVES UNIQUEMENT/);
  assert.match(fakeSeed, /APP_ENVIRONMENT !== 'staging'/);
  assert.match(fakeSeed, /STAGING_DATABASE_URL/);
  assert.match(fakeSeed, /TEST-FICTIF/);
  assert.doesNotMatch(fakeSeed, /DATABASE_URL\s*=/);
});

test('staging configuration has a dedicated Angular build replacement', () => {
  const angular = JSON.parse(read('apps/web/angular.json'));
  assert.ok(angular.projects.web.architect.build.configurations.staging.fileReplacements.some(item => item.with.endsWith('environment.staging.ts')));
  assert.match(read('apps/web/src/environments/environment.staging.ts'), /isStaging: true/);
});
