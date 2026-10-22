const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname);
const compose = fs.readFileSync(path.join(root, 'compose.yaml'), 'utf8');
const web = fs.readFileSync(path.join(root, 'web-static.conf'), 'utf8');
const api = fs.readFileSync(path.join(root, '..', 'apps/api/src/main.ts'), 'utf8');
function namedBlock(source, key, indent) {
  const lines = source.split(/\r?\n/);
  const heading = new RegExp(`^ {${indent}}${key.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}:\\s*(?:#.*)?$`);
  const start = lines.findIndex(line => heading.test(line));
  if (start < 0) return null;

  const block = [lines[start]];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    const content = line.trimStart();
    const currentIndent = line.length - content.length;
    if (content && !content.startsWith('#') && currentIndent <= indent) break;
    block.push(line);
  }
  return block.join('\n');
}

function serviceBlock(serviceName) {
  const services = namedBlock(compose, 'services', 0);
  return services && namedBlock(services, serviceName, 2);
}

function networkNames(serviceName) {
  const service = serviceBlock(serviceName);
  assert.ok(service, `missing compose service: ${serviceName}`);
  const networks = namedBlock(service, 'networks', 4);
  const line = (networks ?? service).match(/^ {4}networks:\s*(.*)$/m);
  assert.ok(line, `${serviceName} must declare networks`);
  if (line[1].trim().startsWith('[')) {
    return line[1].trim().slice(1, -1).split(',').map(value => value.trim()).filter(Boolean);
  }
  return [...networks.matchAll(/^ {6}([A-Za-z0-9_-]+):(?:\s+\{\})?\s*$/gm)].map(match => match[1]);
}

function networkIsInternal(networkName) {
  const networks = namedBlock(compose, 'networks', 0);
  const network = networks && namedBlock(networks, networkName, 2);
  return !!network && /^ {4}internal:\s*true\s*$/m.test(network);
}

test('Cloudflare production compose exposes only cloudflared and keeps app and database on private networks', () => {
  for (const service of ['cloudflared', 'api', 'web', 'postgres', 'migrate']) assert.ok(serviceBlock(service), `missing compose service: ${service}`);
  assert.deepEqual(networkNames('web').sort(), ['app', 'tunnel-origin']);
  assert.deepEqual(networkNames('cloudflared').sort(), ['tunnel', 'tunnel-origin']);
  assert.deepEqual(networkNames('api').sort(), ['app', 'data']);
  assert.deepEqual(networkNames('postgres'), ['data']);
  assert.deepEqual(networkNames('migrate'), ['data']);
  assert.equal(networkIsInternal('tunnel-origin'), true);
  assert.match(compose, /^  cloudflared:/m);
  assert.match(compose, /TUNNEL_TOKEN: \$\{CLOUDFLARED_TOKEN:\?Set CLOUDFLARED_TOKEN\}/);
  assert.match(compose, /^  api:/m);
  assert.match(compose, /^  web:/m);
  assert.match(compose, /^  postgres:/m);
  assert.match(compose, /^  migrate:/m);
  for (const service of ['cloudflared', 'api', 'web', 'postgres', 'migrate']) {
    assert.doesNotMatch(serviceBlock(service), /^ {4}ports:/m, `${service} must not publish a host port`);
  }
  assert.match(namedBlock(compose, 'data', 2), /^ {4}name: amour-des-apotres_data\s*\n {4}internal: true/m);
  assert.match(namedBlock(compose, 'app', 2), /^ {4}name: amour-des-apotres_app\s*\n {4}internal: true/m);
  assert.match(namedBlock(compose, 'tunnel-origin', 2), /^ {4}name: amour-des-apotres_tunnel-origin\s*\n {4}internal: true/m);
  assert.match(compose, /172\.33\.0\.2/);
  assert.match(compose, /172\.33\.0\.3/);
  assert.match(serviceBlock('cloudflared'), /^ {8}ipv4_address: 172\.33\.0\.3$/m);
  assert.match(serviceBlock('api'), /^ {6}target: runtime$/m);
  assert.match(serviceBlock('migrate'), /^ {6}target: migrate$/m);
  assert.match(serviceBlock('cloudflared'), /^ {4}user: "65532:65532"$/m);
  assert.match(serviceBlock('cloudflared'), /^ {4}command: \["tunnel", "--no-autoupdate", "run"\]$/m);
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
