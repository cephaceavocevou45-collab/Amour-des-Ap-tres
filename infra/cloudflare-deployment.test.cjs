const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.join(__dirname);
const compose = fs.readFileSync(path.join(root, 'compose.yaml'), 'utf8');
const web = fs.readFileSync(path.join(root, 'web-static.conf'), 'utf8');
const api = fs.readFileSync(path.join(root, '..', 'apps/api/src/main.ts'), 'utf8');
const networkNames = service => Array.isArray(service.networks) ? service.networks : Object.keys(service.networks ?? {});

test('Cloudflare production compose exposes only cloudflared and keeps app and database on private networks', () => {
  const parsed = yaml.load(compose);
  assert.ok(parsed.services.cloudflared && parsed.services.api && parsed.services.web && parsed.services.postgres && parsed.services.migrate);
  assert.deepEqual(networkNames(parsed.services.web).sort(), ['app', 'tunnel-origin']);
  assert.deepEqual(networkNames(parsed.services.cloudflared).sort(), ['tunnel', 'tunnel-origin']);
  assert.deepEqual(networkNames(parsed.services.api).sort(), ['app', 'data']);
  assert.deepEqual(networkNames(parsed.services.postgres), ['data']);
  assert.deepEqual(networkNames(parsed.services.migrate), ['data']);
  assert.equal(parsed.networks['tunnel-origin'].internal, true);
  assert.match(compose, /^  cloudflared:/m);
  assert.match(compose, /TUNNEL_TOKEN: \$\{CLOUDFLARED_TOKEN:\?Set CLOUDFLARED_TOKEN\}/);
  assert.match(compose, /^  api:/m);
  assert.match(compose, /^  web:/m);
  assert.match(compose, /^  postgres:/m);
  assert.match(compose, /^  migrate:/m);
  assert.doesNotMatch(compose, /^\s+ports:/m);
  assert.match(compose, /data:\s*\n\s+name: amour-des-apotres_data\s*\n\s+internal: true/);
  assert.match(compose, /app:\s*\n\s+name: amour-des-apotres_app\s*\n\s+internal: true/);
  assert.match(compose, /tunnel-origin:\s*\n\s+name: amour-des-apotres_tunnel-origin\s*\n\s+internal: true/);
  assert.match(compose, /172\.33\.0\.2/);
  assert.match(compose, /172\.33\.0\.3/);
  assert.match(compose, /tunnel-origin:\s*\n\s+ipv4_address: 172\.33\.0\.3/);
  assert.match(compose, /target: runtime/);
  assert.match(compose, /target: migrate/);
  assert.match(compose, /user: "65532:65532"/);
  assert.match(compose, /command: \["tunnel", "--no-autoupdate", "run"\]/);
});

test('only the cloudflared peer may supply client IP; Nginx overwrites forwarded identity headers', () => {
  assert.match(web, /listen 172\.33\.0\.2:8080;/);
  assert.doesNotMatch(web, /^\s*listen 8080;/m);
  assert.match(web, /set_real_ip_from 172\.33\.0\.3\/32;/);
  assert.match(web, /real_ip_header CF-Connecting-IP;/);
  assert.match(web, /proxy_set_header X-Forwarded-For \$remote_addr;/);
  assert.match(web, /proxy_set_header CF-Connecting-IP \$remote_addr;/);
  assert.match(api, /isTrustedProxyAddress/);
  assert.doesNotMatch(web, /set_real_ip_from 0\.0\.0\.0\/0/);
});

test('API is not cached; only fingerprinted static assets are immutable-cache eligible', () => {
  assert.match(web, /location \/api\//);
  assert.match(web, /limit_req zone=auth_rate/);
  assert.match(web, /limit_req zone=api_rate/);
  assert.match(web, /location ~ \^\/\(health\|ready\)\$/);
  assert.match(web, /proxy_cache off;/);
  assert.match(web, /proxy_hide_header Content-Security-Policy;/);
  assert.match(web, /proxy_hide_header Strict-Transport-Security;/);
  assert.match(web, /add_header Cache-Control "no-store" always;/);
  assert.match(web, /add_header Pragma "no-cache" always;/);
  assert.match(web, /add_header Strict-Transport-Security .* always;/);
  assert.match(web, /add_header X-Content-Type-Options nosniff always;/);
  assert.match(web, /add_header Referrer-Policy strict-origin-when-cross-origin always;/);
  assert.match(web, /frame-ancestors 'none'/);
  assert.match(web, /\[\.\-\]\[A-Za-z0-9_-\]\{8,\}/);
  assert.match(web, /immutable/);
  const hashedAssetPattern = web.match(/location ~\* (.+) \{/);
  assert.ok(hashedAssetPattern);
  assert.match('main-ABC12345.js', new RegExp(hashedAssetPattern[1]));
  assert.match(web, /location = \/index\.html \{ add_header Cache-Control "no-store" always;/);
});
