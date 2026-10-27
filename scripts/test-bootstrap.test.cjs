'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assertSafeTarget, databaseIdentity } = require('./test-bootstrap.cjs');

test('test:bootstrap refuses database names without test or bootstrap', () => {
  assert.throws(
    () => assertSafeTarget('postgresql://localhost:5432/paroisse', undefined),
    /doit contenir/,
  );
});

test('test:bootstrap refuses the development database even when its name looks safe', () => {
  const url = 'postgresql://localhost:5432/paroisse_test?schema=public';
  assert.throws(() => assertSafeTarget(url, 'postgresql://localhost:5432/paroisse_test'), /même base/);
  assert.equal(databaseIdentity(new URL(url)), 'localhost:5432:paroisse_test');
});

test('test:bootstrap permits isolated test/bootstrap names without disclosing URL fields', () => {
  const url = assertSafeTarget('postgresql://127.0.0.1:5433/paroisse_bootstrap?schema=public', undefined);
  assert.equal(url.pathname, '/paroisse_bootstrap');
});
