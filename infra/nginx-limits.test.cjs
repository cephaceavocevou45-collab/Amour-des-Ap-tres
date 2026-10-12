const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const main = fs.readFileSync(`${__dirname}/nginx-main.conf`, 'utf8');
const edge = fs.readFileSync(`${__dirname}/nginx-edge.conf`, 'utf8');

test('Nginx defines shared API, strict authentication and connection limits', () => {
  assert.match(main, /limit_req_zone \$binary_remote_addr zone=api_rate:/);
  assert.match(main, /limit_req_zone \$binary_remote_addr zone=auth_rate:/);
  assert.match(main, /limit_conn_zone \$binary_remote_addr zone=api_conn:/);
  assert.match(edge, /location ~ \^\/api\/v1\/auth\/\(login\|admin\/login\|subadmin\/login\|password\/forgot\|password\/reset\)/);
  assert.match(edge, /limit_req zone=auth_rate burst=5 nodelay;/);
  assert.match(edge, /limit_req zone=api_rate burst=60 nodelay;/);
  assert.match(edge, /limit_conn api_conn 20;/);
  assert.match(edge, /add_header Retry-After 60 always;/);
});

test('Nginx bounds slow clients and API body size', () => {
  assert.match(edge, /client_max_body_size 64k;/);
  assert.match(edge, /client_header_timeout 10s;/);
  assert.match(edge, /client_body_timeout 10s;/);
  assert.match(edge, /keepalive_timeout 15s;/);
  assert.match(edge, /send_timeout 10s;/);
});
