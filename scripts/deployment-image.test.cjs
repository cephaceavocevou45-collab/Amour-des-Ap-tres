const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const apiPackage = require(path.join(root, 'apps/api/package.json'));
const rootPackage = require(path.join(root, 'package.json'));
const dockerfile = fs.readFileSync(path.join(root, 'infra/Dockerfile.api'), 'utf8');
const compose = fs.readFileSync(path.join(root, 'infra/compose.maintenance.yaml'), 'utf8');

test('the API production dependency set keeps Prisma Client and moves Prisma CLI to development', () => {
  assert.ok(apiPackage.dependencies['@prisma/client']);
  assert.ok(apiPackage.devDependencies.prisma);
  assert.equal(apiPackage.dependencies.prisma, undefined);
  assert.equal(apiPackage.dependencies['@nestjs/swagger'], undefined);
});

test('Railpack has a root start command and the API start command targets the compiled entrypoint', () => {
  assert.equal(rootPackage.scripts.start, 'npm run start:prod --workspace @paroisse/api');
  assert.equal(apiPackage.scripts.start, 'npm run start:prod');
  assert.equal(apiPackage.scripts['start:prod'], 'node dist/apps/api/src/main.js');
  assert.match(apiPackage.scripts.build, /nest build/);
});

test('the production image installs runtime dependencies only and guards against CLI/test tools', () => {
  assert.match(dockerfile, /FROM node:22-alpine AS production-dependencies[\s\S]*?RUN npm ci --omit=dev/);
  assert.match(dockerfile, /require\.resolve\(name \+ '\/package\.json'\)/);
  assert.match(dockerfile, /FROM node:22-alpine AS runtime/);
  assert.match(dockerfile, /COPY --from=production-dependencies[\s\S]*?USER node/);
});

test('the separate on-demand migration service uses the migrator credential and CLI image', () => {
  assert.match(dockerfile, /FROM build AS migrate/);
  assert.match(compose, /target: migrate/);
  assert.match(compose, /prisma:deploy/);
  assert.match(compose, /postgresql:\/\/paroisse_migrator:\$\{POSTGRES_MIGRATION_PASSWORD:\?/);
  assert.match(compose, /npm_config_cache: \/tmp\/npm-cache/);
});
