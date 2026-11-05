const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = file => fs.readFileSync(require('node:path').join(__dirname, file), 'utf8');

test('Railway web is the configurable public Nginx edge and forwards only its edge IP to private API', () => {
  const web = read('railway-web.conf.template');
  const dockerfile = read('Dockerfile.web.railway');
  const nginxMain = read('nginx-main.railway.conf');
  assert.notEqual(web.charCodeAt(0), 0xfeff, 'nginx template must not have a UTF-8 BOM');
  assert.notEqual(nginxMain.charCodeAt(0), 0xfeff, 'nginx main config must not have a UTF-8 BOM');
  assert.match(web, /listen \$\{PORT\};/);
  assert.match(web, /set \$api_private_host \$\{API_PRIVATE_HOST\};/);
  assert.match(dockerfile, /NGINX_ENVSUBST_FILTER=\^\(PORT\|/);
  assert.match(dockerfile, /HEALTHCHECK .*healthz/);
  assert.equal((web.match(/proxy_pass http:\/\/\$api_private_host\$request_uri;/g) || []).length, 3);
  assert.doesNotMatch(web, /proxy_pass http:\/\/\$\{API_PRIVATE_HOST\}/);
  assert.equal((web.match(/proxy_set_header X-Forwarded-For \$http_x_real_ip;/g) || []).length, 3);
  assert.equal((web.match(/proxy_set_header CF-Connecting-IP "";/g) || []).length, 3);
  assert.doesNotMatch(web, /set_real_ip_from|CF-Connecting-IP \$remote_addr|proxy_pass http:\/\/api:3000/);
  assert.match(web, /if \(\$http_x_real_ip = ""\) \{ return 400; \}/);
  assert.equal((nginxMain.match(/limit_(?:req|conn)_zone \$http_x_real_ip/g) || []).length, 3);
  assert.doesNotMatch(nginxMain, /limit_(?:req|conn)_zone \$binary_remote_addr/);
  assert.match(dockerfile, /NGINX_ENVSUBST_FILTER=/);
  for (const variable of ['API_PRIVATE_HOST', 'PROXY_DIAGNOSTICS_ENABLED', 'PROXY_DIAGNOSTIC_TOKEN', 'STAGING_NOINDEX']) assert.match(dockerfile, new RegExp(variable));
  assert.match(dockerfile, /USER 101:101/);
  assert.match(web, /location = \/__ops\/proxy-check/);
  assert.match(web, /PROXY_DIAGNOSTICS_ENABLED/);
  assert.match(web, /\$http_x_proxy_diagnostic_token/);
  assert.match(web, /access_log off/);
  assert.match(nginxMain, /map \$http_x_forwarded_for \$proxy_chain_depth/);
  assert.match(nginxMain, /resolver \[fd12::10\] ipv6=on valid=10s;/);
  assert.match(nginxMain, /worker_processes auto/);
});

test('Railway API runtime omits development and optional packages and keeps migrations separate', () => {
  const api = read('Dockerfile.api');
  const schema = read('../apps/api/prisma/schema.prisma');
  const migrate = read('Dockerfile.migrate.railway');
  assert.match(api, /npm ci --omit=dev --omit=optional/);
  assert.match(api, /AS runtime/);
  assert.match(api, /apk add --no-cache openssl/);
  assert.match(api, /HEALTHCHECK .*\/ready/);
  assert.match(schema, /linux-musl-openssl-3\.0\.x/);
  assert.match(read('../apps/api/src/main.ts'), /process\.env\.PORT \?\?/);
  assert.match(migrate, /USER node/);
  assert.match(migrate, /postgresql-client/);
  assert.match(migrate, /prisma:deploy/);
  assert.doesNotMatch(migrate, /EXPOSE\s+\d/);
  const backup = read('Dockerfile.backup.railway');
  assert.match(backup, /npm ci --omit=dev --omit=optional/);
  assert.match(backup, /postgresql-client/);
  assert.match(backup, /USER node/);
  assert.doesNotMatch(backup, /EXPOSE\s+\d/);
});

test('Railway container runtime uses Node 22 Alpine, openssl and runtime health checks', () => {
  for (const file of ['Dockerfile.api', 'Dockerfile.migrate.railway', 'Dockerfile.ops.railway', 'Dockerfile.backup.railway', 'Dockerfile.web.railway', 'Dockerfile.web.railway.staging']) {
    const dockerfile = read(file);
    assert.match(dockerfile, /FROM node:22-alpine/);
  }
  for (const file of ['Dockerfile.migrate.railway', 'Dockerfile.ops.railway']) assert.match(read(file), /apk add --no-cache openssl/);
  assert.match(read('Dockerfile.web.railway'), /nginx-unprivileged:1\.27-alpine/);
  assert.match(read('Dockerfile.web.railway'), /HEALTHCHECK .*healthz/);
  assert.match(read('../scripts/test-railway-image-runtime.cjs'), /argon2\.hash/);
  assert.match(read('../scripts/test-railway-image-runtime.cjs'), /PrismaClient/);
});

test('staging build is visibly labeled and search engine indexing is disabled', () => {
  const staging = read('Dockerfile.web.railway.staging');
  const template = read('railway-web.conf.template');
  assert.match(staging, /--configuration=staging/);
  assert.match(staging, /STAGING_NOINDEX="noindex, nofollow, noarchive"/);
  assert.match(staging, /PROXY_DIAGNOSTICS_ENABLED=0/);
  assert.match(staging, /HEALTHCHECK .*healthz/);
  assert.match(template, /X-Robots-Tag "\$\{STAGING_NOINDEX\}"/);
});
