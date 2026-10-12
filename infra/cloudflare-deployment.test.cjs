const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.join(__dirname);
const compose = fs.readFileSync(path.join(root, 'compose.yaml'), 'utf8');
const web = fs.readFileSync(path.join(root, 'web-static.conf'), 'utf8');
const api = fs.readFileSync(path.join(root, '..', 'apps/api/src/main.ts'), 'utf8');

test('Cloudflare production compose exposes only cloudflared and keeps app and database on private networks', () => {
  const parsed = yaml.load(compose);
  assert.ok(parsed.services.cloudflared && parsed.services.api && parsed.services.web && parsed.services.postgres && parsed.services.migrate);
  assert.match(compose, /^  cloudflared:/m);
  assert.match(compose, /TUNNEL_TOKEN: \$\{CLOUDFLARED_TOKEN:\?Set CLOUDFLARED_TOKEN\}/);
  assert.match(compose, /^  api:/m);
  assert.match(compose, /^  web:/m);
  assert.match(compose, /^  postgres:/m);
  assert.match(compose, /^  migrate:/m);
  assert.doesNotMatch(compose, /^\s+ports:/m);
  assert.match(compose, /data:\s*\n\s+name: amour-des-apotres_data\s*\n\s+internal: true/);
  assert.match(compose, /app:\s*\n\s+name: amour-des-apotres_app\s*\n\s+internal: true/);
  assert.match(compose, /target: runtime/);
  assert.match(compose, /target: migrate/);
  assert.match(compose, /user: "65532:65532"/);
  assert.match(compose, /command: \["tunnel", "--no-autoupdate", "run"\]/);
});

test('only the cloudflared peer may supply client IP; Nginx overwrites forwarded identity headers', () => {
  assert.match(web, /set_real_ip_from 172\.32\.0\.3\/32;/);
  assert.match(web, /real_ip_header CF-Connecting-IP;/);
  assert.match(web, /proxy_set_header X-Forwarded-For \$remote_addr;/);
  assert.match(web, /proxy_set_header CF-Connecting-IP \$remote_addr;/);
  assert.match(api, /isTrustedProxyAddress/);
  assert.doesNotMatch(web, /set_real_ip_from 0\.0\.0\.0\/0/);
});

test('API is not cached; only fingerprinted static assets are immutable-cache eligible', () => {
  assert.match(web, /location \/api\//);
  assert.match(web, /location ~ \^\/\(health\|ready\)\$/);
  assert.match(web, /proxy_cache off;/);
  assert.match(web, /add_header Cache-Control "no-store" always;/);
  assert.match(web, /\[A-Za-z0-9_-\]\{8,\}/);
  assert.match(web, /immutable/);
  assert.match(web, /location = \/index\.html \{ add_header Cache-Control "no-store" always;/);
});
