const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Nginx CSP keeps executable scripts same-origin and limits the inline exception to styles', () => {
  const config = fs.readFileSync(path.join(__dirname, '..', 'infra/nginx-edge.conf'), 'utf8');
  const header = config.match(/Content-Security-Policy\s+"([^"]+)"/i)?.[1];
  assert.ok(header, 'Content-Security-Policy header must be configured');
  const directives = Object.fromEntries(header.split(';').map((part) => {
    const [name, ...values] = part.trim().split(/\s+/);
    return [name, values];
  }));
  assert.deepEqual(directives['script-src'], ["'self'"]);
  assert.ok(!directives['script-src'].includes("'unsafe-inline'"));
  assert.ok(!directives['script-src'].includes("'unsafe-eval'"));
  assert.ok(directives['style-src'].includes("'unsafe-inline'"));
  assert.deepEqual(directives['frame-ancestors'], ["'none'"]);
});
