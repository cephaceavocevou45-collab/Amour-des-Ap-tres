const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePostgresUrl } = require('./postgres-url.cjs');

test('normalizes Prisma PostgreSQL URLs for native PostgreSQL tools without logging credentials', () => {
  const result = new URL(normalizePostgresUrl('postgresql://paroisse:test-only%40value@localhost:5432/paroisse?schema=public&sslmode=require'));
  assert.equal(result.searchParams.has('schema'), false);
  assert.equal(result.searchParams.get('sslmode'), 'require');
  assert.equal(result.username, 'paroisse');
  assert.equal(result.password, 'test-only%40value');
  assert.equal(result.pathname, '/paroisse');
});

test('rejects invalid PostgreSQL URLs', () => {
  assert.throws(() => normalizePostgresUrl('not-a-url'), /URL PostgreSQL invalide/);
  assert.throws(() => normalizePostgresUrl('https://localhost/db'), /URL PostgreSQL invalide/);
});
